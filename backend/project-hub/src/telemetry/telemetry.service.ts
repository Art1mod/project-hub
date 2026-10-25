import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTelemetryBatchDto, TelemetryEventDto } from './dto/create-telemetry-batch.dto';
import { normalizeRoute } from './route-normalizer';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;

interface BatchContext {
    sessionId: string;
    variant: string;
    userHash: string;
    tenantHash: string;
    role: Role;
}

@Injectable()
export class TelemetryService {
    private readonly logger = new Logger(TelemetryService.name);
    private readonly salt: string;

    constructor(private prisma: PrismaService) {
        const salt = process.env.TELEMETRY_SALT;
        if (!salt || salt.length < 32) {
            throw new Error('TELEMETRY_SALT must be set to at least 32 characters');
        }
        this.salt = salt;
    }

    // The domain prefix means the same id never produces the same hash in two roles
    private hash(domain: string, value: string) {
        return createHmac('sha256', this.salt).update(`${domain}:${value}`).digest('hex').slice(0, 32);
    }

    async recordBatch(userId: string, dto: CreateTelemetryBatchDto) {
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

        if ((e.type === 'route_change' || e.type === 'link_hover') && !toRoute) return null;

        // entityType and entityId only make sense together
        if (Boolean(e.entityType) !== Boolean(e.entityId)) return null;
        if (e.type === 'entity_open' && !e.entityType) return null;

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
        };
    }
}