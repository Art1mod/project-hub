import { useQuery } from "@tanstack/react-query";
import { getMembers } from "../../api/members";
import type { Assignee } from "../../api/tasks";
import { useOrganization } from "../../contexts/OrganizationContext";

interface AssigneeSelectProps {
    value: string | null;
    onChange: (assigneeId: string | null) => void;
    current?: Assignee | null; 
    className?: string;
}

export function AssigneeSelect({ value, onChange, current, className = "" }: AssigneeSelectProps) {
    const { activeOrgId } = useOrganization();

    const { data: members = [], isLoading } = useQuery({
        queryKey: ["members", activeOrgId],
        queryFn: () => getMembers(activeOrgId!),
        enabled: !!activeOrgId,
    });

    const hasCurrent = current && !members.some((m) => m.user.id === current.id);

    return (
        <select
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={isLoading}
            className={className}
        >
            <option value="">Unassigned</option>
            {hasCurrent && <option value={current.id}>{current.email}</option>}
            {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.email}</option>
            ))}
        </select>
    );
}