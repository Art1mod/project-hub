import * as fs from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { World } from './ai/schemas';
import { stableStringify } from './ai/stable-json';
import { Population } from './population';
import { Rng } from './rng';

export interface WorldRows {
    organizations: Prisma.OrganizationCreateManyInput[];
    users: Prisma.UserCreateManyInput[];
    memberships: Prisma.MembershipCreateManyInput[];
    projects: Prisma.ProjectCreateManyInput[];
    tasks: Prisma.TaskCreateManyInput[];
}

export interface IdMap {
    /** `${orgId}:${projectKey}` -> project uuid */
    project: Map<string, string>;
    /** `${orgId}:${taskKey}` -> task uuid */
    task: Map<string, string>;
}

export interface Manifest {
    orgIds: string[];
    userIds: string[];
    tenantHashes: string[];
}

/** Not a bcrypt hash, so no simulated user can ever log in. */
export const NO_LOGIN_PASSWORD = '!sim-no-login';
const HISTORY_MS = 30 * 86_400_000;

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Builds the app-table rows for the simulated orgs. `baseTime` is the start of the history before
 * the simulated window; every created/updated timestamp falls in [baseTime, baseTime + 30 days).
 */
export function worldToRows(pop: Population, worlds: Map<string, World>, rng: Rng, baseTime: Date): { rows: WorldRows; ids: IdMap; warnings: string[] } {
    const base = baseTime.getTime();
    const at = () => new Date(base + Math.floor(rng.next() * HISTORY_MS));
    const warnings: string[] = [];
    const rows: WorldRows = { organizations: [], users: [], memberships: [], projects: [], tasks: [] };
    const ids: IdMap = { project: new Map(), task: new Map() };

    for (const org of pop.orgs) {
        const world = worlds.get(org.id);
        const createdAt = at();
        rows.organizations.push({
            id: org.id,
            name: titleCase(world?.theme ?? `Organization ${org.index + 1}`).slice(0, 80),
            createdAt,
            updatedAt: createdAt,
        });
    }

    for (const user of pop.users) {
        const createdAt = at();
        rows.users.push({ id: user.id, email: user.email, password: NO_LOGIN_PASSWORD, createdAt, updatedAt: createdAt });
        for (const m of user.memberships) {
            rows.memberships.push({ id: rng.uuid(), role: m.role, userId: user.id, organizationId: m.orgId });
        }
    }

    const membersOf = new Map<string, Set<string>>();
    for (const m of rows.memberships) {
        const set = membersOf.get(m.organizationId) ?? new Set<string>();
        set.add(m.userId);
        membersOf.set(m.organizationId, set);
    }

    for (const org of pop.orgs) {
        const world = worlds.get(org.id);
        if (!world) continue;
        for (const project of world.projects) {
            const projectId = rng.uuid();
            const createdAt = at();
            ids.project.set(`${org.id}:${project.key}`, projectId);
            rows.projects.push({ id: projectId, name: project.name, description: project.description || null, organizationId: org.id, createdAt, updatedAt: createdAt });
            for (const task of project.tasks) {
                const taskId = rng.uuid();
                const taskCreated = at();
                ids.task.set(`${org.id}:${task.key}`, taskId);
                let assigneeId = task.assigneeUserId;
                if (assigneeId && !membersOf.get(org.id)?.has(assigneeId)) {
                    warnings.push(`task ${org.id}:${task.key} assigned to non-member ${assigneeId}; cleared`);
                    assigneeId = null;
                }
                rows.tasks.push({
                    id: taskId, title: task.title, description: task.description || null, status: task.status, priority: task.priority,
                    projectId, assigneeId, createdAt: taskCreated, updatedAt: taskCreated,
                });
            }
        }
    }
    return { rows, ids, warnings };
}

export async function writeWorld(prisma: PrismaClient, rows: WorldRows): Promise<void> {
    await prisma.$transaction([
        prisma.organization.createMany({ data: rows.organizations }),
        prisma.user.createMany({ data: rows.users }),
        prisma.membership.createMany({ data: rows.memberships }),
        prisma.project.createMany({ data: rows.projects }),
        prisma.task.createMany({ data: rows.tasks }),
    ]);
}

export function writeManifest(file: string, manifest: Manifest): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, stableStringify(manifest) + '\n');
}

export function readManifest(file: string): Manifest | null {
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest) : null;
}

/** Deletes what a previous run wrote: its NavEvents (by tenant), orgs (cascading to projects, tasks, attachments) and users. */
export async function resetFromManifest(prisma: PrismaClient, manifest: Manifest): Promise<void> {
    await prisma.$transaction([
        prisma.navEvent.deleteMany({ where: { tenantHash: { in: manifest.tenantHashes } } }),
        prisma.organization.deleteMany({ where: { id: { in: manifest.orgIds } } }),
        prisma.user.deleteMany({ where: { id: { in: manifest.userIds } } }),
    ]);
}

/**
 * With `reset`, removes everything listed in the given run manifests. Then refuses to continue if the
 * sim database still has organizations, so a run never mixes with leftover data.
 */
export async function assertEmptyOrReset(prisma: PrismaClient, reset: boolean, manifestFiles: string[]): Promise<void> {
    if (reset) {
        for (const file of manifestFiles) {
            const manifest = readManifest(file);
            if (manifest) await resetFromManifest(prisma, manifest);
        }
    }
    const orgs = await prisma.organization.count();
    if (orgs === 0) return;
    if (!reset) throw new Error('sim database already has data; rerun with --reset to replace it');
    throw new Error('sim database still has organizations no run manifest lists; clear taskforge_sim by hand (see sim/README.md)');
}
