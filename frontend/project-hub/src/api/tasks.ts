import { api } from '../lib/api';

export type Status = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface CreateTaskProps {
    title: string;
    description: string;
    status: Status;
    priority: Priority;
}

export const getTasks = async (projectId:string) => {
    const response = await api.get(`/projects/${projectId}/tasks`);
    return response.data.data;
}

export const createTask = async ({ projectId, data }: {projectId: string, data: CreateTaskProps}) => {
    const response = await api.post(`/projects/${projectId}/tasks`, data);
    return response.data;
}