import { IsNotEmpty, IsOptional, IsString } from "class-validator";


export class UpdateProjectDto {
    @IsOptional() @IsString() @IsNotEmpty()
    readonly name?:string;

    @IsString() @IsOptional()
    readonly description?:string;
}