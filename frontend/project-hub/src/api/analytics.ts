import { api } from "../lib/api";
import type { Status } from "./tasks";

export type WorkloadMetrics = Record<Status, number>;

export const getWorkload = async (orgId: string, projectId?: string): Promise<WorkloadMetrics> => {
    const response = await api.get<WorkloadMetrics>(`/organizations/${orgId}/analytics/workload`, {
        params: projectId ? { projectId } : undefined,
    });
    return response.data;
};