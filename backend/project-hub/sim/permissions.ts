import { Role } from '@prisma/client';
import type { StepName } from './ai/schemas';

/** Mirrors frontend/project-hub/src/permissions.ts: project:manage and invitation:view are OWNER/ADMIN. */
const MANAGER_ROLES: readonly Role[] = ['OWNER', 'ADMIN'];

export const ROLE_LIMITED_STEPS: ReadonlySet<StepName> = new Set<StepName>([
    'create_project',
    'update_project',
    'delete_project',
    'view_invitations',
    'invite',
    'cancel_invitation',
]);

/** Routes only OWNER/ADMIN can see (guarded by RequirePermission in App.tsx). */
export const ROLE_LIMITED_ROUTES: ReadonlySet<string> = new Set(['/invitations']);

export const isManager = (role: Role | undefined) => role !== undefined && MANAGER_ROLES.includes(role);

export function canUseStep(role: Role | undefined, step: StepName): boolean {
    return !ROLE_LIMITED_STEPS.has(step) || isManager(role);
}

export function canSeeRoute(role: Role | undefined, route: string): boolean {
    return !ROLE_LIMITED_ROUTES.has(route) || isManager(role);
}
