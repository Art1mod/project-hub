import { api } from '../lib/api';

export interface Project {
  id: string;
  name: string;
  description: string;
}

export interface CreateProjectInput {
  name: string;
  description: string;
}

export type UpdateProjectInput = Partial<CreateProjectInput>; 

export const getProjects = async (orgId: string): Promise<Project[]> => {
    const response = await api.get<Project[]>(`/organizations/${orgId}/projects`);
    return response.data;
}

export const getProject = async (projectId: string): Promise<Project> => {
    const response = await api.get<Project>(`/projects/${projectId}`);
    return response.data;
};

export const createProject = async (orgId: string, input: CreateProjectInput): Promise<Project> => {
    const response = await api.post<Project>(`/organizations/${orgId}/projects`, input);
    return response.data;
}

export const updateProject = async (projectId: string, input: UpdateProjectInput): Promise<Project> => {
    const response = await api.patch<Project>(`/projects/${projectId}`, input);
    return response.data;    
}

export const deleteProject = async (projectId : string): Promise<Project> => {
    const response = await api.delete<Project>(`/projects/${projectId}`);
    return response.data;    
}