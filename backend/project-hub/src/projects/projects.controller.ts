import { Controller, UseGuards, Post, Body, Param, Get, Delete, Patch } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/guards/jwt_auth.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateProjectDto } from './dto/update-project.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post('organizations/:orgId/projects')
  @Roles('OWNER', 'ADMIN')
  createProject(
      @Param('orgId') orgId:string,
      @Body() body: CreateProjectDto, 
      @CurrentUser() user: {userId: string}
    ) {
      return this.projectsService.createProject(user.userId, orgId, body);  
  }

  @Get('organizations/:orgId/projects')
  getProjectsByOrg(
      @Param('orgId') orgId:string,
      @CurrentUser() user: {userId: string}
    ) {
      return this.projectsService.getProjectsByOrg(user.userId, orgId);  
  }

  @Get('projects/:projectId')
  getProjectById(
      @Param('projectId') projectId:string,
      @CurrentUser() user: {userId: string}
    ) {
      return this.projectsService.getProjectById(user.userId, projectId);
  }

  @Delete('projects/:projectId')
  deleteProjectById(
    @Param('projectId') projectId:string,
    @CurrentUser() user: {userId: string}
  ) {
    return this.projectsService.deleteProjectById(user.userId, projectId);
  }

  @Patch('projects/:projectId')
  updateProjectById (
    @Param('projectId') projectId:string,
    @Body() body: UpdateProjectDto,
    @CurrentUser() user: {userId: string}  
  ) {
    return this.projectsService.updateProjectById(user.userId, projectId, body);
  }

}
