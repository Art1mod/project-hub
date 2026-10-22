import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class OrganizationsService {
    constructor(
        private prisma: PrismaService,
        private storage: StorageService,
    ) {}

    async createOrganization(userId:string, name:string) {
        return await this.prisma.organization.create({
                data: {
                    name,
                    memberships: {
                        create: {
                            userId,
                            role: 'OWNER'
                        }
                    }
                }
        });
    }

    async getUserOrganizations(userId: string) {
        const orgs = await this.prisma.organization.findMany({
            where: {
                memberships: { some: { userId } },
            },
            include: {
                memberships: {
                    where: { userId },
                    select: { role: true },
                },
            },
        });

        return orgs.map(({ memberships, ...org }) => ({
            ...org,
            role: memberships[0].role,
        }));
    }

    async getOrganizationById(userId: string, orgId: string) {
        const organization = await this.prisma.organization.findFirst({
            where: {
                id: orgId,
                memberships: {
                    some: {
                        userId: userId,
                    }
                }
            },
            include: {
                    memberships: {
                        where: {
                            userId: userId,    
                        },
                        select: {
                            role: true,
                        }
                    }
                }
        });

        if (!organization) throw new NotFoundException("Organization not found or access denied");

        return organization;
    }

    async deleteOrganizationById(userId: string, orgId: string) {
        
        const organization = await this.prisma.organization.findFirst({
            where: {
                id: orgId,
                memberships: {
                    some: {
                        userId: userId,
                        role: { in: ['OWNER'] }
                    }
                }
            },    
        });

        if (!organization) throw new NotFoundException("Organization not found or access denied");

        const files = await this.prisma.attachment.findMany({
            where: { task: { project: { organizationId: orgId } } },
            select: { storageKey: true },
        });

        const deleted = await this.prisma.organization.delete({ where: { id: orgId } });

        await this.storage.deleteManyQuietly(files.map((f) => f.storageKey));
        return deleted; 
    }

    async updateOrganizationById(userId: string, orgId: string, newData: UpdateOrganizationDto) {
        const organization = await this.prisma.organization.findFirst({
            where: {
                id: orgId,
                memberships: {
                    some: {
                       userId: userId,
                       role: { in: ['OWNER', 'ADMIN'] }
                    }
                }
            },    
        });
        
        if (!organization) throw new NotFoundException("Organization not found or access denied");

        return await this.prisma.organization.update({
            where: {
                id: orgId
            },
            data: {
                name: newData.name
            }
        });
    }

    async getMembers(userId: string, orgId: string) {
        const organization = await this.prisma.organization.findFirst({
            where: { id: orgId, memberships: { some: { userId } } },
        });
        
        if (!organization) throw new NotFoundException("Organization not found or access denied");

        const members = await this.prisma.membership.findMany({
            where: { organizationId: orgId },
            include: { user: { select: { id: true, email: true } } },
        });

        return members.map((m) => ({ ...m, isSelf: m.userId === userId }));
    }

    async removeUserFromOrganization(userId: string, orgId: string, memberId:string) {
        if (userId === memberId) {
            throw new BadRequestException("You cannot remove yourself from the organization.");
        }

        const requesterMembership = await this.prisma.membership.findFirst({
            where: { organizationId: orgId, userId, role: { in: ['OWNER', 'ADMIN'] } },
        });

        if (!requesterMembership) {
            throw new ForbiddenException("You do not have permission to remove members");
        }

        const targetMembership = await this.prisma.membership.findFirst({
            where: { organizationId: orgId, userId: memberId },
        });

        if (!targetMembership) {
            throw new NotFoundException("Target user is not a member of this organization");
        }

        if (requesterMembership.role === 'ADMIN' && targetMembership.role !== 'MEMBER') {
            throw new ForbiddenException("Admins can only remove members");
        }

        return await this.prisma.$transaction(async (tx) => {
            await tx.task.updateMany({
                where: { assigneeId: memberId, project: { organizationId: orgId } },
                data: { assigneeId: null },
            });
            
            return tx.membership.delete({ where: { id: targetMembership.id } });
        });
    }
}
