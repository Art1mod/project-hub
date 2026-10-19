import type { Role } from "./api/organizations";

export const PERMISSIONS = {
    "project:manage": ["OWNER", "ADMIN"],
    "organization:update": ["OWNER", "ADMIN"],
    "organization:delete": ["OWNER"],
    "invitation:view": ["OWNER", "ADMIN"],
    "member:remove": ["OWNER", "ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;