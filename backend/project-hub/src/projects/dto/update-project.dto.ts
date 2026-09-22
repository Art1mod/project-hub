import { IsNotEmpty, IsOptional, IsString } from "class-validator";


export class UpdateProjectDto {
    @IsString()
    @IsNotEmpty()
    readonly name:string;

    @IsString()
    @IsOptional()
    readonly description?:string;
}