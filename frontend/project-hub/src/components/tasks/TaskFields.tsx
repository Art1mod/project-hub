import type { Priority, Status } from "../../api/tasks";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "../../constants/tasks";

export interface TaskFormValues {
    title: string;
    description: string;
    status: Status;
    priority: Priority;
}

interface TaskFieldsProps {
    values: TaskFormValues;
    onChange: (next: TaskFormValues) => void;
}

const inputClass =
    "bg-zinc-950 border border-white/10 rounded-md p-2 outline-none focus:border-violet-500 transition-colors";

export function TaskFields({ values, onChange }: TaskFieldsProps) {
    const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) =>
        onChange({ ...values, [key]: value });

    return (
        <>
            <div className="flex flex-col gap-1">
                <label className="text-sm text-zinc-400">Title</label>
                <input
                    type="text"
                    value={values.title}
                    onChange={(e) => set("title", e.target.value)}
                    className={inputClass}
                    required
                />
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-sm text-zinc-400">Description</label>
                <input
                    type="text"
                    value={values.description}
                    onChange={(e) => set("description", e.target.value)}
                    className={inputClass}
                />
            </div>

            <div className="flex gap-4">
                <div className="flex flex-col gap-1 flex-1">
                    <label className="text-sm text-zinc-400">Status</label>
                    <select
                        value={values.status}
                        onChange={(e) => set("status", e.target.value as Status)}
                        className={inputClass}
                    >
                        {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1 flex-1">
                    <label className="text-sm text-zinc-400">Priority</label>
                    <select
                        value={values.priority}
                        onChange={(e) => set("priority", e.target.value as Priority)}
                        className={inputClass}
                    >
                        {PRIORITY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
            </div>
        </>
    );
}