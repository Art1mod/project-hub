import { getTelemetryRoute, track } from './tracker';
import { toRoutePattern } from './routes';

const HOVER_DELAY_MS = 150;
const COOLDOWN_MS = 2000;
const timers = new Map<string, number>();
const lastSent = new Map<string, number>();

interface Entity {
    entityType: 'project' | 'task';
    entityId: string;
}

/** Spread onto a link or row: <NavLink {...hoverIntent('/projects')} /> */
export function hoverIntent(to: string, entity?: Entity) {
    const cancel = () => {
        const timer = timers.get(to);
        if (timer !== undefined) window.clearTimeout(timer);
        timers.delete(to);
    };

    const emit = () => {
        const toRoute = toRoutePattern(to);
        const fromRoute = getTelemetryRoute();
        if (!toRoute || toRoute === fromRoute) return; // hovering the current page says nothing

        const now = Date.now();
        if (now - (lastSent.get(to) ?? 0) < COOLDOWN_MS) return;
        lastSent.set(to, now);

        track({ type: 'link_hover', fromRoute: fromRoute ?? undefined, toRoute, ...entity });
    };

    return {
        onMouseEnter: () => {
            cancel();
            timers.set(to, window.setTimeout(emit, HOVER_DELAY_MS));
        },
        onMouseLeave: cancel,
        onFocus: emit, // keyboard focus is also a sign of intent
    };
}