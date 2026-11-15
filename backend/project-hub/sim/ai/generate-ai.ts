import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { RunPaths } from '../config';
import { Population, SimUser } from '../population';
import { SessionSlot } from '../schedule';
import { BatchClient, BatchItem, BatchOutcome, TokenUsage } from './batch';
import { buildSystemBlocks, planPrompt, worldPrompt } from './prompts';
import { toApiSchema, UserPlan, UserPlanSchema, World, WorldSchema } from './schemas';
import { stableStringify } from './stable-json';
import { validatePlan } from './validate-plan';

export interface UsageTotals {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
}

export interface DroppedStep {
    userId: string;
    slotId: string;
    index: number;
    reason: string;
}

const WORLD_MAX_TOKENS = 48_000;
const PLAN_MAX_TOKENS = 24_000;
const MIN_PROJECTS = 4;
const MIN_BIG_PROJECT_TASKS = 21;

/** Batch rates for claude-sonnet-5-5: 50% of $2 / $10 per MTok, cache read 50% of $0.10, cache write 1.25x input. */
const RATE = { input: 1.0, output: 5.0, cacheRead: 0.05, cacheWrite: 1.25 };

export function estimateCostUsd(u: UsageTotals): number {
    return (u.input * RATE.input + u.output * RATE.output + u.cacheRead * RATE.cacheRead + u.cacheWrite * RATE.cacheWrite) / 1e6;
}

export const emptyUsage = (): UsageTotals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

function addUsage(t: UsageTotals, u: TokenUsage | undefined) {
    if (!u) return;
    t.input += u.input_tokens;
    t.output += u.output_tokens;
    t.cacheRead += u.cache_read_input_tokens ?? 0;
    t.cacheWrite += u.cache_creation_input_tokens ?? 0;
}

/**
 * Runs the items, then retries once (in a second batch) every item that failed or whose JSON `accept`
 * rejected. Returns the accepted value per customId (missing = failed twice).
 */
async function runWithRetry<T>(
    client: BatchClient,
    items: BatchItem[],
    accept: (json: unknown, item: BatchItem) => T | null,
    usage: UsageTotals,
): Promise<{ accepted: Map<string, T>; calls: number }> {
    const accepted = new Map<string, T>();
    let pending = items;
    let calls = 0;
    for (let attempt = 0; attempt < 2 && pending.length > 0; attempt++) {
        const outcomes: BatchOutcome[] = await client.run(pending);
        calls++;
        const byId = new Map(outcomes.map((o) => [o.customId, o]));
        const failed: BatchItem[] = [];
        for (const item of pending) {
            const o = byId.get(item.customId);
            addUsage(usage, o?.usage);
            const value = o?.ok ? accept(o.json, item) : null;
            if (value === null) failed.push(item);
            else accepted.set(item.customId, value);
        }
        pending = failed;
    }
    return { accepted, calls };
}

const writeJson = (file: string, value: unknown) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, stableStringify(value) + '\n');
};
const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));

/** Code-side checks the schema can't express. Returns null if the world is unusable. */
function acceptWorld(json: unknown, orgId: string, memberIds: string[]): World | null {
    const parsed = WorldSchema.safeParse(json);
    if (!parsed.success) return null;
    const world: World = { ...parsed.data, orgId };
    const projectKeys = world.projects.map((p) => p.key);
    const taskKeys = world.projects.flatMap((p) => p.tasks.map((t) => t.key));
    if (world.projects.length < MIN_PROJECTS) return null;
    if (!world.projects.some((p) => p.tasks.length >= MIN_BIG_PROJECT_TASKS)) return null;
    if (new Set(projectKeys).size !== projectKeys.length || new Set(taskKeys).size !== taskKeys.length) return null;

    // Fill focus for members the AI left out rather than failing the whole run.
    const busy = world.projects.filter((p) => p.state === 'busy').map((p) => p.key);
    const fallbackFocus = busy.length > 0 ? busy.slice(0, 2) : [projectKeys[0]];
    const known = new Set(world.focus.map((f) => f.userId));
    const focus = world.focus
        .filter((f) => memberIds.includes(f.userId))
        .map((f) => ({ userId: f.userId, projectKeys: f.projectKeys.filter((k) => projectKeys.includes(k)) }));
    for (const id of memberIds) if (!known.has(id)) focus.push({ userId: id, projectKeys: fallbackFocus });
    return { ...world, focus };
}

export async function generateWorlds(
    client: BatchClient,
    pop: Population,
    paths: RunPaths,
    opts: { replan: boolean },
): Promise<{ worlds: Map<string, World>; usage: UsageTotals; calls: number }> {
    const usage = emptyUsage();
    const worlds = new Map<string, World>();
    const system = buildSystemBlocks();
    const schema = toApiSchema(WorldSchema);
    const membersOf = (orgId: string) =>
        pop.users.flatMap((user) => user.memberships.filter((m) => m.orgId === orgId).map((m) => ({ user, role: m.role })));

    const todo: BatchItem[] = [];
    for (const org of pop.orgs) {
        const file = path.join(paths.world, `${org.id}.json`);
        if (!opts.replan && fs.existsSync(file)) {
            worlds.set(org.id, WorldSchema.parse(readJson(file)));
            continue;
        }
        todo.push({ customId: `world-${org.id}`, system, user: worldPrompt(org, membersOf(org.id)), schema, maxTokens: WORLD_MAX_TOKENS });
    }

    const orgIdOf = (item: BatchItem) => item.customId.slice('world-'.length);
    const { accepted, calls } = await runWithRetry(client, todo, (json, item) =>
        acceptWorld(json, orgIdOf(item), membersOf(orgIdOf(item)).map((m) => m.user.id)), usage);

    for (const item of todo) {
        const orgId = orgIdOf(item);
        const world = accepted.get(item.customId);
        if (!world) throw new Error(`World generation failed twice for org ${orgId}; the run cannot continue`);
        writeJson(path.join(paths.world, `${orgId}.json`), world);
        worlds.set(orgId, world);
    }
    return { worlds, usage, calls };
}

const FallbackSchema = z.strictObject({ userId: z.string(), fallback: z.literal(true) });

function fallbackPlan(user: SimUser, slots: SessionSlot[]): UserPlan {
    return {
        userId: user.id,
        sessions: slots.map((s) => ({
            slotId: s.slotId,
            goal: 'fallback: quick look',
            steps: [{ step: 'scan_dashboard', intensity: 'light' }, { step: 'leave', how: s.leave }],
        })),
    };
}

export async function generatePlans(
    client: BatchClient,
    pop: Population,
    worlds: Map<string, World>,
    slots: SessionSlot[],
    paths: RunPaths,
    opts: { replan: boolean; tz: string },
): Promise<{ plans: Map<string, UserPlan>; dropped: DroppedStep[]; fallbacks: string[]; usage: UsageTotals; calls: number }> {
    const usage = emptyUsage();
    const system = buildSystemBlocks();
    const schema = toApiSchema(UserPlanSchema);
    const slotsOf = new Map<string, SessionSlot[]>();
    for (const s of slots) slotsOf.set(s.userId, [...(slotsOf.get(s.userId) ?? []), s]);

    const planFile = (id: string) => path.join(paths.plans, `${id}.json`);
    const fallbackFile = (id: string) => path.join(paths.plans, `${id}.fallback.json`);
    const users = pop.users.filter((u) => (slotsOf.get(u.id) ?? []).length > 0);

    const raw = new Map<string, UserPlan>();
    const fallbacks = new Set<string>();
    const todo: BatchItem[] = [];
    for (const user of users) {
        if (!opts.replan && fs.existsSync(planFile(user.id))) {
            raw.set(user.id, UserPlanSchema.parse(readJson(planFile(user.id))));
        } else if (!opts.replan && fs.existsSync(fallbackFile(user.id))) {
            FallbackSchema.parse(readJson(fallbackFile(user.id)));
            fallbacks.add(user.id);
        } else {
            todo.push({ customId: `plan-${user.id}`, system, user: planPrompt(user, worlds, slotsOf.get(user.id)!, opts.tz), schema, maxTokens: PLAN_MAX_TOKENS });
        }
    }

    const { accepted, calls } = await runWithRetry(client, todo, (json) => {
        const parsed = UserPlanSchema.safeParse(json);
        return parsed.success ? parsed.data : null;
    }, usage);

    for (const item of todo) {
        const userId = item.customId.slice('plan-'.length);
        const plan = accepted.get(item.customId);
        fs.rmSync(fallbackFile(userId), { force: true });
        if (plan) {
            const own = { ...plan, userId };
            writeJson(planFile(userId), own);
            raw.set(userId, own);
        } else {
            writeJson(fallbackFile(userId), { userId, fallback: true });
            fallbacks.add(userId);
        }
    }

    const plans = new Map<string, UserPlan>();
    const dropped: DroppedStep[] = [];
    for (const user of users) {
        const userSlots = slotsOf.get(user.id)!;
        const source = raw.get(user.id);
        if (!source) {
            plans.set(user.id, fallbackPlan(user, userSlots));
            continue;
        }
        const out = validatePlan(source, { user, worlds, slots: userSlots });
        plans.set(user.id, out.plan);
        dropped.push(...out.dropped.map((d) => ({ userId: user.id, ...d })));
    }
    return { plans, dropped, fallbacks: users.map((u) => u.id).filter((id) => fallbacks.has(id)), usage, calls };
}
