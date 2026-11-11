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

  @Get('organizations/:orgId/analytics/attention')
  getAttentionTasks(
      @CurrentUser() user: { userId: string },
      @Param('orgId') orgId: string,
      @Query('projectId') projectId?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
  ) {
      const take = Math.min(20, Math.max(1, Number(limit) || 6));
      const pageNo = Math.max(1, Number(page) || 1);
      return this.analyticsService.getAttentionTasks(user.userId, orgId, projectId, pageNo, take);
  }
}
