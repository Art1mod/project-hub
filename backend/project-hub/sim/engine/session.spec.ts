import { Step } from '../ai/schemas';
import { SimUser } from '../population';
import { createRng } from '../rng';
import { SessionSlot } from '../schedule';
import { IdMap, WorldRows } from '../world-db';
import { buildNavEventRow } from '../../src/telemetry/nav-event-row';
import { simulateSession, SimSession } from './session';
import { WorldState } from './world-state';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const P1 = '11111111-0000-4000-8000-000000000001';
const P2 = '22222222-0000-4000-8000-000000000002';
const PB = '33333333-0000-4000-8000-000000000003';
const tid = (i: number) => `44444444-0000-4000-8000-${String(i).padStart(12, '0')}`;
const at = new Date('2026-11-01T00:00:00Z');

function fixture(): { rows: WorldRows; ids: IdMap } {
    const tasks: WorldRows['tasks'] = Array.from({ length: 23 }, (_, i) => ({
        id: tid(i), title: `Task ${String(i).padStart(2, '0')}`, projectId: P1, assigneeId: null, createdAt: at, updatedAt: at,
        status: i < 3 ? 'TODO' : (['TODO', 'IN_PROGRESS', 'DONE'] as const)[i % 3],
        priority: i < 3 ? 'URGENT' : 'MEDIUM',
    }));
    tasks.push({ id: tid(99), title: 'Other org task', projectId: PB, status: 'TODO', priority: 'HIGH', assigneeId: null, createdAt: at, updatedAt: at });
    const rows: WorldRows = {
        organizations: [{ id: A, name: 'A' }, { id: B, name: 'B' }],
        users: [], memberships: [],
        projects: [{ id: P1, name: 'Main', organizationId: A }, { id: P2, name: 'Side', organizationId: A }, { id: PB, name: 'B main', organizationId: B }],
        tasks,
    };
    const ids: IdMap = {
        project: new Map([[`${A}:P1`, P1], [`${A}:P2`, P2], [`${B}:PB`, PB]]),
        task: new Map([...Array.from({ length: 23 }, (_, i) => [`${A}:T${i}`, tid(i)] as [string, string]), [`${B}:TB`, tid(99)]]),
    };
    return { rows, ids };
}

const user = (role: 'ADMIN' | 'MEMBER', persona: SimUser['persona']): SimUser => ({
    id: 'cccccccc-0000-4000-8000-00000000000c', email: 'u@x', persona, activity: 'regular', homeOrgId: A,
    memberships: [{ orgId: A, role }, { orgId: B, role: 'MEMBER' }],
});
const slot = (leave: 'logout' | 'close_tab', driveBy = false, targetMinutes = 8): SessionSlot => ({
    slotId: 's:0', userId: 'u', start: new Date('2026-11-12T09:00:00Z'), targetMinutes, driveBy, startOrgId: A, leave,
});

function run(steps: Step[], u: SimUser, s: SessionSlot, seed = 1): SimSession {
    const { rows, ids } = fixture();
    return simulateSession({ slot: s, steps, user: u, world: new WorldState(rows), ids, refs: new Map(), rng: createRng(seed) });
}

const worker = run([
    { step: 'open_project', projectKey: 'P1' },
    { step: 'browse_tasks', projectKey: 'P1', pages: [2, 3, 2] },
    { step: 'open_task', taskRef: 'T5' },
    { step: 'update_task', taskRef: 'T5' },
    { step: 'leave', how: 'logout' },
], user('MEMBER', 'worker'), slot('logout'));

const lead = run([
    { step: 'scan_dashboard', intensity: 'heavy' },
    { step: 'create_task', projectKey: 'P2', ref: 'new:1' },
    { step: 'upload_attachment', taskRef: 'new:1' },
    { step: 'invite' },
    { step: 'leave', how: 'close_tab' },
], user('ADMIN', 'lead'), slot('close_tab'));

const switcher = run([
    { step: 'open_project', projectKey: 'P1' },
    { step: 'switch_org', orgId: B },
    { step: 'open_project', projectKey: 'PB' },
    { step: 'open_task', taskRef: 'TB' },
    { step: 'leave', how: 'close_tab' },
], user('MEMBER', 'worker'), slot('close_tab'));

const drive = run([{ step: 'scan_dashboard', intensity: 'heavy' }, { step: 'leave', how: 'close_tab' }], user('MEMBER', 'worker'), slot('close_tab', true, 0.6));

const all = [worker, lead, switcher, drive];
const ev = (s: SimSession) => s.events.map((e) => e.event);
const ts = (iso: string) => Date.parse(iso);

describe('simulateSession', () => {
    it('never moves time backwards', () => {
        for (const s of all) {
            const t = ev(s).map((e) => ts(e.clientTs));
            for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1]);
            expect(t[0]).toBeGreaterThanOrEqual(s.slot.start.getTime());
        }
    });

    it('starts with session_start and a first route_change to /dashboard', () => {
        for (const s of all) {
            const [first, second] = ev(s);
            expect(first.type).toBe('session_start');
            expect(second).toMatchObject({ type: 'route_change', toRoute: '/dashboard' });
            expect(second.fromRoute).toBeUndefined();
            expect(second.dwellMs).toBeUndefined();
        }
    });

    it('emits session_end only for logout', () => {
        expect(ev(worker).at(-1)?.type).toBe('session_end');
        for (const s of [lead, switcher, drive]) expect(ev(s).some((e) => e.type === 'session_end')).toBe(false);
    });

    it('follows every route_change with its page_ready (entity_open may sit between)', () => {
        for (const s of all) {
            const list = ev(s);
            list.forEach((e, i) => {
                if (e.type !== 'page_ready') return;
                let j = i - 1;
                while (list[j].type === 'entity_open') j--;
                expect(list[j]).toMatchObject({ type: 'route_change', toRoute: e.toRoute });
                expect(['hit', 'stale', 'miss']).toContain(e.cacheState);
            });
        }
    });

    it('sets dwellMs to the gap between route changes', () => {
        for (const s of all) {
            const routes = ev(s).filter((e) => e.type === 'route_change');
            for (let i = 1; i < routes.length; i++) expect(routes[i].dwellMs).toBe(ts(routes[i].clientTs) - ts(routes[i - 1].clientTs));
        }
    });

    it('never hovers the current route and respects the 2 s cooldown', () => {
        for (const s of all) {
            let route: string | undefined;
            const lastHover = new Map<string, number>();
            for (const e of ev(s)) {
                if (e.type === 'route_change') route = e.toRoute;
                if (e.type !== 'link_hover') continue;
                expect(e.fromRoute).toBe(route);
                expect(e.toRoute).not.toBe(route);
                const key = `${e.toRoute}|${e.entityId ?? ''}|${e.page ?? ''}`;
                const prev = lastHover.get(key);
                if (prev !== undefined) expect(ts(e.clientTs) - prev).toBeGreaterThanOrEqual(2000);
                lastHover.set(key, ts(e.clientTs));
            }
        }
    });

    it('hovers the target 100-1500 ms before each clicked navigation', () => {
        for (const s of [worker, lead]) {
            const list = ev(s);
            list.forEach((e, i) => {
                if (e.type !== 'route_change' || !e.fromRoute) return;
                const hover = list.slice(0, i).reverse().find((h) => h.type === 'link_hover' && h.toRoute === e.toRoute);
                expect(hover).toBeDefined();
                const lag = ts(e.clientTs) - ts(hover!.clientTs);
                expect(lag).toBeGreaterThanOrEqual(100);
                expect(lag).toBeLessThanOrEqual(1500);
            });
        }
    });

    it('pages only while on a project page', () => {
        for (const s of all) {
            let route: string | undefined;
            for (const e of ev(s)) {
                if (e.type === 'route_change') route = e.toRoute;
                if (e.type === 'page_change') {
                    expect(route).toBe('/projects/:id');
                    expect(e).toMatchObject({ entityType: 'project', entityId: P1 });
                }
            }
        }
        expect(ev(worker).filter((e) => e.type === 'page_change').map((e) => e.page)).toEqual(expect.arrayContaining([2, 3]));
    });

    it('emits the actions with the fields real rows have', () => {
        expect(ev(worker).filter((e) => e.type === 'action').map((e) => e.action)).toEqual(['task_update']);
        expect(ev(worker).some((e) => e.type === 'entity_open' && e.entityType === 'task' && e.entityId === tid(5))).toBe(true);
        const upload = ev(lead).find((e) => e.action === 'attachment_upload')!;
        expect(upload.latencyMs).toBeGreaterThanOrEqual(200);
        expect(upload.bytes).toBeGreaterThan(0);
        const created = ev(lead).find((e) => e.action === 'task_create')!;
        expect(upload.entityId).toBe(created.entityId);
        const invite = ev(lead).find((e) => e.action === 'invitation_create')!;
        expect(invite.entityType).toBeUndefined();
        expect(invite.entityId).toBeUndefined();
        expect(ev(worker).some((e) => e.action === 'invitation_create')).toBe(false);
    });

    it('switches org: later events carry the new org and the project page redirects', () => {
        const orgs = switcher.events.map((e) => e.orgId);
        expect(orgs[0]).toBe(A);
        expect(orgs.at(-1)).toBe(B);
        const switchedAt = orgs.indexOf(B);
        expect(switcher.events[switchedAt].event).toMatchObject({ type: 'route_change', fromRoute: '/projects/:id', toRoute: '/projects' });
        expect(ev(switcher).some((e) => e.type === 'entity_open' && e.entityId === PB)).toBe(true);
    });

    it('keeps a drive-by under a minute without session_end', () => {
        const t = ev(drive).map((e) => ts(e.clientTs));
        expect(t.at(-1)! - t[0]).toBeLessThan(60_000);
        expect(ev(drive).some((e) => e.type === 'link_hover')).toBe(true);
    });

    it('produces only events the server would store', () => {
        const SALT = 's'.repeat(32);
        const ctx = { sessionId: 's', variant: 'control', userHash: 'u', tenantHash: 't', role: 'MEMBER' as const };
        for (const s of all) {
            for (const { event } of s.events) {
                expect(buildNavEventRow(event, ctx, { now: ts(event.clientTs) + 5000, salt: SALT })).not.toBeNull();
            }
        }
    });

    it('is deterministic for a seed', () => {
        const again = run([
            { step: 'open_project', projectKey: 'P1' },
            { step: 'browse_tasks', projectKey: 'P1', pages: [2, 3, 2] },
            { step: 'open_task', taskRef: 'T5' },
            { step: 'update_task', taskRef: 'T5' },
            { step: 'leave', how: 'logout' },
        ], user('MEMBER', 'worker'), slot('logout'));
        expect(again).toEqual(worker);
    });
});
