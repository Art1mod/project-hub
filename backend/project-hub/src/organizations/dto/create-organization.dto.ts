import { IsString, MaxLength, IsNotEmpty } from "class-validator"

export class CreateOrganizationDto {

    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    readonly name: string
}