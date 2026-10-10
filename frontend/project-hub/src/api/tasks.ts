import { api } from '../lib/api';

export type Status = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: Status;
  priority: Priority;
}

export interface CreateTaskProps {
    title: string;
    description: string;
    status: Status;
    priority: Priority;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export const getTasks = async (projectId: string): Promise<Task[]> => {
  const response = await api.get<Paginated<Task>>(`/projects/${projectId}/tasks`);
  return response.data.data;
};

export const createTask = async ({ projectId, data }: {projectId: string, data: CreateTaskProps}): Promise<Task> => {
    const response = await api.post<Task>(`/projects/${projectId}/tasks`, data);
    return response.data;
}

export const updateTask = async ({taskId, data}: {taskId:string, data: Partial<CreateTaskProps>}): Promise<Task> => {
    const response = await api.patch<Task>(`/tasks/${taskId}`, data);
    return response.data;
}