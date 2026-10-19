import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "../contexts/OrganizationContext";
import { getMembers, removeMember, type Member } from "../api/members";
import { usePermissions } from "../hooks/usePermissions";
import { useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";

export function Members() {
    const { activeOrgId } = useOrganization();
    const { can, role } = usePermissions();
    const queryClient = useQueryClient();
    const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);    
    
    const { data: members, isLoading, isError } = useQuery({
        queryKey: ['members', activeOrgId],
        queryFn: () => getMembers(activeOrgId!),
        enabled: !!activeOrgId
    }); 

    const removeMutation = useMutation({
        mutationFn: (member: Member) => removeMember(activeOrgId!, member.user.id),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['members', activeOrgId] }),
                queryClient.invalidateQueries({ queryKey: ['tasks'] }), 
            ]);
            setMemberToRemove(null);
        },
    });

    const closeRemoveModal = () => {
        setMemberToRemove(null);
        removeMutation.reset();
    };

    const canRemove = (member: Member) =>
        can("member:remove") &&
        !member.isSelf &&
        (role === "OWNER" || member.role === "MEMBER");

    const showActions = can("member:remove");

    if (isLoading) return <div className="text-zinc-400">Loading members...</div>;
    if (isError) return <div className="text-red-500">Error fetching members...</div>;

    const errorMessage = removeMutation.isError
        ? (removeMutation.error as any)?.response?.data?.message ?? "Failed to remove member. Please try again."
        : null;

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
                            {showActions && <th className="px-4 py-3 font-medium text-right"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {members?.map((member) => (
                            <tr
                                key={member.id}
                                className="text-zinc-50 border-b border-white/5 last:border-0 hover:bg-zinc-800/50 transition-colors"
                            >
                                <td className="px-4 py-3">
                                    {member.user.email}
                                    {member.isSelf && <span className="ml-2 text-xs text-zinc-500">(you)</span>}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className="px-2 py-1 bg-zinc-800 rounded-md text-xs">
                                        {member.role.charAt(0).toUpperCase() + member.role.slice(1).toLowerCase()}
                                    </span>
                                </td>
                                {showActions && (
                                    <td className="px-4 py-3 text-right">
                                        {canRemove(member) && (
                                            <button
                                                type="button"
                                                onClick={() => setMemberToRemove(member)}
                                                className="rounded-md px-3 py-1 text-sm text-red-400 transition-colors hover:bg-red-500/10"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <ConfirmModal
                isOpen={!!memberToRemove}
                onClose={closeRemoveModal}
                onConfirm={() => memberToRemove && removeMutation.mutate(memberToRemove)}
                title="Remove Member"
                message={<>Remove {memberToRemove?.user.email} from this organization? Their tasks will be unassigned.</>}
                confirmLabel="Remove"
                pendingLabel="Removing..."
                isPending={removeMutation.isPending}
                error={errorMessage}
            />
        </div>
    );
}