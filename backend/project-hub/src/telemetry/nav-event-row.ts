import { Prisma, Role } from '@prisma/client';
import { createHmac } from 'crypto';
import { TelemetryEventDto } from './dto/create-telemetry-batch.dto';
import { normalizeRoute } from './route-normalizer';

export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_FUTURE_MS = 5 * 60 * 1000;

export interface NavEventRowContext {
    sessionId: string;
    variant: string;
    userHash: string;
    tenantHash: string;
    role: Role;
}

// The domain prefix means the same id never produces the same hash in two roles
export function hashId(salt: string, domain: string, value: string): string {
    return createHmac('sha256', salt).update(`${domain}:${value}`).digest('hex').slice(0, 32);
}

/**
 * Turns one client event into a NavEvent row, or returns null for anything that must not be stored.
 * Pure: the clock and salt are passed in, so the simulator can reuse exactly the server's rules.
 */
export function buildNavEventRow(
    e: TelemetryEventDto,
    ctx: NavEventRowContext,
    opts: { now: number; salt: string },
): Prisma.NavEventCreateManyInput | null {
    const { now, salt } = opts;
    const ts = new Date(e.clientTs).getTime();
    if (Number.isNaN(ts) || ts < now - MAX_AGE_MS || ts > now + MAX_FUTURE_MS) return null;

    const toRoute = e.toRoute ? normalizeRoute(e.toRoute) : null;
    const fromRoute = e.fromRoute ? normalizeRoute(e.fromRoute) : null;

    if (e.toRoute && !toRoute) return null;
    if (e.fromRoute && !fromRoute) return null;

    if ((e.type === 'route_change' || e.type === 'link_hover' || e.type === 'page_ready') && !toRoute) return null;

    // entityType and entityId only make sense together
    if (Boolean(e.entityType) !== Boolean(e.entityId)) return null;
    if (e.type === 'entity_open' && !e.entityType) return null;
    if (e.type === 'page_change' && !e.page) return null;
    if (e.type === 'page_ready' && e.latencyMs === undefined) return null;
    if (e.type === 'action' && !e.action) return null;

    return {
        sessionId: ctx.sessionId,
        userHash: ctx.userHash,
        tenantHash: ctx.tenantHash,
        role: ctx.role,
        variant: ctx.variant,
        type: e.type,
        fromRoute,
        toRoute,
        entityType: e.entityType ?? null,
        entityHash: e.entityId ? hashId(salt, `entity:${e.entityType}`, e.entityId) : null,
        dwellMs: e.dwellMs ?? null,
        latencyMs: e.latencyMs ?? null,
        clientTs: new Date(ts),
        page: e.page ?? null,
        bytes: e.bytes ?? null,
        cacheState: e.cacheState ?? null,
        action: e.action ?? null,
    };
}
