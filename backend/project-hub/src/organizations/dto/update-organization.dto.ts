import { IsString, MaxLength, IsNotEmpty} from "class-validator"

export class UpdateOrganizationDto {

    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    readonly name: string
}