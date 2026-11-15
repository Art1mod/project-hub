import 'reflect-metadata';
import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from 'util';
import { Prisma, PrismaClient } from '@prisma/client';
import { hashId } from '../src/telemetry/nav-event-row';
import { AnthropicBatchClient, BatchClient } from './ai/batch';
import { DroppedStep, emptyUsage, estimateCostUsd, generatePlans, generateWorlds, UsageTotals } from './ai/generate-ai';
import { stableStringify } from './ai/stable-json';
import { StubBatchClient } from './ai/stub';
import { defaultConfig, GROUND_TRUTH_FILE, RunConfig, runPaths, SIM_ROOT } from './config';
import { createSimPrisma } from './db';
import { replayCacheStates } from './engine/cache-model';
import { simulateSession, SimSession } from './engine/session';
import { WorldState } from './engine/world-state';
import { fetchGroundTruth, loadGroundTruth, METABASE_URL, REAL_SESSION_CARDS } from './ground-truth';
import { insertRows, sessionsToRows, writeWorldChanges } from './generate';
import { buildPopulation, Population } from './population';
import { createRng } from './rng';
import { buildSlots, SessionSlot } from './schedule';
import { pooledStats, StatRow, toStatRows } from './stats';
import { windowDates, zonedToUtc } from './time';
import { compareToReal, macroChecks, transitionTable } from './validate/compare';
import { hardChecks } from './validate/hard-checks';
import { writeReport } from './validate/report';
import { assertEmptyOrReset, readManifest, worldToRows, writeManifest, writeWorld } from './world-db';

export interface RunDeps {
    client: BatchClient;
    salt: string;
    /** When given, rows are written to the sim database. */
    prisma?: PrismaClient;
    /** Receives the generated rows (tests, dry runs without a database). */
    sink?: (rows: Prisma.NavEventCreateManyInput[]) => Promise<void>;
    runsRoot?: string;
    groundTruthFile?: string;
    aiMode?: string;
    log?: (msg: string) => void;
}

export interface RunResult {
    sessions: number;
    rows: number;
    reportPath: string;
    hardFailures: number;
}

const CONFIG_KEYS: (keyof RunConfig)[] = ['seed', 'days', 'end', 'tz', 'orgs', 'users'];
const HISTORY_DAYS = 30;

function checkRunConfig(file: string, cfg: RunConfig) {
    if (fs.existsSync(file)) {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as RunConfig;
        const diff = CONFIG_KEYS.filter((k) => saved[k] !== cfg[k]);
        if (diff.length > 0) {
            throw new Error(`run ${cfg.runId} already exists with a different config (${diff.map((k) => `${k}: ${saved[k]} vs ${cfg[k]}`).join(', ')}); use another --run`);
        }
        return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, stableStringify(Object.fromEntries(CONFIG_KEYS.map((k) => [k, cfg[k]]))) + '\n');
}

function plan(cfg: RunConfig) {
    const rng = createRng(cfg.seed);
    const pop = buildPopulation(rng.fork('population'), cfg);
    const dates = windowDates(cfg.end, cfg.days);
    const slots = buildSlots(rng.fork('schedule'), pop, { dates, tz: cfg.tz });
    return { rng, pop, dates, slots };
}

function simulateAll(
    pop: Population,
    slots: SessionSlot[],
    plans: Map<string, { sessions: { slotId: string; steps: import('./ai/schemas').Step[] }[] }>,
    world: WorldState,
    ids: import('./world-db').IdMap,
    seed: number,
): SimSession[] {
    const users = new Map(pop.users.map((u) => [u.id, u]));
    const refs = new Map<string, Map<string, string>>();
    const rng = createRng(seed);
    return slots.map((slot) => {
        const user = users.get(slot.userId)!;
        const steps = plans.get(user.id)?.sessions.find((s) => s.slotId === slot.slotId)?.steps ?? [{ step: 'leave', how: slot.leave }];
        if (!refs.has(user.id)) refs.set(user.id, new Map());
        return simulateSession({ slot, steps, user, world, ids, refs: refs.get(user.id)!, rng: rng.fork(`session:${slot.slotId}`) });
    });
}

function reportSections(
    cfg: RunConfig,
    statRows: StatRow[],
    slots: SessionSlot[],
    pop: Population,
    groundTruthFile: string,
    ai: { mode: string; calls: number; usage: UsageTotals; dropped: DroppedStep[]; fallbacks: string[] },
    sessions: number,
) {
    const hard = hardChecks(statRows);
    let compare: ReturnType<typeof compareToReal> = [];
    let transitions: ReturnType<typeof transitionTable> = [];
    let cacheReplay: ReturnType<typeof replayCacheStates> | null = null;
    if (fs.existsSync(groundTruthFile)) {
        const real = loadGroundTruth(groundTruthFile);
        const sim = pooledStats(statRows);
        const realStats = pooledStats(real);
        compare = compareToReal(sim, realStats);
        transitions = transitionTable(sim, realStats);
        cacheReplay = replayCacheStates(real);
    }
    return {
        config: cfg,
        totals: { orgs: pop.orgs.length, users: pop.users.length, sessions, rows: statRows.length },
        hard,
        compare,
        transitions,
        macro: macroChecks(statRows, slots, pop, cfg.tz),
        cacheReplay,
        ai: { ...ai, costUsd: estimateCostUsd(ai.usage) },
    };
}

/** world → plan → generate → validate, end to end. */
export async function runAll(cfg: RunConfig, deps: RunDeps): Promise<RunResult> {
    const log = deps.log ?? console.log;
    const paths = runPaths(cfg, deps.runsRoot);
    checkRunConfig(paths.config, cfg);
    const { pop, dates, slots: plannedSlots } = plan(cfg);
    log(`population: ${pop.orgs.length} orgs, ${pop.users.length} users; ${plannedSlots.length} session slots`);

    const worlds = await generateWorlds(deps.client, pop, paths, { replan: cfg.replan });
    log(`worlds ready (${worlds.calls} batch call(s))`);
    const plans = await generatePlans(deps.client, pop, worlds.worlds, plannedSlots, paths, { replan: cfg.replan, tz: cfg.tz });
    log(`plans ready (${plans.calls} batch call(s)); ${plans.dropped.length} step(s) dropped; ${plans.fallbacks.length} fallback user(s)`);

    // Users whose plan failed twice get quick-look sessions only.
    const fallback = new Set(plans.fallbacks);
    const slots = plannedSlots.map((s) => (fallback.has(s.userId) ? { ...s, driveBy: true, leave: 'close_tab' as const, targetMinutes: Math.min(s.targetMinutes, 1) } : s));

    const rng = createRng(cfg.seed);
    const baseTime = new Date(zonedToUtc(dates[0], 0, cfg.tz).getTime() - HISTORY_DAYS * 86_400_000);
    const { rows: worldRows, ids, warnings } = worldToRows(pop, worlds.worlds, rng.fork('world-rows'), baseTime);
    for (const w of warnings.slice(0, 5)) log(`world: ${w}`);
    const world = new WorldState(worldRows);
    const sessions = simulateAll(pop, slots, plans.plans, world, ids, cfg.seed);
    const navRows = sessionsToRows(sessions, pop, deps.salt, rng.fork('rows'));
    log(`simulated ${sessions.length} sessions, ${navRows.length} NavEvent rows`);

    if (deps.prisma) {
        const runsRoot = deps.runsRoot ?? path.join(SIM_ROOT, 'runs');
        const manifests = fs.existsSync(runsRoot) ? fs.readdirSync(runsRoot).map((d) => path.join(runsRoot, d, 'manifest.json')) : [];
        await assertEmptyOrReset(deps.prisma, cfg.reset, manifests);
        writeManifest(paths.manifest, {
            orgIds: pop.orgs.map((o) => o.id),
            userIds: pop.users.map((u) => u.id),
            tenantHashes: pop.orgs.map((o) => hashId(deps.salt, 'tenant', o.id)),
        });
        await writeWorld(deps.prisma, worldRows);
        await writeWorldChanges(deps.prisma, world.changes());
        const inserted = await insertRows(deps.prisma, navRows);
        log(`inserted ${inserted} NavEvent rows into the sim database`);
    }
    if (deps.sink) await deps.sink(navRows);

    const sections = reportSections(cfg, toStatRows(navRows), slots, pop, deps.groundTruthFile ?? GROUND_TRUTH_FILE,
        { mode: deps.aiMode ?? 'anthropic', calls: worlds.calls + plans.calls, usage: addUsage(worlds.usage, plans.usage), dropped: plans.dropped, fallbacks: plans.fallbacks },
        sessions.length);
    writeReport(paths.report, sections);
    const hardFailures = sections.hard.reduce((s, c) => s + c.failures.length, 0);
    log(`report: ${paths.report} (${hardFailures === 0 ? 'all hard checks pass' : `${hardFailures} hard-check failure(s)`})`);
    return { sessions: sessions.length, rows: navRows.length, reportPath: paths.report, hardFailures };
}

function addUsage(a: UsageTotals, b: UsageTotals): UsageTotals {
    const out = emptyUsage();
    for (const k of Object.keys(out) as (keyof UsageTotals)[]) out[k] = a[k] + b[k];
    return out;
}

/** Re-validates a run from the rows in the sim database. */
async function validateFromDb(cfg: RunConfig, prisma: PrismaClient, groundTruthFile: string): Promise<RunResult> {
    const paths = runPaths(cfg);
    const manifest = readManifest(paths.manifest);
    if (!manifest) throw new Error(`run ${cfg.runId} has no manifest; run the generate stage first`);
    const { pop, slots } = plan(cfg);
    const dbRows = await prisma.navEvent.findMany({ where: { tenantHash: { in: manifest.tenantHashes } } });
    const statRows = toStatRows(dbRows as Prisma.NavEventCreateManyInput[]);
    const sessions = new Set(statRows.map((r) => r.sessionId)).size;
    const sections = reportSections(cfg, statRows, slots, pop, groundTruthFile, { mode: 'from database', calls: 0, usage: emptyUsage(), dropped: [], fallbacks: [] }, sessions);
    writeReport(paths.report, sections);
    return { sessions, rows: statRows.length, reportPath: paths.report, hardFailures: sections.hard.reduce((s, c) => s + c.failures.length, 0) };
}

function assertCredentials() {
    if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return;
    try {
        execSync('ant auth status', { stdio: 'ignore' });
    } catch {
        throw new Error('No Claude API credentials: set ANTHROPIC_API_KEY or run `ant auth login` (or use --ai stub)');
    }
}

function salt(): string {
    const s = process.env.TELEMETRY_SALT;
    if (!s || s.length < 32) throw new Error('TELEMETRY_SALT must be set to at least 32 characters (backend/project-hub/.env)');
    return s;
}

const USAGE = `usage: npm run sim -- <stage> [--days 3] [--end YYYY-MM-DD] [--seed 42] [--tz <IANA>] [--run <id>] [--reset] [--replan] [--ai anthropic|stub]
stages: fetch-ground-truth | world | plan | all | validate`;

export async function main(argv: string[]): Promise<number> {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            days: { type: 'string' }, end: { type: 'string' }, seed: { type: 'string' }, tz: { type: 'string' },
            run: { type: 'string' }, reset: { type: 'boolean' }, replan: { type: 'boolean' }, ai: { type: 'string' },
        },
    });
    const stage = positionals[0];
    if (!stage) {
        console.error(USAGE);
        return 2;
    }
    if (stage === 'fetch-ground-truth') {
        const rows = await fetchGroundTruth(METABASE_URL, REAL_SESSION_CARDS, GROUND_TRUTH_FILE);
        console.log(`saved ${rows.length} real rows to ${GROUND_TRUTH_FILE}`);
        return 0;
    }

    const base = defaultConfig(new Date());
    const cfg: RunConfig = {
        ...base,
        days: values.days ? Number(values.days) : base.days,
        end: values.end ?? base.end,
        seed: values.seed ? Number(values.seed) : base.seed,
        tz: values.tz ?? base.tz,
        reset: values.reset ?? false,
        replan: values.replan ?? false,
    };
    cfg.runId = values.run ?? `trial-${cfg.end}-s${cfg.seed}`;
    const aiMode = values.ai ?? 'anthropic';
    if (aiMode !== 'anthropic' && aiMode !== 'stub') throw new Error(`--ai must be anthropic or stub, not ${aiMode}`);

    const { pop, slots } = plan(cfg);
    const client: BatchClient = aiMode === 'stub' ? new StubBatchClient(pop, cfg.seed) : new AnthropicBatchClient();
    if (aiMode === 'anthropic') assertCredentials();
    const paths = runPaths(cfg);

    switch (stage) {
        case 'world':
            checkRunConfig(paths.config, cfg);
            await generateWorlds(client, pop, paths, { replan: cfg.replan });
            return 0;
        case 'plan': {
            checkRunConfig(paths.config, cfg);
            const { worlds } = await generateWorlds(client, pop, paths, { replan: false });
            const out = await generatePlans(client, pop, worlds, slots, paths, { replan: cfg.replan, tz: cfg.tz });
            console.log(`${out.plans.size} plans; ${out.dropped.length} dropped steps; ${out.fallbacks.length} fallbacks; ~$${estimateCostUsd(out.usage).toFixed(2)}`);
            return 0;
        }
        case 'all':
        case 'generate': {
            const prisma = createSimPrisma();
            try {
                const result = await runAll(cfg, { client, salt: salt(), prisma, aiMode });
                return result.hardFailures === 0 ? 0 : 1;
            } finally {
                await prisma.$disconnect();
            }
        }
        case 'validate': {
            const prisma = createSimPrisma();
            try {
                const result = await validateFromDb(cfg, prisma, GROUND_TRUTH_FILE);
                console.log(`report: ${result.reportPath}`);
                return result.hardFailures === 0 ? 0 : 1;
            } finally {
                await prisma.$disconnect();
            }
        }
        default:
            console.error(USAGE);
            return 2;
    }
}

if (require.main === module) {
    main(process.argv.slice(2)).then(
        (code) => process.exit(code),
        (err: Error) => {
            console.error(`error: ${err.message}`);
            process.exit(1);
        },
    );
}
