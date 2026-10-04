import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateInvitationDto } from './dto/create-invitation-dto';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto'; 

@Injectable()
export class InvitationsService {

    constructor(private prisma: PrismaService) {}

    async createInvitation(userId: string, orgId: string, data: CreateInvitationDto) {
        const requesterMembership = await this.prisma.membership.findFirst({
            where: {
                organizationId: orgId,
                userId: userId,
                role: { in: ['OWNER', 'ADMIN'] }
            }
        });

        if (!requesterMembership) throw new UnauthorizedException("You do not have permission to invite users to this organization");

        const existingUser = await this.prisma.user.findUnique({
            where: { email: data.email },
            include: {
                memberships: {
                    where: { organizationId: orgId }
                }
            }
        });

        if (existingUser && existingUser.memberships.length > 0) throw new BadRequestException("This user is already a member of the organization");

        const existingInvite = await this.prisma.invitation.findFirst({
            where: { email: data.email, organizationId: orgId }
        });

        if (existingInvite && existingInvite.expiresAt > new Date()) throw new BadRequestException("An active invitation has already been sent to this email");

        const token = crypto.randomUUID();
        const expiresAt = new Date(); 
        const expirationDate = 7;
        expiresAt.setDate(expiresAt.getDate() + expirationDate);

        const invitation = await this.prisma.invitation.create({
            data: {
                email: data.email,
                role: data.role,
                token: token,
                organizationId: orgId,
                expiresAt: expiresAt 
            }
        });

        return {
            message: "invitation",
            token: invitation.token    
        };
    }

    async acceptInvitation(userId: string, token: string) {
        const invitation = await this.prisma.invitation.findFirst({
            where: { token: token }
        });
        
        if (!invitation) throw new NotFoundException("The invitation has not been found or does not exist!");
        if (invitation.expiresAt < new Date()) throw new BadRequestException('Token expired');

        const user = await this.prisma.user.findFirst({
            where: {
                id: userId,
                email: invitation.email
            }
        });

        if (!user) throw new NotFoundException("This invitation is not meant for your account.");

        return this.prisma.$transaction(async (tx) => {
            const membership = await tx.membership.create({
                data: {
                    role: invitation.role, 
                    organizationId: invitation.organizationId,
                    userId: userId
                }
            }); 

            await tx.invitation.delete({
                where: {
                    id: invitation.id
                }
            });

            return membership;
        });
    }

    async getPendingInvitations(orgId: string) {
        return await this.prisma.invitation.findMany({
            where: {
                organizationId: orgId,
                expiresAt: {
                    gt: new Date() 
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
    }
}