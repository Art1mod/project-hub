import { Priority, Status } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateTaskDto {
    @IsString()
    @IsNotEmpty()
    readonly title: string;

    @IsString()
    @IsOptional()
    readonly description?: string;

    @IsEnum(Status)
    @IsOptional()
    readonly status: Status = "TODO";

    @IsEnum(Priority)
    @IsOptional()
    readonly priority: Priority = "MEDIUM"; 
}