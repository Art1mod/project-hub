import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import { setTelemetryOrg, setTelemetryRoute, takeHiddenMs, track } from './tracker';
import { toRoutePattern } from './routes';
import { setLastNavTrigger, takePendingTrigger } from './trigger';

const MAX_DWELL_MS = 86_400_000; // matches the server limit

export function useNavigationTracking() {
    const { pathname } = useLocation();
    const { activeOrgId } = useOrganization();
    const navigationType = useNavigationType();
    const last = useRef<{ path: string; route: string; at: number } | null>(null);

    useEffect(() => {
        setTelemetryOrg(activeOrgId);
    }, [activeOrgId]);

    useEffect(() => {
        if (!activeOrgId) return;                    // org not loaded yet
        if (last.current?.path === pathname) return; // same page (org switch, StrictMode re-run)

        const route = toRoutePattern(pathname); 
        if (!route) {
            last.current = null;
            setTelemetryRoute(null);
            return;
        }

        const now = Date.now();

        // A click handler sets the trigger just before navigating. Without one, a
        // history POP (not the first page of the session) is the browser's back/forward.
        const trigger =
            takePendingTrigger() ?? (last.current && navigationType === 'POP' ? 'browser_history' : null);
        setLastNavTrigger(trigger);

        // Always take it so hidden time never carries over into the next page
        const hiddenMs = takeHiddenMs();

        track({
            type: 'route_change',
            fromRoute: last.current?.route,
            toRoute: route,
            dwellMs: last.current ? Math.min(now - last.current.at, MAX_DWELL_MS) : undefined,
            trigger: trigger ?? undefined,
            detail: last.current ? { hiddenMs } : undefined,
        });

        last.current = { path: pathname, route, at: now };
        setTelemetryRoute(route);
    }, [pathname, activeOrgId, navigationType]);
}