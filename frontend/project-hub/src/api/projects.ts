import { api } from '../lib/api';


export const getOrganizations = async () => { 
    const response = await api.get('/organizations');
    return response.data;
 }

export const getProjects = async (orgId: string) => {
    const response = await api.get(`/organizations/${orgId}/projects`);
    return response.data;
}