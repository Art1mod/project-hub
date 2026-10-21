import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { fromBuffer } from 'file-type';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { ConfirmAttachmentDto } from './dto/confirm-attachment.dto';
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_SIZE, MAX_ATTACHMENTS_PER_TASK } from './attachments.constants';

type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

@Injectable()
export class AttachmentsService {
    constructor(private prisma: PrismaService, private storage: StorageService) {}

    /** Throws unless the user belongs to the task's organization. Returns their role there. */
    private async getTaskAccess(userId: string, taskId: string): Promise<{ role: Role }> {
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
            select: { project: { select: { organizationId: true } } },
        });
        if (!task) throw new NotFoundException('Task not found or access denied');

        const membership = await this.prisma.membership.findFirst({
            where: { userId, organizationId: task.project.organizationId },
            select: { role: true },
        });
        if (!membership) throw new NotFoundException('Task not found or access denied');

        return { role: membership.role as Role };
    }

    private async assertUnderLimit(taskId: string) {
        const count = await this.prisma.attachment.count({ where: { taskId } });
        if (count >= MAX_ATTACHMENTS_PER_TASK) {
            throw new BadRequestException(`A task can have at most ${MAX_ATTACHMENTS_PER_TASK} attachments`);
        }
    }

    private cleanFilename(name: string) {
        return name.replace(/[\\/\x00-\x1f]/g, '').trim().slice(0, 255) || 'file';
    }

    private async toDto(
        a: {
            id: string; filename: string; mimeType: string; size: number; storageKey: string;
            createdAt: Date; uploaderId: string | null; uploader?: { id: string; email: string } | null;
        },
        userId: string,
        role: Role,
    ) {
        return {
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            size: a.size,
            createdAt: a.createdAt,
            uploader: a.uploader ?? null,
            canDelete: a.uploaderId === userId || role === 'OWNER' || role === 'ADMIN',
            url: await this.storage.getDownloadUrl(a.storageKey, a.filename, a.mimeType),
        };
    }

    async createUploadUrl(userId: string, taskId: string, dto: CreateUploadUrlDto) {
        await this.getTaskAccess(userId, taskId);
        await this.assertUnderLimit(taskId);

        const storageKey = `tasks/${taskId}/${randomUUID()}`;
        const uploadUrl = await this.storage.getUploadUrl(storageKey, dto.mimeType, dto.size);

        return { uploadUrl, storageKey };
    }

    async confirmUpload(userId: string, taskId: string, dto: ConfirmAttachmentDto) {
        const { role } = await this.getTaskAccess(userId, taskId);

        // The key must belong to this task, so nobody can claim another task's file
        if (!dto.storageKey.startsWith(`tasks/${taskId}/`)) {
            throw new BadRequestException('Invalid storage key');
        }

        const existing = await this.prisma.attachment.findUnique({ where: { storageKey: dto.storageKey } });
        if (existing) throw new ConflictException('This file is already attached');

        await this.assertUnderLimit(taskId);

        const head = await this.storage.head(dto.storageKey);
        if (!head) throw new BadRequestException('The file was not uploaded');

        if (head.size > MAX_ATTACHMENT_SIZE) {
            await this.storage.delete(dto.storageKey);
            throw new BadRequestException('File is too large');
        }

        const detected = await fromBuffer(await this.storage.readHead(dto.storageKey));
        if (!detected || !ALLOWED_ATTACHMENT_TYPES.includes(detected.mime)) {
            await this.storage.delete(dto.storageKey);
            throw new BadRequestException('File type is not allowed');
        }

        const attachment = await this.prisma.attachment.create({
            data: {
                taskId,
                uploaderId: userId,
                filename: this.cleanFilename(dto.filename),
                mimeType: detected.mime,
                size: head.size,
                storageKey: dto.storageKey,
            },
            include: { uploader: { select: { id: true, email: true } } },
        });

        return this.toDto(attachment, userId, role);
    }

    async list(userId: string, taskId: string) {
        const { role } = await this.getTaskAccess(userId, taskId);

        const attachments = await this.prisma.attachment.findMany({
            where: { taskId },
            orderBy: { createdAt: 'asc' },
            include: { uploader: { select: { id: true, email: true } } },
        });

        return Promise.all(attachments.map((a) => this.toDto(a, userId, role)));
    }

    async remove(userId: string, attachmentId: string) {
        const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
        if (!attachment) throw new NotFoundException('Attachment not found');

        const { role } = await this.getTaskAccess(userId, attachment.taskId);

        const isUploader = attachment.uploaderId === userId;
        if (!isUploader && role !== 'OWNER' && role !== 'ADMIN') {
            throw new ForbiddenException('Only the uploader or an admin can delete this file');
        }

        await this.prisma.attachment.delete({ where: { id: attachmentId } });
        await this.storage.delete(attachment.storageKey).catch(() => {
            
        });

        return { message: 'Attachment deleted' };
    }
}
