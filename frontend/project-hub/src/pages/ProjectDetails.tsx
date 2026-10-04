import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getTasks, updateTask, type Priority, type Status, type CreateTaskProps} from "../api/tasks";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createTask } from "../api/tasks";
import { Modal } from "../components/Modal";
import { useNavigate } from "react-router-dom";
import { useOrganization } from "../contexts/OrganizationContext";
import { useRef } from "react";

export function ProjectDetails() {
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [status, setStatus] = useState<Status>("TODO");
    const [priority, setPriority] = useState<Priority>("MEDIUM");

    const queryClient = useQueryClient();
    const {projectId} = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    
    const { activeOrgId } = useOrganization();
    const initialOrgId = useRef<string | null>(activeOrgId);

    useEffect(() => {
        if (!initialOrgId.current && activeOrgId) {
            initialOrgId.current = activeOrgId;
        } else if (initialOrgId.current && activeOrgId && initialOrgId.current !== activeOrgId) {
            navigate('/projects');
        }
    }, [activeOrgId, navigate]);
        
    const { data: tasks, isLoading, isError } = useQuery({
        queryKey: ['tasks', projectId],
        queryFn: () => getTasks(projectId!),
        enabled: !!projectId
    }); 

    const createTaskMutations = useMutation({
        mutationFn: () => createTask({
            projectId: projectId!, 
            data: {title, description, status, priority}
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ['tasks', projectId]});
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

    const handleSubmit = (e: React.FormEvent) =>{
        e.preventDefault();
        if (!title.trim()) return;
        createTaskMutations.mutate();
    }

    if (isLoading) return <div className="text-zinc-400">Loading tasks...</div>;
    if (isError) return <div className="text-red-500">Error fetching tasks...</div>;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-zinc-50">Project Tasks</h1>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-md shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] transition-all"
                >
                    Create Task
                </button>
            </div>
            
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

            {/* The Modal and Form */}
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
                            onChange={(e)=> setTitle(e.target.value)}
                            className="bg-zinc-950 border border-white/10 rounded-md p-2 outline-none focus:border-violet-500 transition-colors"
                            required
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm text-zinc-400">Description</label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e)=> setDescription(e.target.value)}
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
        </div>
    );
}