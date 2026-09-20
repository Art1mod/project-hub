import { Controller, UseGuards, Post, Body, Param, Get } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/guards/jwt_auth.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post('organizations/:orgId/projects')
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
}
