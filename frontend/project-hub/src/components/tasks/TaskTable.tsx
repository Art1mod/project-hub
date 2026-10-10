import type { Priority, Status, Task, CreateTaskProps } from "../../api/tasks";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "../../constants/tasks";

interface TaskTableProps {
    tasks: Task[];
    onUpdate: (taskId: string, data: Partial<CreateTaskProps>) => void;
    isUpdating?: boolean;
}

const selectClass =
    "bg-zinc-800 border border-transparent hover:border-white/20 focus:border-violet-500 rounded-md px-2 py-1 text-xs outline-none cursor-pointer transition-colors disabled:opacity-50";

export function TaskTable({ tasks, onUpdate, isUpdating = false }: TaskTableProps) {
    return (
        <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="text-zinc-400 border-b border-white/10 bg-zinc-950/50">
                    <tr>
                        <th className="px-4 py-3 font-medium">Title</th>
                        <th className="px-4 py-3 font-medium text-center">Status</th>
                        <th className="px-4 py-3 font-medium text-center">Priority</th>
                    </tr>
                </thead>
                <tbody>
                    {tasks.length === 0 ? (
                        <tr>
                            <td colSpan={3} className="px-4 py-12 text-center">
                                <div className="text-zinc-400">
                                    <p className="text-base font-medium text-zinc-200">No tasks yet</p>
                                    <p className="mt-1 text-sm">Create a task to get started.</p>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        tasks.map((task) => (
                            <tr
                                key={task.id}
                                className="text-zinc-50 border-b border-white/5 last:border-0 hover:bg-zinc-800/50 transition-colors"
                            >
                                <td className="px-4 py-3">{task.title}</td>
                                <td className="px-4 py-3 text-center">
                                    <select
                                        value={task.status}
                                        onChange={(e) => onUpdate(task.id, { status: e.target.value as Status })}
                                        disabled={isUpdating}
                                        className={selectClass}
                                    >
                                        {STATUS_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <select
                                        value={task.priority}
                                        onChange={(e) => onUpdate(task.id, { priority: e.target.value as Priority })}
                                        disabled={isUpdating}
                                        className={selectClass}
                                    >
                                        {PRIORITY_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}