import { CacheState, CAL } from '../calibration';
import { groupBySession, StatRow } from '../stats';

export type PageRoute = '/dashboard' | '/projects' | '/projects/:id' | '/members' | '/invitations' | '/settings' | '/profile';

export interface CacheContext {
    orgId: string;
    projectId?: string;
    /** Dashboard project filter; undefined = all projects. */
    dashboardFilter?: string;
}

interface Entry {
    observed: boolean;
    unobservedAt: number;
    invalidated: boolean;
}

type Key = string[];
const k = (...parts: (string | undefined)[]): Key => parts.map((p) => p ?? 'all');
const str = (key: Key) => key.join('|');
const matches = (key: string, prefix: Key) => key === str(prefix) || key.startsWith(str(prefix) + '|');

/** The query key `usePageReady` reads on each page (frontend/project-hub/src/pages/*). */
function mainKey(route: PageRoute, c: CacheContext): Key | null {
    switch (route) {
        case '/dashboard': return k('analytics', 'workload', c.orgId, c.dashboardFilter);
        case '/projects': return k('projects', c.orgId);
        case '/projects/:id': return k('project', c.projectId);
        case '/members': return k('members', c.orgId);
        case '/invitations': return k('invitations', c.orgId);
        default: return null;
    }
}

/** Keys a mounted page keeps observers on. */
function pageKeys(route: PageRoute, c: CacheContext): Key[] {
    switch (route) {
        case '/dashboard':
            return [k('projects', c.orgId), k('analytics', 'workload', c.orgId, c.dashboardFilter), k('analytics', 'attention', c.orgId, c.dashboardFilter)];
        case '/projects/:id':
            return [k('project', c.projectId)];
        default: {
            const main = mainKey(route, c);
            return main ? [main] : [];
        }
    }
}

/** What each mutation's onSuccess invalidates (prefix match), and what it removes outright. */
function invalidations(action: string, c: CacheContext): { invalidate: Key[]; remove: Key[] } {
    switch (action) {
        case 'task_create':
        case 'task_update':
        case 'task_delete':
            return { invalidate: [['tasks', c.projectId ?? 'all'], ['analytics']], remove: [] };
        case 'project_update':
            return { invalidate: [k('project', c.projectId), ['projects']], remove: [] };
        case 'project_create':
            return { invalidate: [k('projects', c.orgId)], remove: [] };
        case 'project_delete':
            return { invalidate: [['projects'], ['analytics']], remove: [k('project', c.projectId), k('tasks', c.projectId)] };
        case 'invitation_create':
            return { invalidate: [['invitations']], remove: [] };
        case 'invitation_cancel':
            return { invalidate: [k('invitations', c.orgId)], remove: [] };
        case 'member_remove':
            return { invalidate: [k('members', c.orgId), ['tasks']], remove: [] };
        default:
            return { invalidate: [], remove: [] };
    }
}

/**
 * Per-session model of the app's TanStack Query cache (v5 defaults: staleTime 0, gcTime 5 min), enough
 * to say what `usePageReady` reads when a page mounts:
 * - miss: never loaded, or unused for more than gcTime
 * - stale: marked out of date by an action, or still observed by the page being left (the new page
 *   renders before the old one unmounts, and with staleTime 0 an observed query reads as stale)
 * - hit: otherwise
 */
export class CacheModel {
    private readonly entries = new Map<string, Entry>();
    private observed = new Set<string>();

    private gc(at: number) {
        for (const [key, e] of this.entries) {
            if (!e.observed && at - e.unobservedAt > CAL.cacheGcMs) this.entries.delete(key);
        }
    }

    mount(route: PageRoute, ctx: CacheContext, at: number): CacheState | null {
        this.gc(at);
        const main = mainKey(route, ctx);
        let state: CacheState | null = null;
        if (main) {
            const e = this.entries.get(str(main));
            state = !e ? 'miss' : e.invalidated || this.observed.has(str(main)) ? 'stale' : 'hit';
        }
        this.observe(route, ctx, at);
        return state;
    }

    /** The mounted page (or its keys) changed without a new page_ready: org switch, dashboard filter. */
    observe(route: PageRoute, ctx: CacheContext, at: number): void {
        this.gc(at);
        const next = new Set(pageKeys(route, ctx).map(str));
        for (const key of this.observed) {
            const e = this.entries.get(key);
            if (e && !next.has(key)) {
                e.observed = false;
                e.unobservedAt = at;
            }
        }
        // Mounted queries (re)fetch, so they are fresh afterwards.
        for (const key of next) this.entries.set(key, { observed: true, unobservedAt: at, invalidated: false });
        this.observed = next;
    }

    /** Opening the task panel loads the members list (AssigneeSelect) without the page keeping it. */
    taskPanelOpened(ctx: CacheContext, at: number): void {
        this.gc(at);
        const key = str(k('members', ctx.orgId));
        if (!this.observed.has(key)) this.entries.set(key, { observed: false, unobservedAt: at, invalidated: false });
    }

    invalidate(action: string, ctx: CacheContext, at: number): void {
        this.gc(at);
        const { invalidate, remove } = invalidations(action, ctx);
        for (const key of [...this.entries.keys()]) {
            if (remove.some((p) => matches(key, p))) {
                this.entries.delete(key);
                continue;
            }
            const e = this.entries.get(key)!;
            // An observed query refetches right away and stays fresh; an unobserved one stays marked.
            if (!e.observed && invalidate.some((p) => matches(key, p))) e.invalidated = true;
        }
    }
}

const RANK: Record<string, number> = { route_change: 0, entity_open: 1, page_ready: 2 };

/**
 * Replays the real sessions' navigation through CacheModel and compares each recorded page_ready
 * cacheState with the model's. Used as the cache model's acceptance check.
 */
export function replayCacheStates(rows: StatRow[]): { total: number; matched: number; mismatches: string[] } {
    let total = 0;
    let matched = 0;
    const mismatches: string[] = [];

    for (const [sessionId, sessionRows] of groupBySession(rows)) {
        const sorted = [...sessionRows].sort((a, b) =>
            a.clientTs.getTime() - b.clientTs.getTime() || (RANK[a.type] ?? 3) - (RANK[b.type] ?? 3));
        const model = new CacheModel();
        const predicted = new Map<string, CacheState | null>();
        let route: PageRoute | null = null;
        let ctx: CacheContext | null = null;

        const projectNear = (t: number) =>
            sorted.find((r) => r.type === 'entity_open' && r.entityType === 'project' && Math.abs(r.clientTs.getTime() - t) <= 100)?.entityHash ?? undefined;

        const firstNav = sorted.find((r) => r.type === 'route_change');
        if (firstNav?.fromRoute) {
            // The session started before the snapshot window: the page being left was already mounted.
            route = firstNav.fromRoute as PageRoute;
            ctx = { orgId: firstNav.tenantHash };
            model.observe(route, ctx, sorted[0].clientTs.getTime());
        }

        for (const r of sorted) {
            const t = r.clientTs.getTime();
            if (route && ctx && r.tenantHash !== ctx.orgId && r.type !== 'route_change') {
                ctx = { ...ctx, orgId: r.tenantHash };
                model.observe(route, ctx, t); // org switch keeps the page mounted with new keys
            }
            if (r.type === 'route_change' && r.toRoute) {
                route = r.toRoute as PageRoute;
                ctx = { orgId: r.tenantHash, projectId: route === '/projects/:id' ? projectNear(t) : undefined };
                predicted.set(route, model.mount(route, ctx, t));
            } else if (r.type === 'entity_open' && r.entityType === 'task' && ctx) {
                model.taskPanelOpened(ctx, t);
            } else if (r.type === 'action' && r.action && ctx) {
                model.invalidate(r.action, ctx, t);
            } else if (r.type === 'page_ready' && r.toRoute) {
                total++;
                const p = predicted.get(r.toRoute as PageRoute);
                if (p === r.cacheState) matched++;
                else mismatches.push(`${sessionId.slice(0, 8)} ${r.clientTs.toISOString()} ${r.toRoute}: recorded ${r.cacheState}, model ${p ?? 'none'}`);
            }
        }
    }
    return { total, matched, mismatches };
}
