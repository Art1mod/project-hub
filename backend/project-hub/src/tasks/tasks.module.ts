import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { ProjectsModule } from '../projects/projects.module'; 
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ProjectsModule, PrismaModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
