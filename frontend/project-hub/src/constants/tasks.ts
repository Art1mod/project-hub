import type { Priority, Status, Task } from "../api/tasks";

export const STATUS_OPTIONS: { value: Status; label: string }[] = [
    { value: "TODO", label: "To Do" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "DONE", label: "Done" },
];

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
    { value: "URGENT", label: "Urgent" },
];

const STATUS_RANK: Record<Status, number> = { TODO: 1, IN_PROGRESS: 2, DONE: 3 };
const PRIORITY_RANK: Record<Priority, number> = { URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };

export const sortTasks = (tasks: Task[]) =>
    [...tasks].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
);