import { createHmac } from 'crypto';
import { buildNavEventRow, hashId, MAX_AGE_MS, MAX_FUTURE_MS, NavEventRowContext } from './nav-event-row';
import { TelemetryEventDto } from './dto/create-telemetry-batch.dto';

const SALT = 'x'.repeat(32);
const NOW = Date.parse('2026-11-14T12:00:00Z');
const UUID = '7d267081-b937-4805-9d49-6338f8ffd262';
const ctx: NavEventRowContext = {
    sessionId: '13cedc90-4f3a-47df-aa04-003b612fff5a',
    variant: 'control',
    userHash: 'u'.repeat(32),
    tenantHash: 't'.repeat(32),
    role: 'MEMBER',
};

const ev = (e: Partial<TelemetryEventDto>): TelemetryEventDto =>
    ({ clientTs: new Date(NOW - 1000).toISOString(), ...e }) as TelemetryEventDto;
const build = (e: Partial<TelemetryEventDto>, now = NOW) => buildNavEventRow(ev(e), ctx, { now, salt: SALT });

describe('hashId', () => {
    it('matches HMAC-SHA256 hex sliced to 32', () => {
        const expected = createHmac('sha256', SALT).update('user:abc').digest('hex').slice(0, 32);
        expect(hashId(SALT, 'user', 'abc')).toBe(expected);
        expect(hashId(SALT, 'user', 'abc')).toHaveLength(32);
    });

    it('domains differ', () => {
        expect(hashId(SALT, 'user', 'a')).not.toBe(hashId(SALT, 'tenant', 'a'));
    });
});

describe('buildNavEventRow', () => {
    it('normalizes routes', () => {
        expect(build({ type: 'route_change', toRoute: `/projects/${UUID}?page=2` })?.toRoute).toBe('/projects/:id');
        expect(build({ type: 'route_change', toRoute: '/login' })).toBeNull();
    });

    it('drops events outside the time window', () => {
        expect(build({ type: 'session_start', clientTs: new Date(NOW - MAX_AGE_MS - 1).toISOString() })).toBeNull();
        expect(build({ type: 'session_start', clientTs: new Date(NOW + MAX_FUTURE_MS + 1).toISOString() })).toBeNull();
        const old = NOW - 3 * 86_400_000;
        expect(build({ type: 'session_start', clientTs: new Date(old).toISOString() }, old + 2000)).not.toBeNull();
    });

    it('enforces per-type required fields', () => {
        expect(build({ type: 'route_change' })).toBeNull();
        expect(build({ type: 'page_ready', toRoute: '/projects' })).toBeNull();
        expect(build({ type: 'page_change' })).toBeNull();
        expect(build({ type: 'entity_open' })).toBeNull();
        expect(build({ type: 'action' })).toBeNull();
        expect(build({ type: 'action', action: 'task_update', entityId: UUID })).toBeNull();
    });

    it('hashes entities by type', () => {
        const row = build({ type: 'entity_open', entityType: 'task', entityId: UUID });
        expect(row?.entityHash).toBe(hashId(SALT, 'entity:task', UUID));
        expect(row?.entityType).toBe('task');
    });

    it('maps optional fields to null', () => {
        const clientTs = new Date(NOW - 500).toISOString();
        const row = build({ type: 'session_start', clientTs });
        expect(row).toMatchObject({
            fromRoute: null, toRoute: null, dwellMs: null, latencyMs: null, page: null,
            bytes: null, cacheState: null, action: null, entityType: null, entityHash: null,
            sessionId: ctx.sessionId, userHash: ctx.userHash, tenantHash: ctx.tenantHash,
            role: 'MEMBER', variant: 'control', type: 'session_start',
        });
        expect(row?.clientTs).toEqual(new Date(clientTs));
    });
});
