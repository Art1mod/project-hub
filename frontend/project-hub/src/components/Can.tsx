import type { ReactNode } from "react";
import { usePermissions } from "../hooks/usePermissions";
import type { Permission } from "../permissions";

interface CanProps {
    permission: Permission;
    children: ReactNode;
    fallback?: ReactNode;
}

export function Can({ permission, children, fallback = null }: CanProps) {
    const { can } = usePermissions();
    return <>{can(permission) ? children : fallback}</>;
}