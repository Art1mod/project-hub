import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ProjectsService } from '../projects/projects.service';
import { UpdateTaskDto } from './dto/update-task.dto';
import { NotFoundException } from '@nestjs/common';
import { GetTasksFilterDto } from './dto/get-tasks-filter.dto';


@Injectable()
export class TasksService {
    constructor ( 
        private readonly projectsService: ProjectsService, 
        private prisma: PrismaService) {}

    async createTask(userId: string, projectId: string, data: CreateTaskDto) {
        await this.projectsService.getProjectById(userId, projectId);
        if (data.assigneeId) await this.projectsService.getProjectById(data.assigneeId, projectId);

        return await this.prisma.task.create({
            data: {
                title: data.title, 
                description: data.description,
                priority:data.priority,
                status: data.status,
                assigneeId: data.assigneeId,
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
        if (newData.assigneeId) await this.projectsService.getProjectById(newData.assigneeId, task.projectId);  
        
        return await this.prisma.task.update( {
            where: {
                id: task.id     
            },
            data: {
                title: newData.title, 
                description: newData.description,
                priority:newData.priority,
                status: newData.status,
                assigneeId: newData.assigneeId 
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

    async getTasksByProjectId(userId: string, projectId: string, filters: GetTasksFilterDto) {
        await this.projectsService.getProjectById(userId, projectId);
    
        const { status, priority, assigneeId, search, page, limit } = filters;
        const skip = (page - 1) * limit;
        const whereObject: any = { projectId: projectId };

        if (status) whereObject.status = status;
        if (priority) whereObject.priority = priority;
        if (assigneeId) whereObject.assigneeId = assigneeId;
        if (search) whereObject.title = { contains: search, mode: 'insensitive' };

        const [tasks, total] = await Promise.all([
            this.prisma.task.findMany({
                where: whereObject,
                skip: skip,
                take: limit,
                orderBy: { createdAt: 'desc' }
            }),
            this.prisma.task.count({ where: whereObject })
        ]);

        const totalPages = Math.ceil(total / limit);
        return { data: tasks, meta: { total, page, limit, totalPages } };
    }
}
