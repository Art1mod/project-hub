import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTelemetryBatchDto, TelemetryEventDto } from './dto/create-telemetry-batch.dto';
import { normalizeRoute } from './route-normalizer';
import { sanitizeDetail } from './detail-schema';
import { TELEMETRY_ORIGINS, TELEMETRY_SCHEMA_VERSION, type TelemetryOrigin } from './telemetry-vocabulary';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;

interface BatchContext {
    sessionId: string;
    variant: string;
    userHash: string;
    tenantHash: string;
    role: Role;
    origin: TelemetryOrigin;
}

@Injectable()
export class TelemetryService {
    private readonly logger = new Logger(TelemetryService.name);
    private readonly salt: string;
    private readonly origin: TelemetryOrigin;

    constructor(private prisma: PrismaService) {
        const salt = process.env.TELEMETRY_SALT;
        if (!salt || salt.length < 32) {
            throw new Error('TELEMETRY_SALT must be set to at least 32 characters');
        }
        this.salt = salt;

        // Set by the server, never by the client. Fail fast like the salt.
        const origin = process.env.TELEMETRY_ORIGIN || 'real';
        if (!(TELEMETRY_ORIGINS as readonly string[]).includes(origin)) {
            throw new Error(`TELEMETRY_ORIGIN must be one of: ${TELEMETRY_ORIGINS.join(', ')}`);
        }
        this.origin = origin as TelemetryOrigin;
    }

    // The domain prefix means the same id never produces the same hash in two roles
    private hash(domain: string, value: string) {
        return createHmac('sha256', this.salt).update(`${domain}:${value}`).digest('hex').slice(0, 32);
    }

    async recordBatch(userId: string, dto: CreateTelemetryBatchDto) {
        if (process.env.TELEMETRY_ENABLED === 'false') return;
        const membership = await this.prisma.membership.findFirst({
            where: { userId, organizationId: dto.orgId },
            select: { role: true },
        });
        if (!membership) throw new NotFoundException('Organization not found or access denied');

        const ctx: BatchContext = {
            sessionId: dto.sessionId,
            variant: dto.variant,
            userHash: this.hash('user', userId),
            tenantHash: this.hash('tenant', dto.orgId),
            role: membership.role,
            origin: this.origin,
        };

        const now = Date.now();
        const rows: Prisma.NavEventCreateManyInput[] = [];
        for (const event of dto.events) {
            const row = this.buildRow(event, ctx, now);
            if (row) rows.push(row);
        }

        const dropped = dto.events.length - rows.length;
        if (dropped > 0) this.logger.warn(`Dropped ${dropped} invalid event(s) from a batch of ${dto.events.length}`);

        if (rows.length > 0) await this.prisma.navEvent.createMany({ data: rows });
    }

    /** Returns null for anything that must not be stored. */
    private buildRow(e: TelemetryEventDto, ctx: BatchContext, now: number): Prisma.NavEventCreateManyInput | null {
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

        // Unknown detail keys are dropped; a known key with an invalid value rejects the event
        const detail = sanitizeDetail(e.type, e.action, e.detail);
        if (!detail.ok) return null;

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
            entityHash: e.entityId ? this.hash(`entity:${e.entityType}`, e.entityId) : null,
            dwellMs: e.dwellMs ?? null,
            latencyMs: e.latencyMs ?? null,
            clientTs: new Date(ts),
            page: e.page ?? null,
            bytes: e.bytes ?? null,
            cacheState: e.cacheState ?? null,
            action: e.action ?? null,
            trigger: e.trigger ?? null,
            position: e.position ?? null,
            detail: detail.detail ?? undefined, // undefined (not Prisma.JsonNull) so the column stays SQL NULL
            origin: ctx.origin,
            schemaVersion: TELEMETRY_SCHEMA_VERSION,
        };
    }
}