import { Priority, Status } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, Min, Max } from "class-validator";
import { Type } from "class-transformer";

export class GetTasksFilterDto {
    @IsEnum(Status) @IsOptional()
    readonly status?: Status;

    @IsEnum(Priority) @IsOptional()
    readonly priority?: Priority;

    @IsString() @IsOptional()
    readonly assigneeId?: string;

    @IsString() @IsOptional()
    readonly search?: string;

    @Type(() => Number) @IsInt() @Min(1) @IsOptional()
    readonly page: number = 1;

    @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional()
    readonly limit: number = 10;
}