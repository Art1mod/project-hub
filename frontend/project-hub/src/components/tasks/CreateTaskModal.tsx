import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTask, type Priority, type Status } from "../../api/tasks";
import { Modal } from "../Modal";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "../../constants/tasks";

interface CreateTaskModalProps {
    projectId: string;
    isOpen: boolean;
    onClose: () => void;
}

export function CreateTaskModal({ projectId, isOpen, onClose }: CreateTaskModalProps) {
    const queryClient = useQueryClient();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [status, setStatus] = useState<Status>("TODO");
    const [priority, setPriority] = useState<Priority>("MEDIUM");

    const resetForm = () => {
        setTitle("");
        setDescription("");
        setStatus("TODO");
        setPriority("MEDIUM");
    };

    const createTaskMutation = useMutation({
        mutationFn: () => createTask({ projectId, data: { title, description, status, priority } }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
            resetForm();
            onClose();
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        createTaskMutation.mutate();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Task">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2 text-zinc-50">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm text-zinc-400">Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-zinc-950 border border-white/10 rounded-md p-2 outline-none focus:border-violet-500 transition-colors"
                            required
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm text-zinc-400">Description</label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="bg-zinc-950 border border-white/10 rounded-md p-2 outline-none focus:border-violet-500 transition-colors"
                        />
                    </div>

                    <div className="flex gap-4">
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-sm text-zinc-400">Status</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value as Status)}
                                className="bg-zinc-950 border border-white/10 rounded-md p-2 outline-none focus:border-violet-500 transition-colors"
                            >
                                {STATUS_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-sm text-zinc-400">Priority</label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as Priority)}
                                className="bg-zinc-950 border border-white/10 rounded-md p-2 outline-none focus:border-violet-500 transition-colors"
                            >
                                {PRIORITY_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={createTaskMutation.isPending}
                            className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-md shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] transition-all disabled:opacity-50"
                        >
                            {createTaskMutation.isPending ? "Creating..." : "Create Task"}
                        </button>
                    </div>
                </form>
        </Modal>
    );
}