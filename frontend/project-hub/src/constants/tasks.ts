import type { Priority, Status } from "../api/tasks";

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