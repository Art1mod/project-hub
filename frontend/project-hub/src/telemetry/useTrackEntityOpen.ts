import { useEffect, useRef } from 'react';
import { useOrganization } from '../contexts/OrganizationContext';
import { setTelemetryOrg, track } from './tracker';

export function useTrackEntityOpen(entityType: 'project' | 'task', entityId: string | undefined) {
    const { activeOrgId } = useOrganization();
    const last = useRef<string | null>(null);

    useEffect(() => {
        if (!entityId || !activeOrgId || last.current === entityId) return;
        last.current = entityId;
        // Child effects run before AppLayout's, so on a fresh page load the
        // tracker may not know the org yet. Set it here to be safe.
        setTelemetryOrg(activeOrgId);
        track({ type: 'entity_open', entityType, entityId });
    }, [entityType, entityId, activeOrgId]);
}