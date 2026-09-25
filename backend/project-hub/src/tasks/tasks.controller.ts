import { Controller, Body, Param, Post, Patch, Delete, Get, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { GetTasksFilterDto } from './dto/get-tasks-filter.dto';
import { JwtAuthGuard } from '../auth/guards/jwt_auth.guard';
import { UseGuards } from '@nestjs/common';

@UseGuards(JwtAuthGuard)
@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}
    
    @Post('/projects/:projectId/tasks')
    createTask( 
          @CurrentUser() user: {userId: string},
          @Param('projectId') projectId:string,
          @Body() body: CreateTaskDto
        ) {
          return this.tasksService.createTask(user.userId, projectId, body);  
    }

    @Patch('tasks/:taskId')
    updateTaskById(
      @CurrentUser() user: {userId: string},
      @Param('taskId') taskId:string, 
      @Body() body:UpdateTaskDto 
    ) {
      return this.tasksService.updateTaskById(user.userId, taskId, body);
    }
    
    @Delete('/tasks/:taskId')
    deleteTaskById(
      @CurrentUser() user: {userId: string},
      @Param('taskId') taskId:string,
    ) {
      return this.tasksService.deleteTaskById(user.userId, taskId);
    }
    
    @Get('/projects/:projectId/tasks')
    getTasksByProjectId(
      @CurrentUser() user: {userId: string},
      @Param('projectId') projectId:string,
      @Query() query: GetTasksFilterDto
    ) {
      return this.tasksService.getTasksByProjectId(user.userId, projectId, query);
    }
}
