import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Status } from '@prisma/client';

@Injectable()
export class AnalyticsService {
    constructor(
        private prisma: PrismaService,
    ) {}

    async getWorkloadMetrics(userId: string, orgId: string, projectId?: string) {
        const organization = await this.prisma.organization.findFirst({
            where: {
                id: orgId,
                memberships: {
                    some: {
                        userId: userId,
                    }
                }
            },
            select: { id: true } 
        });
        
        if (!organization) throw new NotFoundException("Organization not found or access denied");
        
        const taskGroup = await this.prisma.task.groupBy({
            where: {
                project: {
                    organizationId: orgId, 
                    id: projectId,
                }
            },
            by: ['status'],
            _count: { status: true },
        });
        
        const initialMetrics: Record<Status, number> = {
            TODO: 0,
            IN_PROGRESS: 0,
            DONE: 0,
        };

        return taskGroup.reduce((acc, curr) => {
            acc[curr.status as Status] = curr._count.status;
            return acc;
        }, initialMetrics);
    } 
    
    private async assertOrgAccess(userId: string, orgId: string) {
        const organization = await this.prisma.organization.findFirst({
            where: { id: orgId, memberships: { some: { userId } } },
            select: { id: true },
        });
        if (!organization) throw new NotFoundException('Organization not found or access denied');
    }

    async getAttentionTasks(userId: string, orgId: string, projectId?: string) {
        await this.assertOrgAccess(userId, orgId);

        const tasks = await this.prisma.task.findMany({
            where: {
                status: { in: ['TODO', 'IN_PROGRESS'] },
                priority: { in: ['URGENT', 'HIGH'] },
                project: { organizationId: orgId, id: projectId },
            },
            orderBy: [{ priority: 'desc' }, { status: 'asc' }, { title: 'asc' }, { id: 'asc' }],
            take: 6,
            select: {
                id: true,
                title: true,
                status: true,
                priority: true,
                project: { select: { id: true, name: true } },
                assignee: { select: { id: true, email: true } },
            },
        });

        if (tasks.length === 0) return [];

        // Which page of its project's list each task is on. The window function uses the
        // same ordering as the task list (status, priority desc, title, id), so they agree.
        const PER_PAGE = 10; // must match the page size used by ProjectDetails
        const projectIds = [...new Set(tasks.map((t) => t.project.id))];
        const ids = tasks.map((t) => t.id);

        const positions = await this.prisma.$queryRaw<{ id: string; page: number }[]>(Prisma.sql`
            SELECT id, CEIL(rn::numeric / ${PER_PAGE})::int AS page
            FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY "projectId"
                    ORDER BY status ASC, priority DESC, title ASC, id ASC
                ) AS rn
                FROM "Task"
                WHERE "projectId" IN (${Prisma.join(projectIds)})
            ) ranked
            WHERE id IN (${Prisma.join(ids)})
        `);
        const pageById = new Map(positions.map((p) => [p.id, p.page]));

        return tasks.map((t) => ({ ...t, page: pageById.get(t.id) ?? 1 }));
}
}
