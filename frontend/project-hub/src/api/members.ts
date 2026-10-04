import { api } from "../lib/api"

export const getMembers = async (orgId: string) => {
    const response = await api.get(`/organizations/${orgId}/members`);
    return response.data;
}