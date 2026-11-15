import { CAL } from '../calibration';
import { Population } from '../population';
import { SessionSlot } from '../schedule';
import { groupBySession, quantile, SessionStats, StatRow } from '../stats';

export interface MetricRow {
    metric: string;
    real: [number, number, number];
    sim: [number, number, number];
    flag: boolean;
}

export interface MacroRow {
    metric: string;
    target: string;
    actual: string;
    ok: boolean;
}

const q3 = (xs: number[]): [number, number, number] => [quantile(xs, 0.1), quantile(xs, 0.5), quantile(xs, 0.9)];

/** Flags a metric when the simulated median is more than 2x outside the real 10th-90th band. */
export function compareToReal(sim: SessionStats, real: SessionStats): MetricRow[] {
    const rows: MetricRow[] = [];
    const add = (metric: string, realXs: number[], simXs: number[]) => {
        if (realXs.length === 0) return;
        const r = q3(realXs);
        const s = q3(simXs);
        rows.push({ metric, real: r, sim: s, flag: !(s[1] >= r[0] / 2 && s[1] <= r[2] * 2) });
    };
    add('gap ms', real.gapMs, sim.gapMs);
    add('hover lag ms', real.hoverLagMs, sim.hoverLagMs);
    add('hovers per navigation', real.hoversPerNav, sim.hoversPerNav);
    add('page change gap ms', real.pageChangeGapMs, sim.pageChangeGapMs);
    for (const route of Object.keys(real.dwellByRoute).sort()) add(`dwell ${route} ms`, real.dwellByRoute[route], sim.dwellByRoute[route] ?? []);
    for (const state of Object.keys(real.latencyByCache).sort()) add(`latency ${state} ms`, real.latencyByCache[state], sim.latencyByCache[state] ?? []);
    for (const key of Object.keys(real.mix).sort()) {
        const share = (s: SessionStats) => (s.events > 0 ? (s.mix[key] ?? 0) / s.events : 0);
        add(`share ${key}`, [share(real)], [share(sim)]);
    }
    return rows;
}

export function transitionTable(sim: SessionStats, real: SessionStats): { move: string; real: number; sim: number }[] {
    const total = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0) || 1;
    const moves = [...new Set([...Object.keys(real.transitions), ...Object.keys(sim.transitions)])];
    return moves
        .map((move) => ({ move, real: (real.transitions[move] ?? 0) / total(real.transitions), sim: (sim.transitions[move] ?? 0) / total(sim.transitions) }))
        .sort((a, b) => b.sim - a.sim || b.real - a.real);
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const within = (x: number, lo: number, hi: number) => x >= lo && x <= hi;

function localHour(d: Date, tz: string): number {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(d));
}

function isWeekendIn(d: Date, tz: string): boolean {
    const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);
    return day === 'Sat' || day === 'Sun';
}

/** Overall shape against the spec §4 targets. Totals are expectations, reported but never failures. */
export function macroChecks(rows: StatRow[], slots: SessionSlot[], pop: Population, tz: string): MacroRow[] {
    const out: MacroRow[] = [];
    const sessions = groupBySession(rows);
    const sessionStarts = [...sessions.values()].map((list) => new Date(Math.min(...list.map((r) => r.clientTs.getTime()))));

    out.push({ metric: 'sessions', target: '300-350 (expectation)', actual: String(sessions.size), ok: true });
    out.push({ metric: 'NavEvent rows', target: '20,000-30,000 (expectation)', actual: rows.length.toLocaleString('en-US'), ok: true });

    const days = new Map<string, number>();
    for (const d of sessionStarts) {
        const key = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
        days.set(key, (days.get(key) ?? 0) + 1);
    }
    const weekend = [...days].filter(([k]) => isWeekendIn(new Date(`${k}T12:00:00Z`), 'UTC')).map(([, v]) => v);
    const weekday = [...days].filter(([k]) => !isWeekendIn(new Date(`${k}T12:00:00Z`), 'UTC')).map(([, v]) => v);
    if (weekend.length > 0 && weekday.length > 0) {
        const ratio = (weekend.reduce((a, b) => a + b, 0) / weekend.length) / (weekday.reduce((a, b) => a + b, 0) / weekday.length);
        out.push({ metric: 'weekend / weekday sessions', target: `${CAL.weekendFactor.min}-${CAL.weekendFactor.max}`, actual: ratio.toFixed(2), ok: within(ratio, 0.12, 0.23) });
    }

    const perUser = pop.users.map((u) => slots.filter((s) => s.userId === u.id).length).sort((a, b) => b - a);
    const top = perUser.slice(0, Math.round(perUser.length * 0.2)).reduce((a, b) => a + b, 0) / Math.max(1, slots.length);
    out.push({ metric: 'top 20% of users, share of sessions', target: `${pct(CAL.top20Share.min)}-${pct(CAL.top20Share.max)}`, actual: pct(top), ok: within(top, CAL.top20Share.min, CAL.top20Share.max) });

    const driveBy = slots.filter((s) => s.driveBy).length / Math.max(1, slots.length);
    out.push({ metric: 'drive-by share', target: pct(CAL.driveByShare), actual: pct(driveBy), ok: within(driveBy, 0.12, 0.18) });

    const ended = [...sessions.values()].filter((list) => list.some((r) => r.type === 'session_end')).length / Math.max(1, sessions.size);
    out.push({ metric: 'sessions with session_end', target: pct(CAL.sessionEndShare), actual: pct(ended), ok: within(ended, 0.16, 0.24) });

    const hours = sessionStarts.map((d) => localHour(d, tz));
    const hist = Array.from({ length: 24 }, (_, h) => hours.filter((x) => x === h).length);
    const office = hours.filter((h) => h >= 7 && h < 20).length / Math.max(1, hours.length);
    out.push({ metric: 'session starts in 07-20 local', target: '100%', actual: pct(office), ok: office === 1 });
    out.push({ metric: 'starts per local hour (07..19)', target: 'peaks ~10 and ~15', actual: hist.slice(7, 20).join(' '), ok: true });

    const personas = new Map<string, number>();
    for (const u of pop.users) personas.set(u.persona, (personas.get(u.persona) ?? 0) + 1);
    out.push({ metric: 'personas (users)', target: 'manager ~7%, lead ~13%, scanner ~10%, worker ~70%', actual: [...personas].map(([k, v]) => `${k} ${v}`).join(', '), ok: true });
    const roles = new Map<string, number>();
    for (const r of rows) roles.set(r.role, (roles.get(r.role) ?? 0) + 1);
    out.push({ metric: 'rows by role', target: 'mostly MEMBER', actual: [...roles].map(([k, v]) => `${k} ${v}`).join(', '), ok: true });
    return out;
}
