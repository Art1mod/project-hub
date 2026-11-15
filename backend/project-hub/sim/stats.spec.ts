import { quantile, sessionStats, StatRow, toStatRows } from './stats';

const T0 = Date.parse('2026-11-12T09:00:00Z');
const row = (dt: number, r: Partial<StatRow>): StatRow => ({
    sessionId: 's1', type: 'link_hover', fromRoute: null, toRoute: null, entityType: null, entityHash: null,
    userHash: 'u', tenantHash: 't', role: 'MEMBER', dwellMs: null, latencyMs: null, cacheState: null,
    action: null, page: null, bytes: null, clientTs: new Date(T0 + dt), createdAt: null, ...r,
});

const fixture: StatRow[] = [
    row(0, { type: 'link_hover', fromRoute: '/dashboard', toRoute: '/projects' }),
    row(400, { type: 'route_change', fromRoute: '/dashboard', toRoute: '/projects', dwellMs: 5000 }),
    row(450, { type: 'page_ready', toRoute: '/projects', latencyMs: 50, cacheState: 'miss' }),
    row(4000, { type: 'page_change', page: 2, entityType: 'project', entityHash: 'p' }),
    row(7000, { type: 'page_change', page: 3, entityType: 'project', entityHash: 'p' }),
    row(9000, { type: 'action', action: 'task_update', entityType: 'task', entityHash: 'x' }),
];

describe('sessionStats', () => {
    const s = sessionStats([...fixture].reverse()); // order of input must not matter

    it('measures hover-to-navigation lag', () => expect(s.hoverLagMs).toEqual([400]));
    it('measures gaps between page changes', () => expect(s.pageChangeGapMs).toEqual([3000]));
    it('counts page-to-page moves', () => expect(s.transitions['/dashboard -> /projects']).toBe(1));
    it('keys the event mix by type or action', () => {
        expect(s.mix['action:task_update']).toBe(1);
        expect(s.mix['link_hover']).toBe(1);
        expect(s.events).toBe(6);
    });
    it('groups dwell by the route left and latency by cache state', () => {
        expect(s.dwellByRoute['/dashboard']).toEqual([5000]);
        expect(s.latencyByCache['miss']).toEqual([50]);
    });
    it('counts hovers before each navigation', () => expect(s.hoversPerNav).toEqual([1]));
    it('measures duration and positive gaps', () => {
        expect(s.durationMs).toBe(9000);
        expect(s.gapMs).toEqual([400, 50, 3550, 3000, 2000]);
    });
});

describe('quantile', () => {
    it('uses nearest rank', () => {
        expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
        expect(quantile([5, 1, 4, 2, 3], 0.9)).toBe(5);
    });
});

describe('toStatRows', () => {
    it('maps generated Prisma rows', () => {
        const [r] = toStatRows([{
            sessionId: 's', userHash: 'u', tenantHash: 't', role: 'ADMIN', variant: 'control', type: 'page_ready',
            toRoute: '/members', latencyMs: 7, cacheState: 'hit', clientTs: new Date(T0), createdAt: new Date(T0 + 30),
        }]);
        expect(r).toMatchObject({ type: 'page_ready', toRoute: '/members', latencyMs: 7, fromRoute: null, role: 'ADMIN' });
        expect(r.createdAt).toEqual(new Date(T0 + 30));
    });
});
