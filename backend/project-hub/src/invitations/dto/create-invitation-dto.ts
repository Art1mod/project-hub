import { IsEmail, IsEnum, IsNotEmpty} from "class-validator";
import { Role } from "@prisma/client";

export class CreateInvitationDto {
    
    @IsEmail()
    @IsNotEmpty()
    readonly email: string;

    @IsEnum(Role)
    @IsNotEmpty()
    readonly role: Role;
}