import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useOrganization } from '../contexts/OrganizationContext';
import { setTelemetryOrg, track } from './tracker';
import { classifyError } from './classify';

type CacheState = 'hit' | 'stale' | 'miss';

function readCacheState(queryClient: QueryClient, queryKey: QueryKey): CacheState {
    const query = queryClient.getQueryCache().find({ queryKey });
    if (!query || query.state.data === undefined) return 'miss';
    return query.isStale() ? 'stale' : 'hit';
}

/**
 * Reports how long the page took to show its main data, and whether that data
 * was already cached. Call once per page, above any early return.
 *
 * Also reports when the page's main query fails, with a coarse `result`
 * (never the error itself). Pass the query's `error`.
 */
export function usePageReady(route: string, queryKey: QueryKey, isReady: boolean, error?: unknown) {
    const queryClient = useQueryClient();
    const { activeOrgId } = useOrganization();
    const [mountedAt] = useState(() => performance.now());
    const [cacheState] = useState(() => readCacheState(queryClient, queryKey));
    const reported = useRef(false);

    useEffect(() => {
        const failed = !!error;
        if (!(isReady || failed) || reported.current || !activeOrgId) return;
        reported.current = true;
        setTelemetryOrg(activeOrgId);
        track({
            type: 'page_ready',
            toRoute: route,
            latencyMs: Math.round(performance.now() - mountedAt),
            cacheState,
            detail: { result: failed && !isReady ? classifyError(error) : 'ok' },
        });
    }, [isReady, error, activeOrgId, route, mountedAt, cacheState]);
}