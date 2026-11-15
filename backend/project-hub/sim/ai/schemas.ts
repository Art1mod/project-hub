import { z } from 'zod';

/**
 * Output schemas for the two AI calls. Every object is strict (additionalProperties: false) and no
 * numeric/length constraints are used, because structured outputs reject them; ranges are checked in code.
 */

export const STATIC_ROUTES = ['/dashboard', '/projects', '/members', '/invitations', '/settings', '/profile'] as const;

const TaskSchema = z.strictObject({
    key: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    assigneeUserId: z.string().nullable(),
});

const ProjectSchema = z.strictObject({
    key: z.string(),
    name: z.string(),
    description: z.string(),
    state: z.enum(['busy', 'stale', 'behind']),
    tasks: z.array(TaskSchema),
});

export const WorldSchema = z.strictObject({
    orgId: z.string(),
    theme: z.string(),
    projects: z.array(ProjectSchema),
    focus: z.array(z.strictObject({ userId: z.string(), projectKeys: z.array(z.string()) })),
});

const step = <T extends string, S extends z.ZodRawShape>(name: T, shape: S) =>
    z.strictObject({ step: z.literal(name), ...shape });

export const StepSchema = z.discriminatedUnion('step', [
    step('scan_dashboard', { intensity: z.enum(['light', 'heavy']) }),
    step('filter_dashboard', { projectKey: z.string().nullable() }),
    step('open_projects_list', {}),
    step('open_project', { projectKey: z.string() }),
    step('browse_tasks', { projectKey: z.string(), pages: z.array(z.number()) }),
    step('open_task', { taskRef: z.string() }),
    step('update_task', { taskRef: z.string() }),
    step('create_task', { projectKey: z.string(), ref: z.string() }),
    step('delete_task', { taskRef: z.string() }),
    step('upload_attachment', { taskRef: z.string() }),
    step('delete_attachment', { taskRef: z.string() }),
    step('create_project', { name: z.string() }),
    step('update_project', { projectKey: z.string() }),
    step('delete_project', { projectKey: z.string() }),
    step('view_members', {}),
    step('view_invitations', {}),
    step('invite', {}),
    step('cancel_invitation', {}),
    step('hover_nav', { route: z.enum(STATIC_ROUTES) }),
    step('open_settings', {}),
    step('open_profile', {}),
    step('switch_org', { orgId: z.string() }),
    step('idle', { minutes: z.number() }),
    step('leave', { how: z.enum(['logout', 'close_tab']) }),
]);

export const UserPlanSchema = z.strictObject({
    userId: z.string(),
    sessions: z.array(z.strictObject({ slotId: z.string(), goal: z.string(), steps: z.array(StepSchema) })),
});

export type World = z.infer<typeof WorldSchema>;
export type WorldProject = World['projects'][number];
export type WorldTask = WorldProject['tasks'][number];
export type Step = z.infer<typeof StepSchema>;
export type StepName = Step['step'];
export type UserPlan = z.infer<typeof UserPlanSchema>;
export type PlanSession = UserPlan['sessions'][number];

/** JSON schema for `output_config.format`: no `$schema`, unions as `anyOf`. */
export function toApiSchema(schema: z.ZodType): Record<string, unknown> {
    const fix = (node: unknown): unknown => {
        if (Array.isArray(node)) return node.map(fix);
        if (!node || typeof node !== 'object') return node;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node)) {
            if (k === '$schema') continue;
            out[k === 'oneOf' ? 'anyOf' : k] = fix(v);
        }
        return out;
    };
    return fix(z.toJSONSchema(schema)) as Record<string, unknown>;
}
