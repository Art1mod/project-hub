import { Priority, Status } from '@prisma/client';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsEmail,
    IsEnum,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';

export class BulkTaskDto {
    @IsString() @IsNotEmpty() @MaxLength(200)
    readonly title: string;

    @IsOptional() @IsString()
    readonly description?: string;

    @IsOptional() @IsEnum(Status)
    readonly status?: Status;

    @IsOptional() @IsEnum(Priority)
    readonly priority?: Priority;

    @IsOptional() @IsEmail()
    readonly assigneeEmail?: string;
}

export class BulkProjectDto {
    @IsString() @IsNotEmpty() @MaxLength(100)
    readonly name: string;

    @IsOptional() @IsString()
    readonly description?: string;

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => BulkTaskDto)
    @ArrayMaxSize(100)
    readonly tasks?: BulkTaskDto[];
}

export class BulkMemberDto {
    @IsEmail()
    readonly email: string;

    @IsIn(['ADMIN', 'MEMBER'])
    readonly role: 'ADMIN' | 'MEMBER';
}

export class BulkOrganizationDto {
    @IsString() @IsNotEmpty() @MaxLength(100)
    readonly name: string;

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => BulkMemberDto)
    @ArrayMaxSize(20)
    readonly members?: BulkMemberDto[];

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => BulkProjectDto)
    @ArrayMaxSize(20)
    readonly projects?: BulkProjectDto[];
}

export class BulkCreateOrganizationsDto {
    @ValidateNested({ each: true })
    @Type(() => BulkOrganizationDto)
    @ArrayMinSize(1)
    @ArrayMaxSize(5)
    readonly organizations: BulkOrganizationDto[];
}