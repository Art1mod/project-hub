import * as fs from 'fs';
import * as path from 'path';
import { DroppedStep, UsageTotals } from '../ai/generate-ai';
import { RunConfig } from '../config';
import { MacroRow, MetricRow } from './compare';
import { HardCheck } from './hard-checks';

export interface ReportInput {
    config: RunConfig;
    totals: { orgs: number; users: number; sessions: number; rows: number };
    hard: HardCheck[];
    compare: MetricRow[];
    transitions: { move: string; real: number; sim: number }[];
    macro: MacroRow[];
    cacheReplay: { matched: number; total: number; mismatches: string[] } | null;
    ai: { mode: string; calls: number; usage: UsageTotals; costUsd: number; dropped: DroppedStep[]; fallbacks: string[] };
}

const MAX_LISTED = 10;
const n = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '–');
const share = (x: number) => (x < 1 ? `${(100 * x).toFixed(1)}%` : n(x));
const fmt = (metric: string, xs: [number, number, number]) => xs.map((x) => (metric.startsWith('share') ? share(x) : n(x))).join(' / ');

export function renderReport(r: ReportInput): string {
    const failed = r.hard.filter((c) => c.failures.length > 0);
    const lines: string[] = [];
    lines.push(`# Simulation report: ${r.config.runId}`, '');
    lines.push(`Window: ${r.config.days} day(s) ending ${r.config.end} (${r.config.tz}) · seed ${r.config.seed} · AI: ${r.ai.mode}`);
    lines.push(`Orgs ${r.totals.orgs} · users ${r.totals.users} · sessions ${n(r.totals.sessions)} · NavEvent rows ${n(r.totals.rows)}`, '');

    lines.push('## Hard checks', '');
    lines.push(failed.length === 0 ? '**All hard checks pass.**' : `**${failed.length} hard check(s) FAILED.**`, '');
    lines.push('| Check | Result |', '|---|---|');
    for (const c of r.hard) lines.push(`| ${c.name} | ${c.failures.length === 0 ? 'pass' : `FAIL (${c.failures.length})`} |`);
    for (const c of failed) {
        lines.push('', `### ${c.name}`, ...c.failures.slice(0, MAX_LISTED).map((f) => `- ${f}`));
        if (c.failures.length > MAX_LISTED) lines.push(`- … and ${c.failures.length - MAX_LISTED} more`);
    }

    lines.push('', '## Compared with the real sessions', '');
    lines.push('p10 / p50 / p90. Flagged when the simulated median is more than 2× outside the real 10th–90th band. With two real sessions this is a range check, not a significance test.', '');
    lines.push('| Metric | Real | Simulated | |', '|---|---|---|---|');
    for (const m of r.compare) lines.push(`| ${m.metric} | ${fmt(m.metric, m.real)} | ${fmt(m.metric, m.sim)} | ${m.flag ? '⚠ flagged' : ''} |`);
    if (r.cacheReplay) {
        lines.push('', `Cache model replay on the real sessions: **${r.cacheReplay.matched} / ${r.cacheReplay.total}** recorded cacheState values reproduced.`);
        for (const m of r.cacheReplay.mismatches.slice(0, MAX_LISTED)) lines.push(`- ${m}`);
    }

    lines.push('', '### Page-to-page moves (share of all moves)', '', '| Move | Real | Simulated |', '|---|---|---|');
    for (const t of r.transitions.slice(0, 15)) lines.push(`| ${t.move} | ${share(t.real)} | ${share(t.sim)} |`);

    lines.push('', '## Overall shape against targets', '', '| Metric | Target | Actual | |', '|---|---|---|---|');
    for (const m of r.macro) lines.push(`| ${m.metric} | ${m.target} | ${m.actual} | ${m.ok ? '' : '⚠ off target'} |`);

    lines.push('', '## AI', '');
    lines.push(`Batch calls: ${r.ai.calls} · input ${n(r.ai.usage.input)} · output ${n(r.ai.usage.output)} · cache read ${n(r.ai.usage.cacheRead)} · cache write ${n(r.ai.usage.cacheWrite)} tokens`);
    lines.push(`Estimated cost: **$${r.ai.costUsd.toFixed(2)}** (batch rates; reused saved plans cost nothing)`);
    lines.push(`Users on fallback plans: ${r.ai.fallbacks.length}${r.ai.fallbacks.length ? ` (${r.ai.fallbacks.slice(0, MAX_LISTED).join(', ')})` : ''}`);
    lines.push(`Plan steps dropped by validation: ${r.ai.dropped.length}`);
    const reasons = new Map<string, number>();
    for (const d of r.ai.dropped) {
        const key = d.reason.replace(/[0-9a-f-]{36}/g, '<id>').replace(/\b(P|T)[\w-]*\d\b/g, '<key>');
        reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }
    for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, MAX_LISTED)) lines.push(`- ${count} × ${reason}`);
    return lines.join('\n') + '\n';
}

export function writeReport(file: string, input: ReportInput): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, renderReport(input));
}
