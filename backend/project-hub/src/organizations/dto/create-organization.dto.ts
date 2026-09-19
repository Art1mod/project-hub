import { IsString, MaxLength } from "class-validator"

export class CreateOrganizationDto {

    @IsString()
    @MaxLength(50)
    readonly name: string
}