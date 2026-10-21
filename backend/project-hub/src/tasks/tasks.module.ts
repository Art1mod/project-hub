import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { ProjectsModule } from '../projects/projects.module'; 
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [ProjectsModule, PrismaModule, StorageModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
