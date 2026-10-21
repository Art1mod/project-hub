import { IsIn, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_SIZE } from '../attachments.constants';

export class CreateUploadUrlDto {
    @IsString() @IsNotEmpty() @MaxLength(255)
    readonly filename: string;

    @IsIn(ALLOWED_ATTACHMENT_TYPES)
    readonly mimeType: string;

    @IsInt() @Min(1) @Max(MAX_ATTACHMENT_SIZE)
    readonly size: number;
}