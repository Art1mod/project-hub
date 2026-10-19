import { api } from "../lib/api"
import type { Role } from "./organizations";

export interface Member {
  id: string;
  role: Role;
  isSelf: boolean;
  user: { id: string; email: string };
}

export const getMembers = async (orgId: string) => {
    const response = await api.get<Member[]>(`/organizations/${orgId}/members`);
    return response.data;
}

export const removeMember = async (orgId: string, userId: string): Promise<void> => {
  const response = await api.delete(`/organizations/${orgId}/members/${userId}`);
  return response.data;
};