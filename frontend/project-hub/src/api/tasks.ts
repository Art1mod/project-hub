import { api } from '../lib/api';

export const getTasks = async (projectId:string) => {
    const response = await api.get(`/projects/${projectId}/tasks`);
    return response.data;
}