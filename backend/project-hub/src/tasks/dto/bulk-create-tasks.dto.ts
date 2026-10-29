import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

export class BulkCreateTasksDto {
    @ValidateNested({ each: true })
    @Type(() => CreateTaskDto)
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    readonly tasks: CreateTaskDto[];
}