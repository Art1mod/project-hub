import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getTasks } from "../api/tasks";

export function ProjectDetails() {
    
    const {projectId} = useParams<{ projectId: string }>();
        
    const { data: tasks, isLoading, isError } = useQuery({
        queryKey: ['tasks', projectId],
        queryFn: () => getTasks(projectId!),
        enabled: !!projectId
    }); 

    if (isLoading) return <div className="text-zinc-400">Loading tasks...</div>;
    if (isError) return <div className="text-red-500">Error fetching tasks...</div>;

    return (
        <div className="flex flex-col gap-6">
            <h1 className="text-2xl font-bold text-zinc-50">Project Tasks</h1>
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
                            <td
                                colSpan={3}
                                className="px-4 py-12 text-center"
                            >
                                <div className="text-zinc-400">
                                    <p className="text-base font-medium text-zinc-200">
                                        No tasks yet
                                    </p>
                                    <p className="mt-1 text-sm">
                                        Create a task to get started.
                                    </p>
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
                                    <span className="px-2 py-1 bg-zinc-800 rounded-md text-xs">{task.status}</span>
                                </td>
                                <td className="px-4 py-3 text-center">{task.priority}</td>
                            </tr>
                        ))
                    )}
                    </tbody>
                </table>       
            </div>
        </div>
    );
}