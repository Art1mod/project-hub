import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getOrganizations, getProjects, createProject } from "../api/projects";
import { useState } from "react";

export function Projects () {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    
    const queryClient = useQueryClient();
    
    const {data: orgs} = useQuery({
        queryKey: ['organizations'],
        queryFn: getOrganizations, 
    });

    const activeOrgId = orgs?.[0]?.id;

    const {data: projects, isLoading, isError} = useQuery({
        queryKey: ['projects', activeOrgId],
        queryFn: () => getProjects(activeOrgId!),
        enabled: !!activeOrgId, 
    });

    const createProjectMutation = useMutation({
        mutationFn: () => createProject({ orgId: activeOrgId!, name, description }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects', activeOrgId] });
            setName("");
            setDescription("");
        },
        onError: (err) => {
            console.error("Create project failed", err);
        }
    });

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!name || !activeOrgId) return; 
        createProjectMutation.mutate();
    }

    if (isLoading) return <div className="text-zinc-400">Loading organizations...</div>;
    if (isError) return <div className="text-red-500">Error fetching organizations ...</div>;

    return (
        <div className="flex flex-col gap-6">
            {/* Form Container */}
            <form onSubmit={handleSubmit} className="bg-zinc-900 border border-white/10 rounded-xl p-6 flex gap-4 text-zinc-50 items-center">
                <input
                    type="text"
                    value={name}
                    onChange={(e)=> setName(e.target.value)}
                    placeholder="Project Name"
                    className="bg-zinc-950 border border-white/10 rounded-md p-2 flex-1 outline-none focus:border-violet-500 transition-colors"
                />
                <input
                    type="text"
                    value={description}
                    onChange={(e)=> setDescription(e.target.value)}
                    placeholder="Description"
                    className="bg-zinc-950 border border-white/10 rounded-md p-2 flex-1 outline-none focus:border-violet-500 transition-colors"
                />
                <button
                    type="submit"
                    disabled={createProjectMutation.isPending}
                    className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-md shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] transition-all disabled:opacity-50"
                >
                    {createProjectMutation.isPending ? "Creating..." : "Create"}
                </button>
            </form>
            
            {/* Table Container */}
            <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="text-zinc-400 border-b border-white/10 bg-zinc-950/50">
                        <tr>
                            <th className="px-4 py-3 font-medium">Name</th>
                            <th className="px-4 py-3 font-medium">Description</th>
                        </tr>
                    </thead> 
                    <tbody>
                        {projects?.map((project: any) => (
                            <tr 
                                key={project.id} 
                                className="text-zinc-50 border-b border-white/5 last:border-0 hover:bg-zinc-800/50 transition-colors"
                            >
                                <td className="px-4 py-3">{project.name}</td>
                                <td className="px-4 py-3 whitespace-normal">{project.description}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>    
            </div>
        </div>
    );
}