import { localDayOfWeek, windowDates, zonedToUtc } from './time';

describe('zonedToUtc', () => {
    it('converts local wall-clock time to UTC', () => {
        expect(zonedToUtc('2026-11-12', 9 * 60, 'Europe/Berlin').toISOString()).toBe('2026-11-12T08:00:00.000Z');
        expect(zonedToUtc('2026-11-12', 9 * 60, 'America/New_York').toISOString()).toBe('2026-11-12T14:00:00.000Z');
        expect(zonedToUtc('2026-11-12', 9 * 60, 'UTC').toISOString()).toBe('2026-11-12T09:00:00.000Z');
        expect(zonedToUtc('2026-11-12', 23 * 60 + 30, 'Asia/Tokyo').toISOString()).toBe('2026-11-12T14:30:00.000Z');
    });

    it('handles a summer date (DST offset)', () => {
        expect(zonedToUtc('2026-07-01', 9 * 60, 'Europe/Berlin').toISOString()).toBe('2026-07-01T07:00:00.000Z');
    });
});

describe('windowDates / localDayOfWeek', () => {
    it('lists the window ending on `end`, ascending', () => {
        expect(windowDates('2026-11-14', 3)).toEqual(['2026-11-12', '2026-11-13', '2026-11-14']);
        expect(windowDates('2026-03-01', 2)).toEqual(['2026-02-28', '2026-03-01']);
    });

    it('gives the weekday of a calendar date', () => {
        expect(localDayOfWeek('2026-11-14')).toBe(6);
        expect(localDayOfWeek('2026-11-12')).toBe(4);
    });
});
