import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import { setTelemetryOrg, setTelemetryRoute, track } from './tracker';
import { toRoutePattern } from './routes';

const MAX_DWELL_MS = 86_400_000; // matches the server limit

export function useNavigationTracking() {
    const { pathname } = useLocation();
    const { activeOrgId } = useOrganization();
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
        track({
            type: 'route_change',
            fromRoute: last.current?.route,
            toRoute: route,
            dwellMs: last.current ? Math.min(now - last.current.at, MAX_DWELL_MS) : undefined,
        });

        last.current = { path: pathname, route, at: now };
        setTelemetryRoute(route);
    }, [pathname, activeOrgId]);
}