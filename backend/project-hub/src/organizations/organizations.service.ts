import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
    constructor(private prisma: PrismaService) {}

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
        return await this.prisma.organization.findMany({ 
            where: {
                memberships : {
                    some: {
                        userId: userId,
                    }
                }            
            },
            include : {
                memberships: {
                    where: {
                        userId: userId
                    },
                    select: {
                        role:true,
                    }
                }
            }
        });
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
}
