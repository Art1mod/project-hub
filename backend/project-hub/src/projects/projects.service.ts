import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProjectDto } from './dto/update-project.dto';
import { StorageService } from '../storage/storage.service';

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
}
