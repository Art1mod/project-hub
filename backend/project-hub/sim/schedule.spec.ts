import { createRng } from './rng';
import { buildPopulation } from './population';
import { buildSlots, SessionSlot } from './schedule';
import { localDayOfWeek, windowDates } from './time';

const TZ = 'Europe/Berlin';
const pop = buildPopulation(createRng(42), { orgs: 10, users: 150 });
const window = { dates: windowDates('2026-11-14', 3), tz: TZ };
const slots = buildSlots(createRng(42).fork('schedule'), pop, window);

const localParts = (d: Date) => {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
};

describe('buildSlots', () => {
    it('produces 300-350 sessions for the 3-day trial', () => {
        expect(slots.length).toBeGreaterThanOrEqual(300);
        expect(slots.length).toBeLessThanOrEqual(350);
    });

    it('puts Saturday at about 15-20% of a weekday', () => {
        const perDay = new Map<string, number>();
        for (const s of slots) perDay.set(localParts(s.start).date, (perDay.get(localParts(s.start).date) ?? 0) + 1);
        const weekdays = window.dates.filter((d) => localDayOfWeek(d) % 6 !== 0).map((d) => perDay.get(d) ?? 0);
        const sat = perDay.get('2026-11-14') ?? 0;
        const ratio = sat / (weekdays.reduce((a, b) => a + b, 0) / weekdays.length);
        expect(ratio).toBeGreaterThanOrEqual(0.12);
        expect(ratio).toBeLessThanOrEqual(0.23);
    });

    it('gives the top 20% of users 40-50% of sessions', () => {
        const per = pop.users.map((u) => slots.filter((s) => s.userId === u.id).length).sort((a, b) => b - a);
        const top = per.slice(0, Math.round(per.length * 0.2)).reduce((a, b) => a + b, 0);
        const share = top / slots.length;
        expect(share).toBeGreaterThanOrEqual(0.4);
        expect(share).toBeLessThanOrEqual(0.5);
    });

    it('marks about 15% as drive-by and about 20% as ending in logout', () => {
        const driveBy = slots.filter((s) => s.driveBy).length / slots.length;
        const logout = slots.filter((s) => s.leave === 'logout').length / slots.length;
        expect(driveBy).toBeGreaterThanOrEqual(0.12);
        expect(driveBy).toBeLessThanOrEqual(0.18);
        expect(logout).toBeGreaterThanOrEqual(0.16);
        expect(logout).toBeLessThanOrEqual(0.24);
        expect(slots.filter((s) => s.driveBy).every((s) => s.leave === 'close_tab' && s.targetMinutes <= 1)).toBe(true);
    });

    it('keeps starts inside local office hours', () => {
        for (const s of slots) {
            const { hour } = localParts(s.start);
            expect(hour).toBeGreaterThanOrEqual(7);
            expect(hour).toBeLessThan(20);
        }
    });

    it('never overlaps one user\'s sessions and is sorted by start', () => {
        const byUser = new Map<string, SessionSlot[]>();
        for (const s of slots) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
        for (const list of byUser.values()) {
            for (let i = 1; i < list.length; i++) {
                const prev = list[i - 1];
                expect(list[i].start.getTime()).toBeGreaterThanOrEqual(prev.start.getTime() + (prev.targetMinutes + 10) * 60_000);
            }
        }
        for (let i = 1; i < slots.length; i++) expect(slots[i].start.getTime()).toBeGreaterThanOrEqual(slots[i - 1].start.getTime());
    });

    it('starts in an org the user belongs to, usually the home org', () => {
        const users = new Map(pop.users.map((u) => [u.id, u]));
        for (const s of slots) expect(users.get(s.userId)!.memberships.map((m) => m.orgId)).toContain(s.startOrgId);
        expect(new Set(slots.map((s) => s.slotId)).size).toBe(slots.length);
    });

    it('is deterministic for a seed', () => {
        expect(buildSlots(createRng(42).fork('schedule'), pop, window)).toEqual(slots);
    });
});
