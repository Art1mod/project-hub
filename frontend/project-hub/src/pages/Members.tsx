import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "../contexts/OrganizationContext";
import { getMembers } from "../api/members";

export function Members() {
    const { activeOrgId } = useOrganization();    
    
    const { data: members, isLoading, isError } = useQuery({
        queryKey: ['members', activeOrgId],
        queryFn: () => getMembers(activeOrgId!),
        enabled: !!activeOrgId
    }); 

    if (isLoading) return <div className="text-zinc-400">Loading members...</div>;
    if (isError) return <div className="text-red-500">Error fetching members...</div>;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-zinc-50">Organization Members</h1>
            </div>

            <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="text-zinc-400 border-b border-white/10 bg-zinc-950/50">
                        <tr>
                            <th className="px-4 py-3 font-medium">Email</th>
                            <th className="px-4 py-3 font-medium text-center">Role</th>
                        </tr>
                    </thead> 
                    <tbody>
                        {members?.map((member: any) => (
                            <tr 
                                key={member.id}
                                className="text-zinc-50 border-b border-white/5 last:border-0 hover:bg-zinc-800/50 transition-colors"
                            >
                                <td className="px-4 py-3">
                                        {member.user?.email}  
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className="px-2 py-1 bg-zinc-800 rounded-md text-xs ">
                                        {member.role.charAt(0).toUpperCase() + member.role.slice(1).toLowerCase()}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>      
            </div>
        </div>
    );
}