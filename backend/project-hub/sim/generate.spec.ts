import { TelemetryEventDto } from '../src/telemetry/dto/create-telemetry-batch.dto';
import { hashId } from '../src/telemetry/nav-event-row';
import { SimSession } from './engine/session';
import { flushTimes, sessionsToRows } from './generate';
import { Population } from './population';
import { createRng } from './rng';

const T0 = Date.parse('2026-11-12T09:00:00Z');
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const U = 'cccccccc-0000-4000-8000-00000000000c';
const ev = (dt: number, e: Partial<TelemetryEventDto>, orgId = A) =>
    ({ orgId, event: { type: 'link_hover', toRoute: '/projects', fromRoute: '/dashboard', ...e, clientTs: new Date(T0 + dt).toISOString() } as TelemetryEventDto });

describe('flushTimes', () => {
    const events = Array.from({ length: 45 }, (_, i) => ev(i * 100, {}));
    const created = flushTimes(events, createRng(1));

    it('flushes at 20 queued events and at the end', () => {
        const flushAt = (i: number) => created[i] - (T0 + 0);
        // events 0-19 go out when the 20th is queued (t=1900), 20-39 at t=3900, the rest at the last event (t=4400)
        expect(created.slice(0, 20).every((c) => c === created[0])).toBe(true);
        expect(flushAt(0)).toBeGreaterThanOrEqual(1900 + 15);
        expect(flushAt(0)).toBeLessThanOrEqual(1900 + 60);
        expect(flushAt(20)).toBeGreaterThanOrEqual(3900 + 15);
        expect(flushAt(44)).toBeGreaterThanOrEqual(4400 + 15);
        expect(flushAt(44)).toBeLessThanOrEqual(4400 + 60);
    });

    it('flushes on the 5 s timer when events are sparse', () => {
        const sparse = [ev(0, {}), ev(1000, {}), ev(7000, {}), ev(30_000, {})];
        const c = flushTimes(sparse, createRng(2)).map((x) => x - T0);
        expect(c[0]).toBeGreaterThanOrEqual(5000);
        expect(c[0]).toBeLessThanOrEqual(5060);
        expect(c[1]).toBe(c[0]);
        expect(c[2]).toBeGreaterThanOrEqual(10_000);
        expect(c[3]).toBeGreaterThanOrEqual(30_000);
    });

    it('keeps createdAt at or after clientTs and within the flush lag', () => {
        const mixed = [ev(0, {}), ev(4999, {}), ev(5001, {}), ev(12_345, {}), ev(12_346, {})];
        const c = flushTimes(mixed, createRng(3));
        mixed.forEach((m, i) => {
            const lag = c[i] - Date.parse(m.event.clientTs);
            expect(lag).toBeGreaterThanOrEqual(0);
            expect(lag).toBeLessThanOrEqual(5060);
        });
    });
});

describe('sessionsToRows', () => {
    const SALT = 's'.repeat(32);
    const pop: Population = {
        orgs: [{ id: A, index: 0, size: 1 }, { id: B, index: 1, size: 0 }],
        users: [{ id: U, email: 'u', persona: 'lead', activity: 'regular', homeOrgId: A, memberships: [{ orgId: A, role: 'ADMIN' }, { orgId: B, role: 'MEMBER' }] }],
    };
    const session: SimSession = {
        sessionId: 'dddddddd-0000-4000-8000-00000000000d', userId: U, leave: 'close_tab',
        slot: { slotId: `${U}:0`, userId: U, start: new Date(T0), targetMinutes: 5, driveBy: false, startOrgId: A, leave: 'close_tab' },
        events: [
            ev(0, { type: 'session_start', toRoute: undefined, fromRoute: undefined }),
            ev(0, { type: 'route_change', toRoute: '/dashboard', fromRoute: undefined }),
            ev(60, { type: 'page_ready', toRoute: '/dashboard', fromRoute: undefined, latencyMs: 60, cacheState: 'miss' }),
            ev(9000, { type: 'link_hover', fromRoute: '/dashboard', toRoute: '/members' }, B),
            ev(9500, { type: 'route_change', fromRoute: '/dashboard', toRoute: '/members', dwellMs: 9500 }, B),
        ],
    };
    const rows = sessionsToRows([session], pop, SALT, createRng(4));

    it('builds one row per event with the server hashing', () => {
        expect(rows).toHaveLength(5);
        expect(rows.every((r) => r.userHash === hashId(SALT, 'user', U))).toBe(true);
        expect(rows.every((r) => r.variant === 'control' && r.sessionId === session.sessionId)).toBe(true);
    });

    it('takes tenant and role from the org each event happened in', () => {
        expect(rows[0]).toMatchObject({ tenantHash: hashId(SALT, 'tenant', A), role: 'ADMIN' });
        expect(rows[4]).toMatchObject({ tenantHash: hashId(SALT, 'tenant', B), role: 'MEMBER' });
    });

    it('sets explicit ids and createdAt not before clientTs', () => {
        for (const r of rows) {
            expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
            expect(new Date(r.createdAt as Date).getTime()).toBeGreaterThanOrEqual(new Date(r.clientTs as Date).getTime());
        }
    });

    it('is byte-identical for the same seed', () => {
        expect(JSON.stringify(sessionsToRows([session], pop, SALT, createRng(4)))).toBe(JSON.stringify(rows));
    });

    it('throws when the server would drop an event', () => {
        const bad = { ...session, events: [ev(0, { type: 'route_change', toRoute: '/login' })] };
        expect(() => sessionsToRows([bad], pop, SALT, createRng(4))).toThrow(/would be dropped/);
    });
});
