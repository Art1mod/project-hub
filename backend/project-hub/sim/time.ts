/** Offset of `tz` from UTC at instant `utcMs`, in ms (local = utc + offset). */
function tzOffsetMs(utcMs: number, tz: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The UTC instant of local wall-clock time (`date`, `minutesOfDay`) in time zone `tz`. */
export function zonedToUtc(date: string, minutesOfDay: number, tz: string): Date {
    const [y, m, d] = date.split('-').map(Number);
    const wall = Date.UTC(y, m - 1, d, 0, 0, 0) + Math.round(minutesOfDay * 60_000);
    let utc = wall - tzOffsetMs(wall, tz);
    utc = wall - tzOffsetMs(utc, tz); // second pass settles DST edges
    return new Date(utc);
}

/** Day of week of a calendar date: 0 = Sunday … 6 = Saturday. */
export function localDayOfWeek(date: string): number {
    return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** `days` calendar dates ending on `end` (inclusive), ascending. */
export function windowDates(end: string, days: number): string[] {
    const endMs = Date.parse(`${end}T00:00:00Z`);
    return Array.from({ length: days }, (_, i) =>
        new Date(endMs - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    );
}

export function isWeekend(date: string): boolean {
    const d = localDayOfWeek(date);
    return d === 0 || d === 6;
}
