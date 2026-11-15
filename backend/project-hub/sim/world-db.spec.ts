import { PrismaClient } from '@prisma/client';
import { World } from './ai/schemas';
import { buildPopulation } from './population';
import { createRng } from './rng';
import { assertEmptyOrReset, worldToRows } from './world-db';

const pop = buildPopulation(createRng(42), { orgs: 10, users: 150 });
const worldFor = (orgId: string, n: number): World => {
    const members = pop.users.filter((u) => u.memberships.some((m) => m.orgId === orgId));
    return {
        orgId, theme: `theme ${n}`,
        projects: [1, 2, 3, 4].map((p) => ({
            key: `P${p}`, name: `Project ${p}`, description: '', state: 'busy' as const,
            tasks: Array.from({ length: p === 1 ? 22 : 3 }, (_, t) => ({
                key: `P${p}-T${t}`, title: `T${t}`, description: '', status: 'TODO' as const, priority: 'MEDIUM' as const,
                // every 5th task points at a user from another org, which must be cleared
                assigneeUserId: t % 5 === 4 ? 'not-a-member' : members[t % members.length].id,
            })),
        })),
        focus: [],
    };
};
const worlds = new Map(pop.orgs.map((o, i) => [o.id, worldFor(o.id, i)]));
const BASE = new Date('2026-10-13T00:00:00Z');

describe('worldToRows', () => {
    const { rows, ids, warnings } = worldToRows(pop, worlds, createRng(7), BASE);

    it('creates the orgs, users and memberships of the population', () => {
        expect(rows.organizations).toHaveLength(10);
        expect(rows.users).toHaveLength(150);
        expect(rows.memberships).toHaveLength(pop.users.reduce((s, u) => s + u.memberships.length, 0));
    });

    it('links every task to an existing project and assigns only org members', () => {
        const projectOrg = new Map(rows.projects.map((p) => [p.id, p.organizationId]));
        const memberOf = new Set(rows.memberships.map((m) => `${m.organizationId}:${m.userId}`));
        for (const t of rows.tasks) {
            expect(projectOrg.has(t.projectId)).toBe(true);
            if (t.assigneeId) expect(memberOf.has(`${projectOrg.get(t.projectId)}:${t.assigneeId}`)).toBe(true);
        }
        expect(rows.tasks.some((t) => t.assigneeId === null)).toBe(true);
        expect(warnings.length).toBeGreaterThan(0);
    });

    it('maps world keys to generated ids', () => {
        const org = pop.orgs[0].id;
        expect(ids.project.get(`${org}:P1`)).toBe(rows.projects.find((p) => p.organizationId === org && p.name === 'Project 1')?.id);
        expect(ids.task.size).toBe(rows.tasks.length);
    });

    it('is stable for the same seed', () => {
        expect(worldToRows(pop, worlds, createRng(7), BASE).rows).toEqual(rows);
    });

    it('never stores a usable password', () => {
        expect(rows.users.every((u) => !/^\$2[aby]\$/.test(u.password))).toBe(true);
    });

    it('dates everything before the simulated window', () => {
        for (const p of rows.projects) expect(new Date(p.createdAt as Date).getTime()).toBeGreaterThanOrEqual(BASE.getTime());
        for (const t of rows.tasks) expect(new Date(t.createdAt as Date).getTime()).toBeLessThan(BASE.getTime() + 30 * 86_400_000);
    });
});

describe('assertEmptyOrReset', () => {
    const prismaWith = (orgs: number) => ({ organization: { count: async () => orgs } }) as unknown as PrismaClient;

    it('refuses a non-empty sim database without --reset', async () => {
        await expect(assertEmptyOrReset(prismaWith(1), false, [])).rejects.toThrow(/--reset/);
    });

    it('accepts an empty database', async () => {
        await expect(assertEmptyOrReset(prismaWith(0), false, [])).resolves.toBeUndefined();
    });
});
