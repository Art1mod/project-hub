import { canSeeRoute, canUseStep } from '../permissions';
import { roleIn, SimUser } from '../population';
import { SessionSlot } from '../schedule';
import { PlanSession, Step, UserPlan, World } from './schemas';

export interface PlanDrop {
    slotId: string;
    index: number;
    reason: string;
}

export interface PlanContext {
    user: SimUser;
    worlds: Map<string, World>;
    /** This user's slots, in order. */
    slots: SessionSlot[];
}

const NEW_REF = /^new:\d+$/;
const MAX_IDLE_MIN = 60;

/**
 * Walks a user's plan in order and drops any step the real app would not allow or that refers to
 * something that does not exist at that point. Sessions are re-keyed to the user's slots.
 */
export function validatePlan(plan: UserPlan, ctx: PlanContext): { plan: UserPlan; dropped: PlanDrop[] } {
    const dropped: PlanDrop[] = [];
    const deletedTasks = new Set<string>(); // `${orgId}:${key}`
    const deletedProjects = new Set<string>();
    const created = new Map<string, { orgId: string }>(); // new:<n> -> org it lives in
    const bySlot = new Map<string, PlanSession>();

    for (const s of plan.sessions) {
        if (!ctx.slots.some((slot) => slot.slotId === s.slotId)) {
            dropped.push({ slotId: s.slotId, index: -1, reason: 'session for unknown slot' });
        } else if (bySlot.has(s.slotId)) {
            dropped.push({ slotId: s.slotId, index: -1, reason: 'duplicate session for slot' });
        } else {
            bySlot.set(s.slotId, s);
        }
    }

    const sessions: PlanSession[] = ctx.slots.map((slot) => {
        const source = bySlot.get(slot.slotId);
        if (!source) {
            return { slotId: slot.slotId, goal: 'quick look', steps: [{ step: 'scan_dashboard', intensity: 'light' }, { step: 'leave', how: slot.leave }] };
        }

        let activeOrg = slot.startOrgId;
        const kept: Step[] = [];
        const drop = (index: number, reason: string) => dropped.push({ slotId: slot.slotId, index, reason });

        const projectOk = (key: string) => {
            const world = ctx.worlds.get(activeOrg);
            return !!world?.projects.some((p) => p.key === key) && !deletedProjects.has(`${activeOrg}:${key}`);
        };
        const projectOfTask = (key: string) => ctx.worlds.get(activeOrg)?.projects.find((p) => p.tasks.some((t) => t.key === key));
        const taskOk = (ref: string) => {
            if (NEW_REF.test(ref)) return created.get(ref)?.orgId === activeOrg && !deletedTasks.has(`${activeOrg}:${ref}`);
            const project = projectOfTask(ref);
            return !!project && !deletedProjects.has(`${activeOrg}:${project.key}`) && !deletedTasks.has(`${activeOrg}:${ref}`);
        };

        source.steps.forEach((s, index) => {
            const role = roleIn(ctx.user, activeOrg);
            if (!canUseStep(role, s.step)) return drop(index, `${s.step} not allowed for ${role} in ${activeOrg}`);
            if (s.step === 'leave') {
                if (index !== source.steps.length - 1) return drop(index, 'leave before the last step');
                return; // the slot owns how the session ends; re-added below
            }

            switch (s.step) {
                case 'filter_dashboard':
                    if (s.projectKey !== null && !projectOk(s.projectKey)) return drop(index, `unknown project ${s.projectKey}`);
                    break;
                case 'open_project':
                case 'update_project':
                    if (!projectOk(s.projectKey)) return drop(index, `unknown project ${s.projectKey}`);
                    break;
                case 'delete_project':
                    if (!projectOk(s.projectKey)) return drop(index, `unknown project ${s.projectKey}`);
                    deletedProjects.add(`${activeOrg}:${s.projectKey}`);
                    break;
                case 'browse_tasks':
                    if (!projectOk(s.projectKey)) return drop(index, `unknown project ${s.projectKey}`);
                    if (s.pages.length === 0 || s.pages.some((p) => !Number.isInteger(p) || p < 1)) return drop(index, 'invalid pages');
                    break;
                case 'open_task':
                case 'update_task':
                case 'upload_attachment':
                case 'delete_attachment':
                    if (!taskOk(s.taskRef)) return drop(index, `unknown or deleted task ${s.taskRef}`);
                    break;
                case 'delete_task':
                    if (!taskOk(s.taskRef)) return drop(index, `unknown or deleted task ${s.taskRef}`);
                    deletedTasks.add(`${activeOrg}:${s.taskRef}`);
                    break;
                case 'create_task':
                    if (!projectOk(s.projectKey)) return drop(index, `unknown project ${s.projectKey}`);
                    if (!NEW_REF.test(s.ref) || created.has(s.ref)) return drop(index, `invalid or reused ref ${s.ref}`);
                    created.set(s.ref, { orgId: activeOrg });
                    break;
                case 'hover_nav':
                    if (!canSeeRoute(role, s.route)) return drop(index, `${s.route} not visible to ${role}`);
                    break;
                case 'switch_org':
                    if (s.orgId === activeOrg || !roleIn(ctx.user, s.orgId)) return drop(index, `cannot switch to ${s.orgId}`);
                    activeOrg = s.orgId;
                    break;
                case 'idle':
                    if (!(s.minutes > 0 && s.minutes <= MAX_IDLE_MIN)) return drop(index, `idle ${s.minutes} min out of range`);
                    break;
                default:
                    break;
            }
            kept.push(s);
        });

        // The slot decides logout vs close_tab (not a drop), so the overall share stays on target.
        kept.push({ step: 'leave', how: slot.leave });
        return { slotId: slot.slotId, goal: source.goal, steps: kept };
    });

    return { plan: { userId: plan.userId, sessions }, dropped };
}
