import { api } from "../lib/api";
import type { Priority, Status } from "./tasks";

export type WorkloadMetrics = Record<Status, number>;

export const getWorkload = async (orgId: string, projectId?: string): Promise<WorkloadMetrics> => {
    const response = await api.get<WorkloadMetrics>(`/organizations/${orgId}/analytics/workload`, {
        params: projectId ? { projectId } : undefined,
    });
    return response.data;
};

export interface AttentionTask {
    id: string;
    title: string;
    status: Status;
    priority: Priority;
    page: number;
    project: { id: string; name: string };
    assignee: { id: string; email: string } | null;
}

export const getAttention = async (orgId: string, projectId?: string): Promise<AttentionTask[]> => {
    const { data } = await api.get<AttentionTask[]>(`/organizations/${orgId}/analytics/attention`, {
        params: projectId ? { projectId } : undefined,
    });
    return data;
};