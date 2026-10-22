import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Status } from '@prisma/client';

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
}
