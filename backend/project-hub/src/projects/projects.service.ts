import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProjectDto } from './dto/update-project.dto';
import { StorageService } from '../storage/storage.service';
import { BulkProjectItemDto } from './dto/bulk-create-projects.dto';

@Injectable()
export class ProjectsService {
    constructor (
        private readonly organizationsService: OrganizationsService, 
        private prisma: PrismaService,
        private storage: StorageService,
    ) {}

    async createProject(userId: string, orgId: string, data: CreateProjectDto) {
        const organization = await this.organizationsService.getOrganizationById(userId, orgId);

        const role = organization.memberships[0].role;
        if (role !== 'OWNER' && role !== 'ADMIN') {
            throw new ForbiddenException('Only owners and admins can create projects');
        }

        return await this.prisma.project.create({
            data: {
                name: data.name,
                description: data.description,
                organizationId: orgId
            },
        });
    }

    async getProjectsByOrg(userId: string, orgId: string) {
        await this.organizationsService.getOrganizationById(userId, orgId);
        
        return await this.prisma.project.findMany({
            where: {
                organizationId: orgId
            }
        });
    }

    async getProjectById(userId: string, projectId: string) {
        const project = await this.prisma.project.findFirst({
            where: {
                id: projectId,
                organization: {
                    memberships: {
                        some: {
                            userId: userId
                        }
                    }
                }
            }
        });

        if (!project) throw new NotFoundException("Project not found or access denied");

        return project;
    }

    async deleteProjectById(userId: string, projectId: string) {
        const project = await this.prisma.project.findFirst({
            where: {
                id: projectId,
                organization: {
                    memberships: {
                        some: {
                            userId: userId,
                            role: { in: ['OWNER', 'ADMIN'] }
                        }
                    }
                }
            }
        });

        if (!project) throw new NotFoundException("Project not found or access denied");   

        const files = await this.prisma.attachment.findMany({
            where: { task: { projectId } },
            select: { storageKey: true },
        });

        const deleted = await this.prisma.project.delete({ where: { id: projectId } });

        await this.storage.deleteManyQuietly(files.map((f) => f.storageKey));
        return deleted;
    }

    async updateProjectById(userId: string, projectId: string, newData: UpdateProjectDto) {
        const project = await this.prisma.project.findFirst({
            where: {
                id: projectId,
                organization: {
                    memberships: {
                        some: {
                            userId: userId,
                            role: { in: ['OWNER', 'ADMIN'] }
                        }
                    }
                }
            }
        });

        if (!project) throw new NotFoundException("Project not found or access denied");   

        return await this.prisma.project.update({
            where: {
                    id: project.id
                },
            data: {
                name: newData.name,
                description: newData.description
            }
            });
    }

    async bulkCreateProjects(userId: string, orgId: string, items: BulkProjectItemDto[]) {
        const organization = await this.organizationsService.getOrganizationById(userId, orgId);
        const role = organization.memberships[0].role;
        if (role !== 'OWNER' && role !== 'ADMIN') {
            throw new ForbiddenException('Only owners and admins can create projects');
        }

        const assigneeIds = [
            ...new Set(items.flatMap((p) => (p.tasks ?? []).map((t) => t.assigneeId)).filter(Boolean)),
        ] as string[];
        if (assigneeIds.length > 0) {
            const count = await this.prisma.membership.count({
                where: { organizationId: orgId, userId: { in: assigneeIds } },
            });
            if (count !== assigneeIds.length) {
                throw new BadRequestException('Every assignee must be a member of the organization');
            }
        }

        return this.prisma.$transaction(
            async (tx) => {
                const created: { id: string; name: string; tasksCreated: number }[] = [];

                for (const item of items) {
                    const project = await tx.project.create({
                        data: { name: item.name, description: item.description ?? '', organizationId: orgId },
                    });

                    let tasksCreated = 0;
                    if (item.tasks?.length) {
                        const result = await tx.task.createMany({
                            data: item.tasks.map((t) => ({
                                projectId: project.id,
                                title: t.title,
                                description: t.description ?? null,
                                status: t.status ?? 'TODO',
                                priority: t.priority ?? 'MEDIUM',
                                assigneeId: t.assigneeId ?? null,
                            })),
                        });
                        tasksCreated = result.count;
                    }

                    created.push({ id: project.id, name: project.name, tasksCreated });
                }

                return { created };
            },
            { timeout: 60_000 },
        );
    }
}
