import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getUserPendingInvitations, acceptInvitation } from "../api/invitations";

export function AcceptInvitation() {
    const queryClient = useQueryClient();
     
    const { data: invitations, isLoading, isError } = useQuery({
        queryKey: ['user-invitations'],
        queryFn: getUserPendingInvitations,
    });

    const acceptMutation = useMutation({
        mutationFn: (token: string) => acceptInvitation(token),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['user-invitations'] }),
                queryClient.invalidateQueries({ queryKey: ['invitations'] }),
                queryClient.invalidateQueries({ queryKey: ['organizations'] })
            ]);
        },
        onError: (error) => {
            console.error("Failed to accept invite:", error);
        }
    });

    if (isLoading) return <div className="text-zinc-400">Loading invitations...</div>;
    if (isError) return <div className="text-red-500">Error fetching invitations...</div>;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-zinc-50">My Invitations</h1>
            </div>
            <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="text-zinc-400 border-b border-white/10 bg-zinc-950/50">
                        <tr>
                            <th className="px-4 py-3 font-medium">Organization</th>
                            <th className="px-4 py-3 font-medium">Role</th>
                            <th className="px-4 py-3 font-medium text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invitations?.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-4 py-12 text-center text-zinc-400">
                                    You have no pending invitations.
                                </td>            
                            </tr>
                        ) : (
                            invitations?.map((invitation: any) => (
                                <tr
                                    key={invitation.id}
                                    className="text-zinc-50 border-b border-white/5 last:border-0 hover:bg-zinc-800/50 transition-colors"
                                >
                                    <td className="px-4 py-3">
                                        {invitation.organization?.name || "Unknown Organization"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-1 bg-zinc-800 rounded-md text-xs">
                                            {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1).toLowerCase()}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button 
                                            onClick={() => acceptMutation.mutate(invitation.token)}
                                            disabled={acceptMutation.isPending}
                                            className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                                        >
                                            {acceptMutation.isPending ? "Accepting..." : "Accept"}
                                        </button>
                                    </td>     
                                </tr>    
                            ))
                        )}
                    </tbody>   
                </table>
            </div>
        </div>   
    );
}