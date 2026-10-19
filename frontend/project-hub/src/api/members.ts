import { api } from "../lib/api"
import type { Role } from "./organizations";

export interface Member {
  id: string;
  role: Role;
  user: { id: string; email: string };
}

export const getMembers = async (orgId: string) => {
    const response = await api.get<Member[]>(`/organizations/${orgId}/members`);
    return response.data;
}