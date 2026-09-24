import { Priority, Status } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateTaskDto {

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    readonly name?: string;

    @IsString()
    @IsOptional()
    readonly description?: string;

    @IsEnum(Status)
    @IsOptional()
    readonly status?: Status;

    @IsEnum(Priority)
    @IsOptional()
    readonly priority?: Priority; 
}