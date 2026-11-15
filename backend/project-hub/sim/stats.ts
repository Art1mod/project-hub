import { Prisma } from '@prisma/client';

/** One NavEvent row in the shape both the real snapshot and generated rows are analysed in. */
export interface StatRow {
    sessionId: string;
    type: string;
    fromRoute: string | null;
    toRoute: string | null;
    entityType: string | null;
    entityHash: string | null;
    userHash: string;
    tenantHash: string;
    role: string;
    dwellMs: number | null;
    latencyMs: number | null;
    cacheState: string | null;
    action: string | null;
    page: number | null;
    bytes: number | null;
    clientTs: Date;
    createdAt: Date | null;
}

export interface SessionStats {
    events: number;
    durationMs: number;
    mix: Record<string, number>;
    gapMs: number[];
    hoversPerNav: number[];
    hoverLagMs: number[];
    dwellByRoute: Record<string, number[]>;
    pageChangeGapMs: number[];
    latencyByCache: Record<string, number[]>;
    transitions: Record<string, number>;
}

const HOVER_LAG_WINDOW_MS = 10_000;
const PAGE_CHANGE_WINDOW_MS = 60_000;

/** Nearest-rank quantile, as used for the spec §4 numbers. */
export function quantile(xs: number[], p: number): number {
    if (xs.length === 0) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

const byTime = (rows: StatRow[]) =>
    rows.map((r, i) => ({ r, i })).sort((a, b) => a.r.clientTs.getTime() - b.r.clientTs.getTime() || a.i - b.i).map((x) => x.r);

function emptyStats(): SessionStats {
    return {
        events: 0, durationMs: 0, mix: {}, gapMs: [], hoversPerNav: [], hoverLagMs: [],
        dwellByRoute: {}, pageChangeGapMs: [], latencyByCache: {}, transitions: {},
    };
}

function push(map: Record<string, number[]>, key: string, value: number) {
    (map[key] ??= []).push(value);
}

function addSession(s: SessionStats, rows: StatRow[]) {
    const sorted = byTime(rows);
    if (sorted.length === 0) return;
    s.events += sorted.length;
    s.durationMs += sorted[sorted.length - 1].clientTs.getTime() - sorted[0].clientTs.getTime();

    let prevTs: number | null = null;
    let hovers = 0;
    let lastPageChange: number | null = null;
    const lastHoverTo: Record<string, number> = {};

    for (const r of sorted) {
        const t = r.clientTs.getTime();
        const key = r.type === 'action' && r.action ? `action:${r.action}` : r.type;
        s.mix[key] = (s.mix[key] ?? 0) + 1;

        if (prevTs !== null && t - prevTs > 0) s.gapMs.push(t - prevTs);
        prevTs = t;

        if (r.type === 'link_hover') {
            hovers++;
            if (r.toRoute) lastHoverTo[r.toRoute] = t;
        } else if (r.type === 'route_change') {
            s.hoversPerNav.push(hovers);
            hovers = 0;
            if (r.toRoute && lastHoverTo[r.toRoute] !== undefined && t - lastHoverTo[r.toRoute] < HOVER_LAG_WINDOW_MS) {
                s.hoverLagMs.push(t - lastHoverTo[r.toRoute]);
            }
            if (r.fromRoute) {
                if (r.dwellMs !== null) push(s.dwellByRoute, r.fromRoute, r.dwellMs);
                const k = `${r.fromRoute} -> ${r.toRoute}`;
                s.transitions[k] = (s.transitions[k] ?? 0) + 1;
            }
        } else if (r.type === 'page_change') {
            if (lastPageChange !== null && t - lastPageChange < PAGE_CHANGE_WINDOW_MS) s.pageChangeGapMs.push(t - lastPageChange);
            lastPageChange = t;
        } else if (r.type === 'page_ready' && r.cacheState && r.latencyMs !== null) {
            push(s.latencyByCache, r.cacheState, r.latencyMs);
        }
    }
}

/** Stats for one session's rows (any order). */
export function sessionStats(rows: StatRow[]): SessionStats {
    const s = emptyStats();
    addSession(s, rows);
    return s;
}

/** Stats pooled over many sessions: every per-session list is concatenated. */
export function pooledStats(rows: StatRow[]): SessionStats {
    const s = emptyStats();
    for (const session of groupBySession(rows).values()) addSession(s, session);
    return s;
}

export function groupBySession(rows: StatRow[]): Map<string, StatRow[]> {
    const m = new Map<string, StatRow[]>();
    for (const r of rows) {
        const list = m.get(r.sessionId) ?? [];
        list.push(r);
        m.set(r.sessionId, list);
    }
    return m;
}

const asDate = (v: Date | string | null | undefined): Date | null => (v == null ? null : new Date(v));

export function toStatRows(rows: Prisma.NavEventCreateManyInput[]): StatRow[] {
    return rows.map((r) => ({
        sessionId: r.sessionId,
        type: r.type,
        fromRoute: r.fromRoute ?? null,
        toRoute: r.toRoute ?? null,
        entityType: r.entityType ?? null,
        entityHash: r.entityHash ?? null,
        userHash: r.userHash,
        tenantHash: r.tenantHash,
        role: r.role,
        dwellMs: r.dwellMs ?? null,
        latencyMs: r.latencyMs ?? null,
        cacheState: r.cacheState ?? null,
        action: r.action ?? null,
        page: r.page ?? null,
        bytes: r.bytes ?? null,
        clientTs: asDate(r.clientTs)!,
        createdAt: asDate(r.createdAt),
    }));
}
