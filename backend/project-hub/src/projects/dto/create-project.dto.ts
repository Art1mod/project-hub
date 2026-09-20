import { IsNotEmpty, IsOptional, IsString } from "class-validator";


export class CreateProjectDto {
    @IsString()
    @IsNotEmpty()
    readonly name:string;

    @IsString()
    @IsOptional()
    readonly description?:string;
}