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