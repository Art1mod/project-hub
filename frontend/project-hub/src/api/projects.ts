import { api } from '../lib/api';


export const getOrganizations = async () => { 
    const response = await api.get('/organizations');
    return response.data;
 }

export const getProjects = async (orgId: string) => {
    const response = await api.get(`/organizations/${orgId}/projects`);
    return response.data;
}

export const createProject = async ({orgId, name, description}: {orgId: string, name: string, description: string}) => {
    const response = await api.post(`/organizations/${orgId}/projects`, {name, description});
    return response.data;
}