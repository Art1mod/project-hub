import * as fs from 'fs';
import * as path from 'path';
import { StatRow } from './stats';

export const METABASE_URL = 'http://localhost:3001';
export const REAL_SESSION_CARDS = [
    'c4d7a16b-620f-47fe-a146-23efdbb2a8b4', // MEMBER session
    'ec317d14-f122-4b44-a245-e51a49e06701', // ADMIN session
];

type MetabaseRow = Record<string, string | number | null>;

/** Metabase returns zone-less timestamps for `timestamp(3)` columns; they are UTC. */
const utc = (v: string | number | null) => (v == null ? null : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? String(v) : `${v}Z`));
const str = (v: string | number | null) => (v == null ? null : String(v));
const num = (v: string | number | null) => (v == null ? null : Number(v));

export function fromMetabase(r: MetabaseRow): StatRow {
    return {
        sessionId: String(r.SessionId),
        type: String(r.Type),
        fromRoute: str(r.FromRoute),
        toRoute: str(r.ToRoute),
        entityType: str(r.EntityType),
        entityHash: str(r.EntityHash),
        userHash: String(r.UserHash),
        tenantHash: String(r.TenantHash),
        role: String(r.Role),
        dwellMs: num(r.DwellMs),
        latencyMs: num(r.LatencyMs),
        cacheState: str(r.CacheState),
        action: str(r.Action),
        page: num(r.Page),
        bytes: num(r.Bytes),
        clientTs: utc(r.ClientTs)!,
        createdAt: utc(r.CreatedAt),
    };
}

/** Reads the real sessions from Metabase public questions and snapshots them to `outFile`. */
export async function fetchGroundTruth(baseUrl: string, uuids: string[], outFile: string): Promise<StatRow[]> {
    const rows: StatRow[] = [];
    for (const uuid of uuids) {
        const url = `${baseUrl}/api/public/card/${uuid}/query/json`;
        let res: Response;
        try {
            res = await fetch(url);
        } catch (err) {
            throw new Error(`Metabase is not reachable at ${baseUrl} (${(err as Error).message}); start it and retry`);
        }
        if (!res.ok) throw new Error(`Metabase returned ${res.status} for public question ${uuid}`);
        const data = (await res.json()) as MetabaseRow[];
        rows.push(...data.map(fromMetabase));
    }
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(rows, null, 1));
    return rows;
}

export function loadGroundTruth(file: string): StatRow[] {
    if (!fs.existsSync(file)) {
        throw new Error(`No real-session snapshot at ${file}; run \`npm run sim -- fetch-ground-truth\` first`);
    }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as (Omit<StatRow, 'clientTs' | 'createdAt'> & { clientTs: string; createdAt: string | null })[];
    return raw.map((r) => ({ ...r, clientTs: new Date(r.clientTs), createdAt: r.createdAt ? new Date(r.createdAt) : null }));
}
