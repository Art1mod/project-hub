/**
 * Numbers from the spec §4: measured on the two real sessions (pooled), plus the macro targets
 * from general knowledge. Medians/p90 feed `Rng.lognormal`.
 */
export const CAL = {
    gapMs: { median: 1933, p90: 14400 },
    hoverLagMs: { p10: 144, median: 412, p90: 1169 },
    hoversPerNav: { median: 2, p90: 5, max: 24 },
    dwellMs: {
        '/projects': { median: 3946, p90: 16868 },
        '/projects/:id': { median: 56871, p90: 214051 },
        '/dashboard': { median: 100028, p90: 443323 },
        '/members': { median: 16250, p90: 112661 },
    },
    pageChangeGapMs: { median: 3589, p90: 15035 },
    latencyMs: {
        miss: { median: 56, p90: 214 },
        hit: { median: 9, p90: 31 },
        stale: { median: 4, p90: 8 },
    },
    uploadLatencyMs: { min: 239, max: 290 },
    uploadBytes: { min: 1323, max: 5981 },
    ingestLagMs: { min: 17, max: 5052 },
    hoverDelayMs: 150,
    hoverCooldownMs: 2000,
    flushIntervalMs: 5000,
    flushAt: 20,
    tasksPerPage: 10,
    attentionTake: 6,
    cacheGcMs: 5 * 60 * 1000,

    // Macro targets (spec §4, "from general knowledge")
    weekendFactor: { min: 0.15, max: 0.2 },
    driveByShare: 0.15,
    sessionEndShare: 0.2,
    top20Share: { min: 0.4, max: 0.5 },
    quietShare: 0.1,
} as const;

export type CacheState = keyof typeof CAL.latencyMs;
