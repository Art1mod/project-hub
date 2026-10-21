import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmAttachmentDto {
    @IsString() @IsNotEmpty()
    readonly storageKey: string;

    @IsString() @IsNotEmpty() @MaxLength(255)
    readonly filename: string;
}