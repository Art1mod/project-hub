import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt_auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('organizations/:orgId/analytics/workload')
  getWorkloadMetrics(
     @CurrentUser() user: { userId: string },
     @Param('orgId') orgId: string,
     @Query('projectId') projectId?: string,
  ) {
    return this.analyticsService.getWorkloadMetrics(user.userId, orgId, projectId);
  }
}
