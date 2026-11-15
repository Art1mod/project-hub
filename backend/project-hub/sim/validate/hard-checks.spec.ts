import { StatRow } from '../stats';
import { compareToReal } from './compare';
import { hardChecks } from './hard-checks';
import { sessionStats } from '../stats';

const T0 = Date.parse('2026-11-12T09:00:00Z');
const U = 'a'.repeat(32);
const row = (dt: number, r: Partial<StatRow>): StatRow => ({
    sessionId: 's1', type: 'link_hover', fromRoute: null, toRoute: null, entityType: null, entityHash: null,
    userHash: U, tenantHash: 'b'.repeat(32), role: 'MEMBER', dwellMs: null, latencyMs: null, cacheState: null,
    action: null, page: null, bytes: null, clientTs: new Date(T0 + dt), createdAt: new Date(T0 + dt + 1000), ...r,
});

const valid = (): StatRow[] => [
    row(0, { type: 'session_start' }),
    row(0, { type: 'route_change', toRoute: '/dashboard' }),
    row(50, { type: 'page_ready', toRoute: '/dashboard', latencyMs: 50, cacheState: 'miss' }),
    row(3000, { type: 'link_hover', fromRoute: '/dashboard', toRoute: '/projects' }),
    row(3400, { type: 'route_change', fromRoute: '/dashboard', toRoute: '/projects', dwellMs: 3400 }),
    row(3410, { type: 'page_ready', toRoute: '/projects', latencyMs: 10, cacheState: 'stale' }),
];

const failing = (rows: StatRow[]) => hardChecks(rows).filter((c) => c.failures.length > 0).map((c) => c.name);

describe('hardChecks', () => {
    it('passes a valid session', () => {
        const checks = hardChecks(valid());
        expect(checks.map((c) => c.name)).toEqual([
            'rows-valid', 'hashes-deterministic', 'role-permissions', 'ready-follows-route',
            'dwell-equals-gap', 'no-hover-to-current', 'hover-cooldown', 'page-change-on-project', 'session-start-first',
        ]);
        expect(failing(valid())).toEqual([]);
    });

    const inject: [string, (rows: StatRow[]) => StatRow[]][] = [
        ['rows-valid', (r) => { r[2] = { ...r[2], latencyMs: null }; return r; }],
        ['hashes-deterministic', (r) => { r[4] = { ...r[4], userHash: 'c'.repeat(32) }; return r; }],
        ['role-permissions', (r) => [...r, row(9000, { type: 'action', action: 'invitation_create' })]],
        ['ready-follows-route', (r) => { r[5] = { ...r[5], toRoute: '/members' }; return r; }],
        ['dwell-equals-gap', (r) => { r[4] = { ...r[4], dwellMs: 3900 }; return r; }],
        ['no-hover-to-current', (r) => [...r, row(6000, { type: 'link_hover', fromRoute: '/projects', toRoute: '/projects' })]],
        ['hover-cooldown', (r) => [...r.slice(0, 4), row(3100, { type: 'link_hover', fromRoute: '/dashboard', toRoute: '/projects' }), ...r.slice(4)]],
        ['page-change-on-project', (r) => [...r, row(5000, { type: 'page_change', page: 2, entityType: 'project', entityHash: 'p'.repeat(32) })]],
        ['session-start-first', (r) => { r[0] = { ...r[0], clientTs: new Date(T0 + 100) }; return r; }],
    ];

    it.each(inject)('catches a %s violation and nothing else', (name, mutate) => {
        expect(failing(mutate(valid()))).toEqual([name]);
    });
});

describe('compareToReal', () => {
    it('flags a metric whose median falls far outside the real range', () => {
        const real = sessionStats(valid());
        const slow = valid().map((r) => (r.type === 'page_ready' ? { ...r, latencyMs: (r.latencyMs ?? 0) * 100 } : r));
        const out = compareToReal(sessionStats(slow), real);
        const miss = out.find((m) => m.metric === 'latency miss ms')!;
        expect(miss.flag).toBe(true);
        expect(out.find((m) => m.metric === 'gap ms')!.flag).toBe(false);
    });
});
