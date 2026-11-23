import type { CreateTaskProps } from '../api/tasks';
import type { PageResult, SizeBucket, TaskField } from './types';

/** Coarse size of a project by task count, so exact counts are never logged. */
export function sizeBucket(total: number): Exclude<SizeBucket, 'all'> {
    if (total <= 0) return 'empty';
    if (total < 10) return 'small';
    if (total < 50) return 'medium';
    return 'large';
}

/** Which field an update touched. Returns the name only, never the value. */
export function taskFieldOf(data: Partial<CreateTaskProps>): TaskField | undefined {
    if ('status' in data) return 'status';
    if ('priority' in data) return 'priority';
    if ('assigneeId' in data) return 'assignee';
    if ('title' in data) return 'title';
    if ('description' in data) return 'description';
    return undefined;
}

/** Buckets a failed request into a coarse class. No response means the network failed. */
export function classifyError(error: unknown): Exclude<PageResult, 'ok'> {
    const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
    if (typeof status !== 'number') return 'network_error';
    return status >= 500 ? 'server_error' : 'client_error';
}
