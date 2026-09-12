import {IsEmail, MinLength, IsString} from "class-validator";

export class RegisterDto {
    
    @IsEmail()
    readonly email: string;

    @IsString()
    @MinLength(6)
    readonly password: string;

}