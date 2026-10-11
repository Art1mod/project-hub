import { api,  } from '../lib/api';

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface Organization {
    id: string;
    name: string;
    role: Role;
}

export const getOrganizations = async (): Promise<Organization[]> => { 
    const response = await api.get<Organization[]>('/organizations');
    return response.data;
 }

export const createOrganization = async (name:string): Promise<Organization> => {
    const response = await api.post<Organization>('/organizations', {name});
    return response.data;    
}

export const updateOrganization = async (orgId:string, name:string): Promise<Organization> => {
    const response = await api.patch<Organization>(`/organizations/${orgId}`, {name});
    return response.data;    
}

export const deleteOrganization = async (orgId:string): Promise<Organization> => {
    const response = await api.delete<Organization>(`/organizations/${orgId}`);
    return response.data;    
}