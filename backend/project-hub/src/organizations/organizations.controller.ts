import { Controller, Post, Body, UseGuards, Get, Param, Patch, Delete } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { JwtAuthGuard } from '../auth/guards/jwt_auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}
  
  @Post()
  createOrganization(
    @Body() body: CreateOrganizationDto, 
    @CurrentUser() user: {userId: string}) {
    return this.organizationsService.createOrganization(user.userId, body.name);  
  }

  @Get()
  getUserOrganizations(@CurrentUser() user: {userId: string}) {
    return this.organizationsService.getUserOrganizations(user.userId);
  }

  @Get(':id')
  getOrganizationById(@Param('id') orgId:string, 
  @CurrentUser() user: {userId: string}) {
    return this.organizationsService.getOrganizationById(user.userId, orgId);
  }

  @Delete(':id')
  deleteOrganizationById(
    @Param('id') orgId:string,
    @CurrentUser() user: {userId: string},  
  ) {
    return this.organizationsService.deleteOrganizationById(user.userId, orgId);
  }

  @Patch(':id')
  updateOrganizationById(
    @Param('id') orgId:string,
    @CurrentUser() user: {userId: string},
    @Body() body: UpdateOrganizationDto,
  ) {
    return this.organizationsService.updateOrganizationById(user.userId, orgId, body);
  }
}
