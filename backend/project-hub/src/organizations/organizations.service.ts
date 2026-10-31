import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { StorageService } from '../storage/storage.service';
import { BulkOrganizationDto } from './dto/bulk-create-organizations.dto';

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

    async bulkCreateOrganizations(userId: string, items: BulkOrganizationDto[]) {
        const studyMode = process.env.STUDY_MODE === 'true';

        if (!studyMode && items.some((o) => o.members?.length)) {
            throw new ForbiddenException('Adding members in bulk is only available in study mode');
        }

        const totalTasks = items.reduce(
            (sum, o) => sum + (o.projects ?? []).reduce((s, p) => s + (p.tasks?.length ?? 0), 0),
            0,
        );
        if (totalTasks > 500) throw new BadRequestException('A single request can create at most 500 tasks');

        const creator = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
        });
        if (!creator) throw new NotFoundException('User not found');

        const memberEmails = [
            ...new Set(items.flatMap((o) => (o.members ?? []).map((m) => m.email.toLowerCase()))),
        ].filter((e) => e !== creator.email.toLowerCase());

        const users = memberEmails.length
            ? await this.prisma.user.findMany({
                where: { email: { in: memberEmails } },
                select: { id: true, email: true },
            })
            : [];
        const idByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
        idByEmail.set(creator.email.toLowerCase(), userId);

        const missing = memberEmails.filter((e) => !idByEmail.has(e));
        if (missing.length) {
            throw new BadRequestException(`These users are not registered: ${missing.join(', ')}`);
        }

        for (const org of items) {
            const allowed = new Set([
                creator.email.toLowerCase(),
                ...(org.members ?? []).map((m) => m.email.toLowerCase()),
            ]);
            for (const project of org.projects ?? []) {
                for (const task of project.tasks ?? []) {
                    if (task.assigneeEmail && !allowed.has(task.assigneeEmail.toLowerCase())) {
                        throw new BadRequestException(
                            `"${task.title}": assignee ${task.assigneeEmail} is not a member of "${org.name}"`,
                        );
                    }
                }
            }
        }

        return this.prisma.$transaction(
            async (tx) => {
                const created = [];

                for (const org of items) {
                    const organization = await tx.organization.create({
                        data: { name: org.name, memberships: { create: { userId, role: 'OWNER' } } },
                    });

                    const members = (org.members ?? []).filter(
                        (m) => m.email.toLowerCase() !== creator.email.toLowerCase(),
                    );
                    if (members.length) {
                        await tx.membership.createMany({
                            data: members.map((m) => ({
                                userId: idByEmail.get(m.email.toLowerCase())!,
                                organizationId: organization.id,
                                role: m.role,
                            })),
                            skipDuplicates: true,
                        });
                    }

                    const projects = [];
                    for (const spec of org.projects ?? []) {
                        const project = await tx.project.create({
                            data: {
                                name: spec.name,
                                description: spec.description ?? '',
                                organizationId: organization.id,
                            },
                        });

                        let tasksCreated = 0;
                        if (spec.tasks?.length) {
                            const result = await tx.task.createMany({
                                data: spec.tasks.map((t) => ({
                                    projectId: project.id,
                                    title: t.title,
                                    description: t.description ?? null,
                                    status: t.status ?? 'TODO',
                                    priority: t.priority ?? 'MEDIUM',
                                    assigneeId: t.assigneeEmail
                                        ? idByEmail.get(t.assigneeEmail.toLowerCase())!
                                        : null,
                                })),
                            });
                            tasksCreated = result.count;
                        }
                        projects.push({ id: project.id, name: project.name, tasksCreated });
                    }

                    created.push({
                        id: organization.id,
                        name: organization.name,
                        membersAdded: members.length,
                        projects,
                    });
                }

                return { created };
            },
            { timeout: 120_000 },
        );
    }
}
