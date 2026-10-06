import { api } from "../lib/api"

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface CreateInvitationProps {
    email: string;
    role: Role    
}

export const createInvitation = async ({ orgId, data}: {orgId: string, data: CreateInvitationProps  }) => {
    const response = await api.post(`/organizations/${orgId}/invitations`, data);
    return response.data;
}

export const getPendingInvitations = async (orgId:string) => {
    const response = await api.get(`/organizations/${orgId}/invitations`);
    return response.data;
}

export const getUserPendingInvitations = async () => {
    const response = await api.get('/auth/invitations/me');
    return response.data;
}

export const acceptInvitation = async (token:string) => {
    const response = await api.post('/invitations/accept', {token});
    return response.data;
}