import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ProjectsService } from '../projects/projects.service';
import { UpdateTaskDto } from './dto/update-task.dto';
import { NotFoundException } from '@nestjs/common';

@Injectable()
export class TasksService {
    constructor ( 
        private readonly projectsService: ProjectsService, 
        private prisma: PrismaService) {}

    async createTask(userId: string, projectId: string, data: CreateTaskDto) {
        await this.projectsService.getProjectById(userId, projectId);
        
        return await this.prisma.task.create({
            data: {
                title: data.title, 
                description: data.description,
                priority:data.priority,
                status: data.status,
                projectId: projectId,   
            },
        });
    }

    async updateTaskById(userId: string, taskId: string, newData: UpdateTaskDto) {
        const task = await this.prisma.task.findFirst({
            where: {
                id: taskId,
                project: {
                    organization: {
                        memberships: {
                            some: {
                                userId: userId
                            }    
                        }
                    }
                }
            }
        });     

        if (!task) throw new NotFoundException("Task not found or access denied");   
        
        return await this.prisma.task.update( {
            where: {
                id: task.id     
            },
            data: {
                title: newData.title, 
                description: newData.description,
                priority:newData.priority,
                status: newData.status 
            }   
        });
    }

    async deleteTaskById(userId: string, taskId: string) {
        const task = await this.prisma.task.findFirst({
            where: {
                id: taskId,
                project: {
                    organization: {
                        memberships: {
                            some: {
                                userId: userId
                            }    
                        }
                    }
                }
            }
        });

        if (!task) throw new NotFoundException("Task not found or access denied"); 
        
        return await this.prisma.task.delete( {
            where: {
                id: task.id
            }
        });
    }
}
