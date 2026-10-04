import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "../contexts/OrganizationContext";
import { createInvitation, getPendingInvitations, type CreateInvitationProps, type Role } from "../api/invitations";
import { useState } from "react";

export function Invitations () {
    const { activeOrgId } = useOrganization();
    const queryClient = useQueryClient();

    const [email, setEmail] = useState("");
    const [role, setRole] = useState<Role>("MEMBER");
    
    const createInvitationMutation = useMutation({
        mutationFn: (data: CreateInvitationProps) => 
            createInvitation({ orgId: activeOrgId!, data }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invitations', activeOrgId] }); 
            setEmail("");
            setRole("MEMBER");
        }, 
        onError: (error) => {
            console.error("Failed to send invitation:", error);
        }
    });

    const { data: invitations, isLoading, isError } = useQuery({
            queryKey: ['invitations', activeOrgId],
            queryFn: () => getPendingInvitations(activeOrgId!),
            enabled: !!activeOrgId
        });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !activeOrgId) return;
        createInvitationMutation.mutate({ email, role });
    };

    if (isLoading) return <div className="text-zinc-400">Loading invitations...</div>;
    if (isError) return <div className="text-red-500">Error fetching invitations...</div>;

    return (
        <div className="flex flex-col gap-6">
            <h1 className="text-2xl font-bold text-zinc-50">Invitations</h1>
            <form onSubmit={handleSubmit} className="bg-zinc-900 border border-white/10 rounded-xl p-6 flex gap-4 text-zinc-50 items-center">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="bg-zinc-950 border border-white/10 rounded-md p-2 flex-1 outline-none focus:border-violet-500 transition-colors"
                    required
                />
                <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="bg-zinc-950 border border-white/10 rounded-md p-2 outline-none focus:border-violet-500 transition-colors"
                >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                </select>
                <button
                    type="submit"
                    disabled={createInvitationMutation.isPending}
                    className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-md shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] transition-all disabled:opacity-50 whitespace-nowrap"
                >
                    {createInvitationMutation.isPending ? "Sending..." : "Send Invite"}
                </button>
            </form>

            <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="text-zinc-400 border-b border-white/10 bg-zinc-950/50">
                        <tr>
                            <th className="px-4 py-3 font-medium">Email</th>
                            <th className="px-4 py-3 font-medium text-center">Role</th>
                            <th className="px-4 py-3 font-medium text-right">Status</th>
                        </tr>
                    </thead> 
                    <tbody>
                        {invitations?.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-4 py-12 text-center text-zinc-400">
                                    No pending invitations.
                                </td>            
                            </tr>
                        ) : (
                            invitations?.map((invitation: any) => (
                                <tr 
                                    key={invitation.id}
                                    className="text-zinc-50 border-b border-white/5 last:border-0 hover:bg-zinc-800/50 transition-colors"
                                >
                                    <td className="px-4 py-3">
                                        {invitation.email}  
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="px-2 py-1 bg-zinc-800 rounded-md text-xs">
                                            {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1).toLowerCase()}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <span className="px-2 py-1 bg-zinc-800 rounded-md text-xs text-yellow-500">
                                            Pending
                                        </span>
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