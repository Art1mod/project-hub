import { SessionSlot } from '../schedule';
import { SimUser } from '../population';
import { Step, UserPlan, World } from './schemas';
import { validatePlan } from './validate-plan';

const A = 'org-a';
const B = 'org-b';
const world = (orgId: string, prefix: string): World => ({
    orgId,
    theme: 't',
    projects: [{
        key: `${prefix}P1`, name: 'P', description: 'd', state: 'busy',
        tasks: [
            { key: `${prefix}T1`, title: 'a', description: '', status: 'TODO', priority: 'HIGH', assigneeUserId: null },
            { key: `${prefix}T2`, title: 'b', description: '', status: 'DONE', priority: 'LOW', assigneeUserId: null },
        ],
    }],
    focus: [],
});
const worlds = new Map([[A, world(A, 'a')], [B, world(B, 'b')]]);
const user = (roleA: 'OWNER' | 'ADMIN' | 'MEMBER', roleB: 'ADMIN' | 'MEMBER' = 'MEMBER'): SimUser => ({
    id: 'u1', email: 'u1@x', persona: 'worker', activity: 'regular', homeOrgId: A,
    memberships: [{ orgId: A, role: roleA }, { orgId: B, role: roleB }],
});
const slot = (n: number, leave: 'logout' | 'close_tab' = 'close_tab'): SessionSlot => ({
    slotId: `u1:${n}`, userId: 'u1', start: new Date(0), targetMinutes: 10, driveBy: false, startOrgId: A, leave,
});
const plan = (...sessions: Step[][]): UserPlan => ({
    userId: 'u1',
    sessions: sessions.map((steps, i) => ({ slotId: `u1:${i}`, goal: 'g', steps })),
});
const leave = (how: 'logout' | 'close_tab' = 'close_tab'): Step => ({ step: 'leave', how });
const run = (p: UserPlan, u = user('MEMBER'), slots = p.sessions.map((_, i) => slot(i))) =>
    validatePlan(p, { user: u, worlds, slots });

describe('validatePlan', () => {
    it('passes a valid plan through unchanged', () => {
        const p = plan([{ step: 'open_project', projectKey: 'aP1' }, { step: 'update_task', taskRef: 'aT1' }, leave()]);
        const out = run(p);
        expect(out.dropped).toEqual([]);
        expect(out.plan).toEqual(p);
    });

    it('drops unknown projects and tasks', () => {
        const out = run(plan([{ step: 'open_project', projectKey: 'nope' }, { step: 'open_task', taskRef: 'zzz' }, leave()]));
        expect(out.dropped.map((d) => d.index)).toEqual([0, 1]);
        expect(out.plan.sessions[0].steps).toEqual([leave()]);
    });

    it('drops role-limited steps for a MEMBER and keeps them for an ADMIN', () => {
        const steps: Step[] = [{ step: 'invite' }, { step: 'view_invitations' }, { step: 'delete_project', projectKey: 'aP1' }, leave()];
        expect(run(plan(steps)).dropped).toHaveLength(3);
        expect(run(plan(steps), user('ADMIN')).dropped).toHaveLength(0);
        expect(run(plan([{ step: 'hover_nav', route: '/invitations' }, leave()])).dropped).toHaveLength(1);
    });

    it('drops updates to a task deleted earlier, even in a later session', () => {
        const out = run(plan(
            [{ step: 'delete_task', taskRef: 'aT1' }, { step: 'update_task', taskRef: 'aT1' }, leave()],
            [{ step: 'open_task', taskRef: 'aT1' }, leave()],
        ));
        expect(out.dropped.map((d) => [d.slotId, d.index])).toEqual([['u1:0', 1], ['u1:1', 0]]);
    });

    it('scopes refs to the active org after switch_org', () => {
        const out = run(plan([
            { step: 'switch_org', orgId: B },
            { step: 'open_project', projectKey: 'aP1' },
            { step: 'open_project', projectKey: 'bP1' },
            leave(),
        ]));
        expect(out.dropped.map((d) => d.index)).toEqual([1]);
    });

    it('applies the role held in the active org', () => {
        const out = run(plan([{ step: 'switch_org', orgId: B }, { step: 'invite' }, leave()]), user('ADMIN', 'MEMBER'));
        expect(out.dropped.map((d) => d.index)).toEqual([1]);
    });

    it('drops switch_org to an org the user is not in', () => {
        expect(run(plan([{ step: 'switch_org', orgId: 'org-x' }, leave()])).dropped).toHaveLength(1);
    });

    it('resolves new:<n> only after its create_task, across sessions', () => {
        const out = run(plan(
            [
                { step: 'update_task', taskRef: 'new:1' },
                { step: 'create_task', projectKey: 'aP1', ref: 'new:1' },
                { step: 'upload_attachment', taskRef: 'new:1' },
                leave(),
            ],
            [{ step: 'update_task', taskRef: 'new:1' }, leave()],
        ));
        expect(out.dropped.map((d) => [d.slotId, d.index])).toEqual([['u1:0', 0]]);
    });

    it('rejects a create_task that reuses a ref', () => {
        const out = run(plan([
            { step: 'create_task', projectKey: 'aP1', ref: 'new:1' },
            { step: 'create_task', projectKey: 'aP1', ref: 'new:1' },
            leave(),
        ]));
        expect(out.dropped.map((d) => d.index)).toEqual([1]);
    });

    it('keeps leave last and owned by the slot', () => {
        const out = run(plan([leave('logout'), { step: 'view_members' }]), user('MEMBER'), [slot(0, 'close_tab')]);
        expect(out.plan.sessions[0].steps).toEqual([{ step: 'view_members' }, leave('close_tab')]);
        expect(out.dropped.map((d) => d.index)).toEqual([0]);
        const missing = run(plan([{ step: 'view_members' }]), user('MEMBER'), [slot(0, 'logout')]);
        expect(missing.plan.sessions[0].steps.at(-1)).toEqual(leave('logout'));
    });

    it('drops sessions for unknown slots and fills in missing ones', () => {
        const p: UserPlan = { userId: 'u1', sessions: [{ slotId: 'u1:9', goal: 'g', steps: [leave()] }] };
        const out = run(p, user('MEMBER'), [slot(0)]);
        expect(out.plan.sessions.map((s) => s.slotId)).toEqual(['u1:0']);
        expect(out.plan.sessions[0].steps).toEqual([{ step: 'scan_dashboard', intensity: 'light' }, leave()]);
        expect(out.dropped.some((d) => d.slotId === 'u1:9')).toBe(true);
    });

    it('drops idle outside 0-60 minutes and pages below 1', () => {
        const out = run(plan([
            { step: 'idle', minutes: 0 },
            { step: 'idle', minutes: 120 },
            { step: 'browse_tasks', projectKey: 'aP1', pages: [0] },
            { step: 'browse_tasks', projectKey: 'aP1', pages: [2, 1] },
            leave(),
        ]));
        expect(out.dropped.map((d) => d.index)).toEqual([0, 1, 2]);
    });
});
