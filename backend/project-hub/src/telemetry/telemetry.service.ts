import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTelemetryBatchDto } from './dto/create-telemetry-batch.dto';
import { buildNavEventRow, hashId, NavEventRowContext } from './nav-event-row';

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

    async recordBatch(userId: string, dto: CreateTelemetryBatchDto) {
        if (process.env.TELEMETRY_ENABLED === 'false') return;
        const membership = await this.prisma.membership.findFirst({
            where: { userId, organizationId: dto.orgId },
            select: { role: true },
        });
        if (!membership) throw new NotFoundException('Organization not found or access denied');

        const ctx: NavEventRowContext = {
            sessionId: dto.sessionId,
            variant: dto.variant,
            userHash: hashId(this.salt, 'user', userId),
            tenantHash: hashId(this.salt, 'tenant', dto.orgId),
            role: membership.role,
        };

        const now = Date.now();
        const rows: Prisma.NavEventCreateManyInput[] = [];
        for (const event of dto.events) {
            const row = buildNavEventRow(event, ctx, { now, salt: this.salt });
            if (row) rows.push(row);
        }

        const dropped = dto.events.length - rows.length;
        if (dropped > 0) this.logger.warn(`Dropped ${dropped} invalid event(s) from a batch of ${dto.events.length}`);

        if (rows.length > 0) await this.prisma.navEvent.createMany({ data: rows });
    }
}
