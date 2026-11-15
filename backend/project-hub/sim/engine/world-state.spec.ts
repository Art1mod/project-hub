import { createRng } from '../rng';
import { WorldRows } from '../world-db';
import { WorldState } from './world-state';

const ORG = 'org-1';
const P = 'proj-1';
const statuses = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const at = new Date('2026-11-01T00:00:00Z');

// 23 tasks: t00..t22; t00-t02 are open HIGH/URGENT
const tasks = Array.from({ length: 23 }, (_, i) => ({
    id: `t${String(i).padStart(2, '0')}`,
    title: `Task ${String(i).padStart(2, '0')}`,
    status: i < 3 ? 'TODO' : statuses[i % 3],
    priority: i < 3 ? (i === 0 ? 'URGENT' : 'HIGH') : i % 2 === 0 ? 'LOW' : 'MEDIUM',
    projectId: P, assigneeId: null, createdAt: at, updatedAt: at,
})) as WorldRows['tasks'];
tasks.push({ id: 'done-urgent', title: 'Done urgent', status: 'DONE', priority: 'URGENT', projectId: P, assigneeId: null, createdAt: at, updatedAt: at });

const rows: WorldRows = {
    organizations: [{ id: ORG, name: 'Org' }],
    users: [],
    memberships: [],
    projects: [{ id: P, name: 'Main', organizationId: ORG }, { id: 'proj-2', name: 'Other', organizationId: ORG }],
    tasks,
};

describe('WorldState', () => {
    it('orders tasks like the task table and pages them by 10', () => {
        const w = new WorldState(rows);
        const list = w.tasksOf(P);
        expect(list).toHaveLength(24);
        // status asc, then priority desc
        const rank = (t: { status: string; priority: string }) => statuses.indexOf(t.status as never) * 10 - priorities.indexOf(t.priority as never);
        for (let i = 1; i < list.length; i++) expect(rank(list[i])).toBeGreaterThanOrEqual(rank(list[i - 1]));
        expect(w.pageCount(P)).toBe(3);
        expect(w.pageOf(list[0].id)).toBe(1);
        expect(w.pageOf(list[10].id)).toBe(2);
        expect(w.pageOf(list[23].id)).toBe(3);
        expect(w.pageCount('proj-2')).toBe(1);
    });

    it('lists open HIGH/URGENT tasks for attention, most urgent first, at most 6', () => {
        const w = new WorldState(rows);
        const att = w.attention(ORG);
        expect(att.map((a) => a.taskId)).toEqual(['t00', 't01', 't02']);
        expect(att[0].page).toBe(w.pageOf('t00'));
        expect(att.every((a) => a.projectId === P)).toBe(true);
        expect(w.attention(ORG, 'proj-2')).toEqual([]);
    });

    it('caps attention at 6', () => {
        const many = { ...rows, tasks: rows.tasks.map((t) => ({ ...t, status: 'TODO' as const, priority: 'HIGH' as const })) };
        expect(new WorldState(many).attention(ORG)).toHaveLength(6);
    });

    it('drops a task from attention once it is done, and records the change', () => {
        const w = new WorldState(rows);
        w.apply({ action: 'task_update', taskId: 't00', at, rng: createRng(1), status: 'DONE' });
        expect(w.attention(ORG).map((a) => a.taskId)).not.toContain('t00');
        expect(w.changes().tasks.updated.map((t) => t.id)).toEqual(['t00']);
    });

    it('creates and deletes tasks and attachments', () => {
        const w = new WorldState(rows);
        w.apply({ action: 'task_create', projectId: 'proj-2', taskId: 'new-1', title: 'New', at, rng: createRng(2) });
        expect(w.tasksOf('proj-2').map((t) => t.id)).toEqual(['new-1']);
        w.apply({ action: 'attachment_upload', taskId: 'new-1', attachmentId: 'a-1', uploaderId: 'u', bytes: 1200, at, rng: createRng(3) });
        w.apply({ action: 'task_delete', taskId: 't05', at, rng: createRng(4) });
        expect(w.tasksOf(P).map((t) => t.id)).not.toContain('t05');
        const c = w.changes();
        expect(c.tasks.created.map((t) => t.id)).toEqual(['new-1']);
        expect(c.tasks.deleted).toEqual(['t05']);
        expect(c.attachments.created).toEqual([expect.objectContaining({ id: 'a-1', taskId: 'new-1', size: 1200 })]);
    });
});
