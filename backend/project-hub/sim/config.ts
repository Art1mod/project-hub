import * as path from 'path';

export interface RunConfig {
    runId: string;
    seed: number;
    days: number;
    /** Last simulated day, inclusive, YYYY-MM-DD in `tz`. */
    end: string;
    tz: string;
    orgs: number;
    users: number;
    replan: boolean;
    reset: boolean;
}

export const SIM_ROOT = path.resolve(__dirname);

/** YYYY-MM-DD of `date` as seen in time zone `tz`. */
export function localDate(date: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function defaultConfig(now: Date): RunConfig {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const end = localDate(new Date(now.getTime() - 86_400_000), tz);
    const seed = 42;
    return { runId: `trial-${end}-s${seed}`, seed, days: 3, end, tz, orgs: 10, users: 150, replan: false, reset: false };
}

export interface RunPaths {
    dir: string;
    config: string;
    world: string;
    plans: string;
    report: string;
    manifest: string;
}

export function runPaths(cfg: Pick<RunConfig, 'runId'>, root = path.join(SIM_ROOT, 'runs')): RunPaths {
    const dir = path.join(root, cfg.runId);
    return {
        dir,
        config: path.join(dir, 'config.json'),
        world: path.join(dir, 'world'),
        plans: path.join(dir, 'plans'),
        report: path.join(dir, 'report.md'),
        manifest: path.join(dir, 'manifest.json'),
    };
}

export const GROUND_TRUTH_FILE = path.join(SIM_ROOT, 'ground-truth', 'real-sessions.json');
