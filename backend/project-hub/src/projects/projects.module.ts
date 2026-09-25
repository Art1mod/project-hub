import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
  imports: [OrganizationsModule],
  exports: [ProjectsService],
})
export class ProjectsModule {}
