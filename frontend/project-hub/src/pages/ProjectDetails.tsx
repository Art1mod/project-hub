import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { getTasks, createTask, updateTask, type Priority, type Status, type CreateTaskProps} from "../api/tasks";
import { getProject, updateProject, deleteProject, type UpdateProjectInput } from "../api/projects";
import { Modal } from "../components/Modal";
import { InlineEditable } from "../components/InlineEditable";
import { useOrganization } from "../contexts/OrganizationContext";

export function ProjectDetails() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isDeleted, setIsDeleted] = useState(false);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [status, setStatus] = useState<Status>("TODO");
    const [priority, setPriority] = useState<Priority>("MEDIUM");

    const queryClient = useQueryClient();
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const menuRef = useRef<HTMLDivElement>(null);

    const { activeOrgId } = useOrganization();
    const initialOrgId = useRef<string | null>(activeOrgId);

    // TODO: derive from the user's role in this org (OWNER / ADMIN)
    const canManage = true;

    useEffect(() => {
        if (!initialOrgId.current && activeOrgId) {
            initialOrgId.current = activeOrgId;
        } else if (initialOrgId.current && activeOrgId && initialOrgId.current !== activeOrgId) {
            navigate('/projects');
        }
    }, [activeOrgId, navigate]);

    // Close the ⋯ menu when clicking outside it
    useEffect(() => {
        if (!isMenuOpen) return;
        const onMouseDown = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node)) setIsMenuOpen(false);
        };
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, [isMenuOpen]);

    const { data: project, isLoading: isProjectLoading, isError: isProjectError } = useQuery({
        queryKey: ['project', projectId],
        queryFn: () => getProject(projectId!),
        enabled: !!projectId && !isDeleted,
    });

    const { data: tasks, isLoading, isError } = useQuery({
        queryKey: ['tasks', projectId],
        queryFn: () => getTasks(projectId!),
        enabled: !!projectId && !isDeleted,
    });

    const createTaskMutations = useMutation({
        mutationFn: () => createTask({
            projectId: projectId!,
            data: { title, description, status, priority }
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
            setIsModalOpen(false);
            setTitle("");
            setDescription("");
            setStatus("TODO");
            setPriority("MEDIUM");
        },
    });

    const updateTaskMutation = useMutation({
        mutationFn: ({ taskId, data }: { taskId: string, data: Partial<CreateTaskProps> }) =>
            updateTask({ taskId, data }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
        }
    });

    const updateProjectMutation = useMutation({
        mutationFn: (input: UpdateProjectInput) => updateProject(projectId!, input),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
                queryClient.invalidateQueries({ queryKey: ['projects'] }), 
            ]);
        },
    });

    const deleteProjectMutation = useMutation({
        mutationFn: () => deleteProject(projectId!),
        onSuccess: () => {
            setIsDeleted(true); 
            navigate('/projects');
            queryClient.removeQueries({ queryKey: ['project', projectId] });
            queryClient.removeQueries({ queryKey: ['tasks', projectId] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
    });

    const closeDeleteModal = () => {
        setIsDeleteModalOpen(false);
        deleteProjectMutation.reset();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        createTaskMutations.mutate();
    };

    if (isLoading || isProjectLoading) return <div className="text-zinc-400">Loading project...</div>;
    if (isError || isProjectError) return <div className="text-red-500">Error fetching project...</div>;
    if (!project) return null;

    // Show the in-flight value immediately instead of flashing the old one
    const pending = updateProjectMutation.isPending ? updateProjectMutation.variables : undefined;
    const shownName = pending?.name ?? project.name;
    const shownDescription = pending?.description ?? project.description;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <InlineEditable
                        value={shownName}
                        required
                        canEdit={canManage}
                        onSave={(name) => updateProjectMutation.mutate({ name })}
                        className="text-2xl font-bold text-zinc-50"
                    />
                    <InlineEditable
                        value={shownDescription}
                        multiline
                        placeholder={canManage ? "Add a description" : ""}
                        canEdit={canManage}
                        onSave={(description) => updateProjectMutation.mutate({ description })}
                        className="text-sm text-zinc-400"
                    />
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-md shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] transition-all"
                    >
                        Create Task
                    </button>

                    {canManage && (
                        <div ref={menuRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsMenuOpen((open) => !open)}
                                className="flex h-10 w-10 items-center justify-center rounded-md text-xl text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                            >
                                ⋯
                            </button>

                            {isMenuOpen && (
                                <div className="absolute right-0 z-10 mt-2 w-44 rounded-md border border-white/10 bg-zinc-900 p-1 shadow-lg">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            setIsDeleteModalOpen(true);
                                        }}
                                        className="w-full rounded px-3 py-2 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
                                    >
                                        Delete project
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {updateProjectMutation.isError && (
                <p role="alert" className="text-sm text-red-400">
                    Failed to update project. Please try again.
                </p>
            )}
            {/* Task table */}
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
                    {tasks?.length === 0 ? (
                        <tr>
                            <td colSpan={3} className="px-4 py-12 text-center">
                                <div className="text-zinc-400">
                                    <p className="text-base font-medium text-zinc-200">No tasks yet</p>
                                    <p className="mt-1 text-sm">Create a task to get started.</p>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        tasks?.map((task: any) => (
                            <tr
                                key={task.id}
                                className="text-zinc-50 border-b border-white/5 last:border-0 hover:bg-zinc-800/50 transition-colors"
                            >
                                <td className="px-4 py-3">{task.title}</td>
                                <td className="px-4 py-3 text-center">
                                    <select
                                        value={task.status}
                                        onChange={(e) => updateTaskMutation.mutate({
                                            taskId: task.id,
                                            data: { status: e.target.value as Status }
                                        })}
                                        disabled={updateTaskMutation.isPending}
                                        className="bg-zinc-800 border border-transparent hover:border-white/20 focus:border-violet-500 rounded-md px-2 py-1 text-xs outline-none cursor-pointer transition-colors disabled:opacity-50"
                                    >
                                        <option value="TODO">To Do</option>
                                        <option value="IN_PROGRESS">In Progress</option>
                                        <option value="DONE">Done</option>
                                    </select>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <select
                                        value={task.priority}
                                        onChange={(e) => updateTaskMutation.mutate({
                                            taskId: task.id,
                                            data: { priority: e.target.value as Priority }
                                        })}
                                        disabled={updateTaskMutation.isPending}
                                        className="bg-zinc-800 border border-transparent hover:border-white/20 focus:border-violet-500 rounded-md px-2 py-1 text-xs outline-none cursor-pointer transition-colors disabled:opacity-50"
                                    >
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="URGENT">Urgent</option>
                                    </select>
                                </td>
                            </tr>
                        ))
                    )}
                    </tbody>
                </table>
            </div>

            {/* Create task modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Create New Task"
            >
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
                                <option value="TODO">To Do</option>
                                <option value="IN_PROGRESS">In Progress</option>
                                <option value="DONE">Done</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-sm text-zinc-400">Priority</label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as Priority)}
                                className="bg-zinc-950 border border-white/10 rounded-md p-2 outline-none focus:border-violet-500 transition-colors"
                            >
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                                <option value="URGENT">Urgent</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-4">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={createTaskMutations.isPending}
                            className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-md shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] transition-all disabled:opacity-50"
                        >
                            {createTaskMutations.isPending ? "Creating..." : "Create Task"}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete project confirmation */}
            <Modal
                isOpen={isDeleteModalOpen}
                onClose={closeDeleteModal}
                title="Delete Project"
            >
                <div className="mb-6 text-zinc-300">
                    Are you sure you want to delete {project.name}? Its tasks will be
                    deleted too. This cannot be undone.
                </div>

                {deleteProjectMutation.isError && (
                    <p role="alert" className="mb-4 text-sm text-red-400">
                        Failed to delete project. Please try again.
                    </p>
                )}

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={closeDeleteModal}
                        disabled={deleteProjectMutation.isPending}
                        className="rounded-md px-4 py-2 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => deleteProjectMutation.mutate()}
                        disabled={deleteProjectMutation.isPending}
                        className="rounded-md bg-red-600 px-6 py-2 text-white shadow-[0_0_15px_rgba(220,38,38,0.3)] transition-all hover:bg-red-500 hover:shadow-[0_0_25px_rgba(220,38,38,0.5)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {deleteProjectMutation.isPending ? "Deleting..." : "Delete"}
                    </button>
                </div>
            </Modal>
        </div>
    );
}