import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteTask, updateTask, type Task } from "../../api/tasks";
import { Modal } from "../Modal";
import { TaskFields, type TaskFormValues } from "./TaskFields";
import { ConfirmModal } from "../ConfirmModal";

interface EditTaskModalProps {
    task: Task | null;
    projectId: string;
    onClose: () => void;
}

export function EditTaskModal({ task, projectId, onClose }: EditTaskModalProps) {
    return (
        <Modal isOpen={!!task} onClose={onClose} title="Edit Task">
            {task && <EditTaskForm key={task.id} task={task} projectId={projectId} onClose={onClose} />}
        </Modal>
    );
}

function EditTaskForm({ task, projectId, onClose }: { task: Task; projectId: string; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [values, setValues] = useState<TaskFormValues>({
        title: task.title,
        description: task.description ?? "",
        status: task.status,
        priority: task.priority,
    });
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const updateMutation = useMutation({
        mutationFn: () =>
            updateTask({
                taskId: task.id,
                data: { ...values, title: values.title.trim() },
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
            queryClient.invalidateQueries({ queryKey: ["analytics"] });
            onClose();
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => deleteTask(task.id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
            queryClient.invalidateQueries({ queryKey: ["analytics"] });
            onClose();
        },
    });

    const isBusy = updateMutation.isPending || deleteMutation.isPending;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!values.title.trim()) return;
        updateMutation.mutate();
    };

    return (
        <>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2 text-zinc-50">
                <TaskFields values={values} onChange={setValues} />

                {updateMutation.isError && (
                    <p role="alert" className="text-sm text-red-400">Failed to update task. Please try again.</p>
                )}
                
                <div className="mt-4 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        disabled={isBusy}
                        className="rounded-md px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    >
                        Delete
                    </button>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isBusy}
                            className="px-4 py-2 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isBusy}
                            className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-md shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] transition-all disabled:opacity-50"
                        >
                            {updateMutation.isPending ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </div>
            </form>
            <ConfirmModal
                isOpen={confirmingDelete}
                onClose={() => setConfirmingDelete(false)}
                onConfirm={() => deleteMutation.mutate()}
                title="Delete Task"
                message="Are you sure you want to delete this task? This action cannot be undone."
                confirmLabel="Delete Task"
                pendingLabel="Deleting..."
                isPending={deleteMutation.isPending}
                error={deleteMutation.isError ? "Failed to delete task. Please try again." : null}
            />
        </>   
    );
}