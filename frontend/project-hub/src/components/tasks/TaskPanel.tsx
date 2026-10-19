import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteTask, type CreateTaskProps, type Priority, type Status, type Task } from "../../api/tasks";
import { InlineEditable } from "../InlineEditable";
import { ConfirmModal } from "../ConfirmModal";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "../../constants/tasks";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { AssigneeSelect } from "./AssigneeSelect";

interface TaskPanelProps {
    task: Task;
    projectId: string;
    onUpdate: (taskId: string, data: Partial<CreateTaskProps>) => void;
    onClose: () => void;
}

const selectClass =
    "bg-zinc-950 border border-white/10 rounded-md p-2 text-sm outline-none focus:border-violet-500 transition-colors cursor-pointer text-zinc-50 hover:bg-zinc-800/50 focus:bg-zinc-950";

export function TaskPanel({ task, projectId, onUpdate, onClose }: TaskPanelProps) {
    const queryClient = useQueryClient();
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    const { width, handleProps } = useResizableWidth({
        min: 320,
        max: 720,
        initial: 420,
        storageKey: "task-panel-width",
    });

    const deleteMutation = useMutation({
        mutationFn: () => deleteTask(task.id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
            onClose();
        },
    });

    return (
        <aside
            style={{ width }}
            className="relative ml-4 shrink-0 self-start rounded-xl border border-white/10 bg-zinc-900 p-5"
        >
            {/* Drag handle on the left edge */}
            <div
                {...handleProps}
                title="Drag to resize"
                className="absolute -left-2 top-0 z-10 flex h-full w-4 cursor-col-resize touch-none select-none items-center justify-center group"
            >
                <div className="h-12 w-1 rounded-full bg-zinc-700 transition-colors group-hover:bg-violet-500" />
            </div>

            <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Task</span>
                <button
                    type="button"
                    onClick={onClose}
                    title="Close"
                    className="rounded-md px-2 py-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                >
                    ✕
                </button>
            </div>

            <div className="flex flex-col gap-4 pt-1">
                <InlineEditable
                    value={task.title}
                    required
                    onSave={(title) => onUpdate(task.id, { title })}
                    className="text-lg font-bold text-zinc-50"
                />

                <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Description</span>
                    <InlineEditable
                        value={task.description ?? ""}
                        multiline
                        placeholder="Add a description"
                        onSave={(description) => onUpdate(task.id, { description })}
                        className="text-sm text-zinc-300"
                    />
                </div>

                <div className="flex gap-4">
                    <div className="flex flex-1 flex-col gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Status</span>
                        <select
                            value={task.status}
                            onChange={(e) => onUpdate(task.id, { status: e.target.value as Status })}
                            className={selectClass}
                        >
                            {STATUS_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-1 flex-col gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Priority</span>
                        <select
                            value={task.priority}
                            onChange={(e) => onUpdate(task.id, { priority: e.target.value as Priority })}
                            className={selectClass}
                        >
                            {PRIORITY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Assignee</span>
                        <AssigneeSelect
                            value={task.assignee?.id ?? null}
                            current={task.assignee}
                            onChange={(assigneeId) => onUpdate(task.id, { assigneeId })}
                            className={`${selectClass} w-full`}
                        />
                    </div>
                </div>

                <div className="flex justify-end mt-2 border-t border-white/10 pt-3">
                    <button
                        type="button"
                        onClick={() => setIsDeleteOpen(true)}
                        className="rounded-md px-3 py-1 text-sm text-red-400 transition-colors hover:bg-red-500/10"
                    >
                        Delete task
                    </button>
                </div>
            </div>

            <ConfirmModal
                isOpen={isDeleteOpen}
                onClose={() => { setIsDeleteOpen(false); deleteMutation.reset(); }}
                onConfirm={() => deleteMutation.mutate()}
                title="Delete Task"
                message={<>Are you sure you want to delete {task.title}? This cannot be undone.</>}
                confirmLabel="Delete"
                pendingLabel="Deleting..."
                isPending={deleteMutation.isPending}
                error={deleteMutation.isError ? "Failed to delete task. Please try again." : null}
            />
        </aside>
    );
}