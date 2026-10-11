import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useOrganization } from "../contexts/OrganizationContext";
import { usePermissions } from "../hooks/usePermissions";
import type { Permission } from "../permissions";

interface RequirePermissionProps {
    permission: Permission;
    children: ReactNode;
}

export function RequirePermission({ permission, children }: RequirePermissionProps) {
    const { isLoading } = useOrganization();
    const { can } = usePermissions();

    if (isLoading) return null;
    if (!can(permission)) return <Navigate to="/dashboard" replace />;
    return <>{children}</>;
}