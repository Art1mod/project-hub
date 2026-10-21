import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt_auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AttachmentsService } from './attachments.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { ConfirmAttachmentDto } from './dto/confirm-attachment.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class AttachmentsController {
    constructor(private readonly attachmentsService: AttachmentsService) {}

    @Post('tasks/:taskId/attachments/upload-url')
    createUploadUrl(
        @Param('taskId') taskId: string,
        @Body() body: CreateUploadUrlDto,
        @CurrentUser() user: { userId: string },
    ) {
        return this.attachmentsService.createUploadUrl(user.userId, taskId, body);
    }

    @Post('tasks/:taskId/attachments')
    confirmUpload(
        @Param('taskId') taskId: string,
        @Body() body: ConfirmAttachmentDto,
        @CurrentUser() user: { userId: string },
    ) {
        return this.attachmentsService.confirmUpload(user.userId, taskId, body);
    }

    @Get('tasks/:taskId/attachments')
    list(@Param('taskId') taskId: string, @CurrentUser() user: { userId: string }) {
        return this.attachmentsService.list(user.userId, taskId);
    }

    @Delete('attachments/:attachmentId')
    remove(@Param('attachmentId') attachmentId: string, @CurrentUser() user: { userId: string }) {
        return this.attachmentsService.remove(user.userId, attachmentId);
    }
}
