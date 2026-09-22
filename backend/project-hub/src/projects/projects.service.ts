import { Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
    constructor (
        private readonly organizationsService: OrganizationsService, 
        private prisma: PrismaService 
    ) {}

    async createProject(userId: string, orgId: string, data: CreateProjectDto) {
        await this.organizationsService.getOrganizationById(userId, orgId);

        return await this.prisma.project.create({
            data: {
                name: data.name,
                description: data.description,
                organizationId: orgId
            }
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

        return await this.prisma.project.delete({where: {
            id: projectId,
        }});
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
