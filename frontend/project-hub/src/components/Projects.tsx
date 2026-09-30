import { useQuery } from "@tanstack/react-query";
import { getOrganizations, getProjects } from "../api/projects";

export function Projects () {
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

    if (isLoading) return <div className="text-zinc-400">Loading organizations...</div>;
    if (isError) return <div className="text-red-500">Error fetching organizations ...</div>;

    return (
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
    );
}
