import { Prisma, PrismaClient } from '@prisma/client';
import { buildNavEventRow, hashId, NavEventRowContext } from '../src/telemetry/nav-event-row';
import { CAL } from './calibration';
import { SimEvent, SimSession } from './engine/session';
import { WorldChanges } from './engine/world-state';
import { Population, roleIn } from './population';
import { Rng } from './rng';

const SERVER_MS = [15, 60] as const;
const CHUNK = 1000;

/**
 * When each event reaches the database (`createdAt`), following the frontend tracker: a 5 s flush timer
 * started at the first tracked event, an immediate flush at 20 queued events, and a final flush when the
 * session ends (logout or pagehide), plus the server's own time.
 */
export function flushTimes(events: SimEvent[], rng: Rng): number[] {
    const out = new Array<number>(events.length);
    if (events.length === 0) return out;
    const times = events.map((e) => Date.parse(e.event.clientTs));
    let queue: number[] = [];
    let nextTick = times[0] + CAL.flushIntervalMs;
    const flush = (at: number) => {
        if (queue.length === 0) return;
        const arrived = at + rng.int(SERVER_MS[0], SERVER_MS[1]);
        for (const i of queue) out[i] = arrived;
        queue = [];
    };
    times.forEach((t, i) => {
        while (nextTick <= t) {
            flush(nextTick);
            nextTick += CAL.flushIntervalMs;
        }
        queue.push(i);
        if (queue.length >= CAL.flushAt) flush(t);
    });
    flush(times[times.length - 1]);
    return out;
}

/** Turns simulated sessions into NavEvent rows through the server's own row builder. */
export function sessionsToRows(sessions: SimSession[], pop: Population, salt: string, rng: Rng): Prisma.NavEventCreateManyInput[] {
    const users = new Map(pop.users.map((u) => [u.id, u]));
    const rows: Prisma.NavEventCreateManyInput[] = [];
    for (const session of sessions) {
        const user = users.get(session.userId);
        if (!user) throw new Error(`session ${session.sessionId} belongs to unknown user ${session.userId}`);
        const r = rng.fork(`rows:${session.sessionId}`);
        const created = flushTimes(session.events, r);
        const userHash = hashId(salt, 'user', user.id);
        session.events.forEach(({ orgId, event }, i) => {
            const role = roleIn(user, orgId);
            if (!role) throw new Error(`session ${session.sessionId} event ${i}: user is not a member of org ${orgId}`);
            const ctx: NavEventRowContext = { sessionId: session.sessionId, variant: 'control', userHash, tenantHash: hashId(salt, 'tenant', orgId), role };
            const row = buildNavEventRow(event, ctx, { now: created[i], salt });
            if (!row) throw new Error(`session ${session.sessionId} event ${i} (${event.type}) would be dropped by the server`);
            rows.push({ id: r.uuid(), ...row, createdAt: new Date(created[i]) });
        });
    }
    return rows;
}

export async function insertRows(prisma: PrismaClient, rows: Prisma.NavEventCreateManyInput[]): Promise<number> {
    let count = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
        count += (await prisma.navEvent.createMany({ data: rows.slice(i, i + CHUNK) })).count;
    }
    return count;
}

/** Writes the app-table side of the run (new/changed tasks, projects, attachments) so it agrees with the logs. */
export async function writeWorldChanges(prisma: PrismaClient, c: WorldChanges): Promise<void> {
    await prisma.$transaction([
        prisma.project.createMany({ data: c.projects.created }),
        prisma.task.createMany({ data: c.tasks.created }),
        prisma.attachment.createMany({ data: c.attachments.created }),
        ...c.tasks.updated.map((t) => prisma.task.update({ where: { id: t.id }, data: { status: t.status, priority: t.priority, updatedAt: t.updatedAt } })),
        ...c.projects.updated.map((p) => prisma.project.update({ where: { id: p.id }, data: { updatedAt: p.updatedAt } })),
        prisma.task.deleteMany({ where: { id: { in: c.tasks.deleted } } }),
        prisma.project.deleteMany({ where: { id: { in: c.projects.deleted } } }),
    ]);
}
