import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
  imports: [OrganizationsModule, StorageModule],
  exports: [ProjectsService],
})
export class ProjectsModule {}
