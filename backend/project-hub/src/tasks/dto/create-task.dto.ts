import { Priority, Status } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateTaskDto {

    @IsString()
    @IsNotEmpty()
    readonly name: string;

    @IsString()
    @IsOptional()
    readonly description?: string;

    @IsEnum(Status)
    readonly status: Status = "TODO";

    @IsEnum(Priority)
    readonly priority: Priority = "MEDIUM"; 
}