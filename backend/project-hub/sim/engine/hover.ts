import { Role } from '@prisma/client';
import { TelemetryEventDto } from '../../src/telemetry/dto/create-telemetry-batch.dto';
import { CAL } from '../calibration';
import { canSeeRoute } from '../permissions';
import { PageRoute } from './cache-model';
import { WorldState } from './world-state';

export interface HoverTarget {
    /** The link's real href; the frontend's cooldown is keyed by it. */
    to: string;
    toRoute: PageRoute;
    entity?: { entityType: 'project' | 'task'; entityId: string; page?: number };
}

export interface HoverView {
    orgId: string;
    role: Role | undefined;
    projectId?: string;
    dashboardFilter?: string;
}

const NAV: PageRoute[] = ['/dashboard', '/projects', '/members', '/invitations', '/settings', '/profile'];

export function navTarget(route: PageRoute): HoverTarget {
    return { to: route, toRoute: route };
}

export function projectRowTarget(projectId: string): HoverTarget {
    return { to: `/projects/${projectId}`, toRoute: '/projects/:id', entity: { entityType: 'project', entityId: projectId } };
}

export function attentionTarget(item: { taskId: string; projectId: string; page: number }): HoverTarget {
    return {
        to: `/projects/${item.projectId}?page=${item.page}&task=${item.taskId}`,
        toRoute: '/projects/:id',
        entity: { entityType: 'task', entityId: item.taskId, page: item.page },
    };
}

/** Dashboard donut: the filtered project (no page), or the projects list when unfiltered. */
export function donutTarget(filter: string | undefined): HoverTarget {
    return filter
        ? { to: `/projects/${filter}`, toRoute: '/projects/:id', entity: { entityType: 'project', entityId: filter } }
        : navTarget('/projects');
}

/** Dashboard status cards (Dashboard.tsx statusDestination): the page where that status group starts. */
function statusCardTargets(world: WorldState, filter: string | undefined): HoverTarget[] {
    if (!filter) return [navTarget('/projects'), navTarget('/projects'), navTarget('/projects')];
    const tasks = world.tasksOf(filter);
    const count = (s: string) => tasks.filter((t) => t.status === s).length;
    const lastPage = Math.max(1, Math.ceil(tasks.length / CAL.tasksPerPage));
    return [0, count('TODO'), count('TODO') + count('IN_PROGRESS')].map((before) => {
        const page = Math.min(Math.floor(before / CAL.tasksPerPage) + 1, lastPage);
        return { to: `/projects/${filter}?page=${page}`, toRoute: '/projects/:id' as const, entity: { entityType: 'project' as const, entityId: filter, page } };
    });
}

/** Every element on `route` that carries hoverIntent. */
export function hoverTargets(route: PageRoute, world: WorldState, view: HoverView): HoverTarget[] {
    const nav = NAV.filter((r) => canSeeRoute(view.role, r)).map(navTarget);
    switch (route) {
        case '/projects':
            return [...nav, ...world.projectsOf(view.orgId).map((p) => projectRowTarget(p.id))];
        case '/dashboard':
            return [
                ...nav,
                donutTarget(view.dashboardFilter),
                ...statusCardTargets(world, view.dashboardFilter),
                ...world.attention(view.orgId, view.dashboardFilter).map(attentionTarget),
            ];
        default:
            return nav;
    }
}

/** frontend/project-hub/src/telemetry/hover.ts: 150 ms intent delay, 2 s cooldown per href, never the current page. */
export class HoverTracker {
    private readonly lastSent = new Map<string, number>();

    /** Earliest start time at which hovering `to` would not be swallowed by the cooldown. */
    readyAt(to: string): number {
        const last = this.lastSent.get(to);
        return last === undefined ? -Infinity : last + CAL.hoverCooldownMs - CAL.hoverDelayMs;
    }

    hover(target: HoverTarget, currentRoute: PageRoute | null, atMs: number): TelemetryEventDto | null {
        if (target.toRoute === currentRoute) return null;
        const emitAt = atMs + CAL.hoverDelayMs;
        if (emitAt - (this.lastSent.get(target.to) ?? -Infinity) < CAL.hoverCooldownMs) return null;
        this.lastSent.set(target.to, emitAt);
        return {
            type: 'link_hover',
            fromRoute: currentRoute ?? undefined,
            toRoute: target.toRoute,
            ...target.entity,
            clientTs: new Date(emitAt).toISOString(),
        } as TelemetryEventDto;
    }
}
