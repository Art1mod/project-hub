// src/telemetry/telemetry.controller.ts
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt_auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TelemetryService } from './telemetry.service';
import { CreateTelemetryBatchDto } from './dto/create-telemetry-batch.dto';
import { UserThrottlerGuard } from './user-throttler.guard';

@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } }) // 30 batches per minute per user
@Controller('telemetry')
export class TelemetryController {
    constructor(private readonly telemetryService: TelemetryService) {}

    @Post('events')
    @HttpCode(204)
    async record(
        @CurrentUser() user: { userId: string },
        @Body() body: CreateTelemetryBatchDto,
    ): Promise<void> {
        await this.telemetryService.recordBatch(user.userId, body);
    }
}