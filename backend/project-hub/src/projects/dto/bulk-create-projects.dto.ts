import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { CreateTaskDto } from '../../tasks/dto/create-task.dto';

export class BulkProjectItemDto {
    @IsString() @IsNotEmpty()
    readonly name: string;

    @IsOptional() @IsString()
    readonly description?: string;

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => CreateTaskDto)
    @ArrayMaxSize(100)
    readonly tasks?: CreateTaskDto[];
}

export class BulkCreateProjectsDto {
    @ValidateNested({ each: true })
    @Type(() => BulkProjectItemDto)
    @ArrayMinSize(1)
    @ArrayMaxSize(20)
    readonly projects: BulkProjectItemDto[];
}