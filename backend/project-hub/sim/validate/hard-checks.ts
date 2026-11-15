import 'reflect-metadata'; // the DTO module's class-validator decorators need it, as Nest provides in the app
import { TELEMETRY_ACTIONS, TELEMETRY_CACHE_STATES, TELEMETRY_ENTITY_TYPES, TELEMETRY_EVENT_TYPES } from '../../src/telemetry/dto/create-telemetry-batch.dto';
import { MAX_AGE_MS } from '../../src/telemetry/nav-event-row';
import { CAL } from '../calibration';
import { groupBySession, StatRow } from '../stats';

export interface HardCheck {
    name: string;
    failures: string[];
}

const ROUTES = new Set(['/dashboard', '/projects', '/projects/:id', '/members', '/invitations', '/settings', '/profile']);
const NEEDS_TO_ROUTE = new Set(['route_change', 'link_hover', 'page_ready']);
const MANAGER_ACTIONS = new Set(['project_create', 'project_update', 'project_delete', 'invitation_create', 'invitation_cancel', 'member_remove']);
const MANAGER_ROUTES = new Set(['/invitations']);
const RANK: Record<string, number> = { session_start: 0, route_change: 1, entity_open: 2, page_ready: 3 };
const has = <T extends string>(xs: readonly T[], v: string | null): boolean => v !== null && (xs as readonly string[]).includes(v);

function rowProblems(r: StatRow): string[] {
    const p: string[] = [];
    if (!has(TELEMETRY_EVENT_TYPES, r.type)) p.push(`unknown type ${r.type}`);
    if (r.toRoute !== null && !ROUTES.has(r.toRoute)) p.push(`toRoute ${r.toRoute} not normalized`);
    if (r.fromRoute !== null && !ROUTES.has(r.fromRoute)) p.push(`fromRoute ${r.fromRoute} not normalized`);
    if (NEEDS_TO_ROUTE.has(r.type) && r.toRoute === null) p.push(`${r.type} without toRoute`);
    if ((r.entityType === null) !== (r.entityHash === null)) p.push('entityType without entityHash or the reverse');
    if (r.entityType !== null && !has(TELEMETRY_ENTITY_TYPES, r.entityType)) p.push(`unknown entityType ${r.entityType}`);
    if (r.type === 'entity_open' && r.entityType === null) p.push('entity_open without entity');
    if (r.type === 'page_change' && !(r.page !== null && r.page >= 1)) p.push('page_change without page');
    if (r.type === 'page_ready' && r.latencyMs === null) p.push('page_ready without latencyMs');
    if (r.cacheState !== null && !has(TELEMETRY_CACHE_STATES, r.cacheState)) p.push(`unknown cacheState ${r.cacheState}`);
    if (r.type === 'action' && !has(TELEMETRY_ACTIONS, r.action)) p.push(`action ${r.action} not allowed`);
    if (r.dwellMs !== null && !(r.dwellMs >= 0 && r.dwellMs <= 86_400_000)) p.push(`dwellMs ${r.dwellMs} out of range`);
    if (r.latencyMs !== null && !(r.latencyMs >= 0 && r.latencyMs <= 600_000)) p.push(`latencyMs ${r.latencyMs} out of range`);
    if (r.bytes !== null && !(r.bytes >= 0 && r.bytes <= 100_000_000)) p.push(`bytes ${r.bytes} out of range`);
    if (!['OWNER', 'ADMIN', 'MEMBER'].includes(r.role)) p.push(`unknown role ${r.role}`);
    if (r.createdAt) {
        const lag = r.createdAt.getTime() - r.clientTs.getTime();
        if (lag < 0 || lag > MAX_AGE_MS) p.push(`createdAt - clientTs = ${lag} ms`);
    }
    return p;
}

const sorted = (rows: StatRow[]) =>
    rows.map((r, i) => ({ r, i }))
        .sort((a, b) => a.r.clientTs.getTime() - b.r.clientTs.getTime() || (RANK[a.r.type] ?? 4) - (RANK[b.r.type] ?? 4) || a.i - b.i)
        .map((x) => x.r);

/** The spec §11.1 checks. Every failure names the session (first 8 chars), the event index and what is wrong. */
export function hardChecks(rows: StatRow[]): HardCheck[] {
    const checks: Record<string, string[]> = {
        'rows-valid': [], 'hashes-deterministic': [], 'role-permissions': [], 'ready-follows-route': [],
        'dwell-equals-gap': [], 'no-hover-to-current': [], 'hover-cooldown': [], 'page-change-on-project': [], 'session-start-first': [],
    };
    const fail = (name: string, sessionId: string, i: number, msg: string) => checks[name].push(`${sessionId.slice(0, 8)} #${i}: ${msg}`);

    for (const [sessionId, sessionRows] of groupBySession(rows)) {
        const list = sorted(sessionRows);
        const userHashes = new Set(list.map((r) => r.userHash));
        if (userHashes.size !== 1) fail('hashes-deterministic', sessionId, 0, `${userHashes.size} userHashes in one session`);

        let route: string | null = null;
        let lastRoute: StatRow | null = null;
        const lastHover = new Map<string, number>();

        list.forEach((r, i) => {
            for (const p of rowProblems(r)) fail('rows-valid', sessionId, i, p);
            for (const h of [r.userHash, r.tenantHash, r.entityHash]) {
                if (h !== null && h.length !== 32) fail('hashes-deterministic', sessionId, i, `hash of length ${h.length}`);
            }
            if (r.role === 'MEMBER' && (MANAGER_ACTIONS.has(r.action ?? '') || (r.toRoute !== null && MANAGER_ROUTES.has(r.toRoute)))) {
                fail('role-permissions', sessionId, i, `MEMBER ${r.type} ${r.action ?? r.toRoute}`);
            }
            if (r.type === 'session_start' && i !== 0) fail('session-start-first', sessionId, i, 'session_start is not the first event');

            if (r.type === 'route_change') {
                if (lastRoute && r.dwellMs !== r.clientTs.getTime() - lastRoute.clientTs.getTime()) {
                    fail('dwell-equals-gap', sessionId, i, `dwellMs ${r.dwellMs} vs gap ${r.clientTs.getTime() - lastRoute.clientTs.getTime()}`);
                }
                route = r.toRoute;
                lastRoute = r;
            } else if (r.type === 'page_ready') {
                let j = i - 1;
                while (j >= 0 && list[j].type === 'entity_open') j--;
                if (j < 0 || list[j].type !== 'route_change' || list[j].toRoute !== r.toRoute) {
                    fail('ready-follows-route', sessionId, i, `page_ready ${r.toRoute} not right after its route_change`);
                }
            } else if (r.type === 'link_hover') {
                if (r.toRoute === route || r.fromRoute !== route) fail('no-hover-to-current', sessionId, i, `hover ${r.fromRoute} -> ${r.toRoute} while on ${route}`);
                const key = `${r.toRoute}|${r.entityHash ?? ''}|${r.page ?? ''}`;
                const prev = lastHover.get(key);
                if (prev !== undefined && r.clientTs.getTime() - prev < CAL.hoverCooldownMs) fail('hover-cooldown', sessionId, i, `hover ${key} again after ${r.clientTs.getTime() - prev} ms`);
                lastHover.set(key, r.clientTs.getTime());
            } else if (r.type === 'page_change' && route !== '/projects/:id') {
                fail('page-change-on-project', sessionId, i, `page_change while on ${route}`);
            }
        });
    }
    return Object.entries(checks).map(([name, failures]) => ({ name, failures }));
}
