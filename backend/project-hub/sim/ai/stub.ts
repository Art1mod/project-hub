import { createRng, Rng } from '../rng';
import { Population, SimUser } from '../population';
import { BatchClient, BatchItem, BatchOutcome } from './batch';
import { PlanSession, Step, UserPlan, World, WorldProject } from './schemas';

const NO_USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

/**
 * Deterministic, offline stand-in for the Claude batch client: builds plausible worlds and plans from
 * the population and the slot lines in the prompt. For dry runs and tests; costs nothing.
 */
export class StubBatchClient implements BatchClient {
    constructor(private readonly pop: Population, private readonly seed: number) {}

    async run(items: BatchItem[]): Promise<BatchOutcome[]> {
        return items.map((item) => {
            if (item.customId.startsWith('world-')) {
                return { customId: item.customId, ok: true, json: this.world(item.customId.slice('world-'.length)), usage: NO_USAGE };
            }
            const userId = item.customId.slice('plan-'.length);
            const text = item.user.map((b) => b.text).join('\n');
            return { customId: item.customId, ok: true, json: this.plan(userId, text), usage: NO_USAGE };
        });
    }

    private members(orgId: string): SimUser[] {
        return this.pop.users.filter((u) => u.memberships.some((m) => m.orgId === orgId));
    }

    world(orgId: string): World {
        const rng = createRng(this.seed).fork(`stub-world:${orgId}`);
        const members = this.members(orgId);
        const size = this.pop.orgs.find((o) => o.id === orgId)?.size ?? members.length;
        const projectCount = size >= 30 ? 10 : size >= 12 ? 6 : 4;
        const projects: WorldProject[] = Array.from({ length: projectCount }, (_, i) => {
            const key = `P${i + 1}`;
            const taskCount = i === 0 ? rng.int(21, 30) : rng.int(3, 15);
            return {
                key,
                name: `Project ${i + 1}`,
                description: '',
                state: i === 0 ? 'busy' : rng.pick(['busy', 'stale', 'behind'] as const),
                tasks: Array.from({ length: taskCount }, (_, t) => ({
                    key: `${key}-T${String(t + 1).padStart(2, '0')}`,
                    title: `Task ${i + 1}.${t + 1}`,
                    description: '',
                    status: rng.weighted([['TODO', 0.4], ['IN_PROGRESS', 0.3], ['DONE', 0.3]] as const),
                    priority: rng.weighted([['LOW', 0.25], ['MEDIUM', 0.5], ['HIGH', 0.17], ['URGENT', 0.08]] as const),
                    assigneeUserId: members.length > 0 && rng.chance(0.8) ? rng.pick(members).id : null,
                })),
            };
        });
        const focus = members.map((u) => ({ userId: u.id, projectKeys: rng.chance(0.6) ? ['P1'] : [rng.pick(projects).key] }));
        return { orgId, theme: `stub org ${orgId.slice(0, 4)}`, projects, focus };
    }

    plan(userId: string, prompt: string): UserPlan {
        const user = this.pop.users.find((u) => u.id === userId);
        const rng = createRng(this.seed).fork(`stub-plan:${userId}`);
        const slotRe = /- slotId (\S+): .*?(?:about (\d+) min|drive-by).*?starts in org (\S+), ends with (logout|close_tab)/g;
        let created = 0;
        const sessions: PlanSession[] = [...prompt.matchAll(slotRe)].map(([, slotId, minutes, orgId, leave]) => {
            const world = this.world(orgId);
            const focusKey = world.focus.find((f) => f.userId === userId)?.projectKeys[0] ?? 'P1';
            const project = world.projects.find((p) => p.key === focusKey) ?? world.projects[0];
            // Like the prompt asks of the AI: about one step per 20-60 s of session.
            const want = Math.max(1, Math.round((Number(minutes ?? 1) * 60) / 40));
            const steps: Step[] = [];
            while (steps.length < want) {
                const p = rng.chance(0.7) ? project : rng.pick(world.projects);
                steps.push(...this.steps(user?.persona ?? 'worker', p, rng, () => `new:${++created}`));
            }
            return { slotId, goal: 'stub session', steps: [...steps.slice(0, Math.max(want, 1)), { step: 'leave', how: leave as 'logout' | 'close_tab' }] };
        });
        return { userId, sessions };
    }

    private steps(persona: SimUser['persona'], project: WorldProject, rng: Rng, nextRef: () => string): Step[] {
        const task = () => rng.pick(project.tasks).key;
        switch (persona) {
            case 'manager':
                return [{ step: 'scan_dashboard', intensity: 'light' }, { step: 'view_members' }, ...(rng.chance(0.5) ? [{ step: 'view_invitations' } as Step] : [])];
            case 'lead': {
                const t = task();
                const s: Step[] = [{ step: 'scan_dashboard', intensity: 'heavy' }, { step: 'open_project', projectKey: project.key }, { step: 'update_task', taskRef: t }];
                if (rng.chance(0.5)) s.push({ step: 'create_task', projectKey: project.key, ref: nextRef() });
                if (rng.chance(0.2)) s.push({ step: 'invite' });
                return s;
            }
            case 'scanner':
                return [{ step: 'open_project', projectKey: project.key }, { step: 'browse_tasks', projectKey: project.key, pages: [2, 3, 2, 1] }, { step: 'open_task', taskRef: task() }];
            case 'worker': {
                const t = task();
                const s: Step[] = [{ step: 'open_project', projectKey: project.key }, { step: 'open_task', taskRef: t }, { step: 'update_task', taskRef: t }];
                if (rng.chance(0.3)) s.push({ step: 'upload_attachment', taskRef: t });
                if (rng.chance(0.2)) s.push({ step: 'create_task', projectKey: project.key, ref: nextRef() });
                return s;
            }
        }
    }
}
