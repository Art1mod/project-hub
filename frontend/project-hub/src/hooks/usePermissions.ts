import { useOrganization } from "../contexts/OrganizationContext";
import { PERMISSIONS, type Permission } from "../permissions";
import type { Role } from "../api/organizations";

export function usePermissions() {
    const { activeRole } = useOrganization();

    const can = (permission: Permission) =>
        activeRole !== null &&
        (PERMISSIONS[permission] as readonly Role[]).includes(activeRole);

    return { can, role: activeRole };
}