import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useOrganization } from '../contexts/OrganizationContext';
import { setTelemetryOrg, track } from './tracker';

type CacheState = 'hit' | 'stale' | 'miss';

function readCacheState(queryClient: QueryClient, queryKey: QueryKey): CacheState {
    const query = queryClient.getQueryCache().find({ queryKey });
    if (!query || query.state.data === undefined) return 'miss';
    return query.isStale() ? 'stale' : 'hit';
}

/**
 * Reports how long the page took to show its main data, and whether that data
 * was already cached. Call once per page, above any early return.
 */
export function usePageReady(route: string, queryKey: QueryKey, isReady: boolean) {
    const queryClient = useQueryClient();
    const { activeOrgId } = useOrganization();
    const [mountedAt] = useState(() => performance.now());
    const [cacheState] = useState(() => readCacheState(queryClient, queryKey));
    const reported = useRef(false);

    useEffect(() => {
        if (!isReady || reported.current || !activeOrgId) return;
        reported.current = true;
        setTelemetryOrg(activeOrgId);
        track({
            type: 'page_ready',
            toRoute: route,
            latencyMs: Math.round(performance.now() - mountedAt),
            cacheState,
        });
    }, [isReady, activeOrgId, route, mountedAt, cacheState]);
}