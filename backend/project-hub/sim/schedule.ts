import { CAL } from './calibration';
import { Activity, Persona, Population, SimUser } from './population';
import { Rng } from './rng';
import { isWeekend, zonedToUtc } from './time';

export interface SessionSlot {
    slotId: string;
    userId: string;
    start: Date;
    targetMinutes: number;
    driveBy: boolean;
    startOrgId: string;
    leave: 'logout' | 'close_tab';
}

const DAY_START_MIN = 7 * 60 + 30;
const DAY_END_MIN = 19 * 60 + 30;
const LAST_START_MIN = 19 * 60 + 59;
const GAP_AFTER_SESSION_MIN = 10;
const MAX_SESSION_MIN = 90;
/** Logout share among non-drive-by sessions, so the overall share is about CAL.sessionEndShare. */
const LOGOUT_P = CAL.sessionEndShare / (1 - CAL.driveByShare);
const HOME_ORG_P = 0.85;

const TARGET_MINUTES: Record<Persona, [number, number]> = {
    manager: [4, 10],
    worker: [9, 15],
    lead: [12, 22],
    scanner: [10, 18],
};

function workdaySessions(rng: Rng, activity: Activity, dayIndex: number): number {
    switch (activity) {
        case 'heavy': return rng.chance(0.3) ? 3 : 2;
        case 'regular': return (rng.chance(0.85) ? 1 : 0) + (rng.chance(0.06) ? 1 : 0);
        case 'light': return rng.chance(0.4) ? 1 : 0;
        case 'quiet': return dayIndex === 0 && rng.chance(0.6) ? 1 : 0;
    }
}

function normal(rng: Rng, mean: number, sd: number): number {
    const u1 = 1 - rng.next();
    const u2 = rng.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Local minute-of-day: morning peak ~10:00, afternoon peak ~15:00, inside office hours. */
function startMinute(rng: Rng): number {
    const m = rng.chance(0.55) ? normal(rng, 10 * 60, 55) : normal(rng, 15 * 60, 60);
    return Math.min(DAY_END_MIN, Math.max(DAY_START_MIN, m));
}

function targetMinutes(rng: Rng, user: SimUser, driveBy: boolean): number {
    if (driveBy) return rng.uniform(0.3, 1);
    const [median, p90] = TARGET_MINUTES[user.persona];
    return Math.min(MAX_SESSION_MIN, Math.max(1.5, rng.lognormal(median, p90)));
}

export function buildSlots(rng: Rng, pop: Population, window: { dates: string[]; tz: string }): SessionSlot[] {
    const weekendFactor = rng.uniform(CAL.weekendFactor.min, CAL.weekendFactor.max);
    const slots: SessionSlot[] = [];

    for (const user of pop.users) {
        const r = rng.fork(`user:${user.id}`);
        let n = 0;
        let busyUntilMs = -Infinity;
        window.dates.forEach((date, dayIndex) => {
            let count = workdaySessions(r, user.activity, dayIndex);
            if (isWeekend(date)) count = Array.from({ length: count }, () => r.chance(weekendFactor)).filter(Boolean).length;
            const minutes = Array.from({ length: count }, () => startMinute(r)).sort((a, b) => a - b);

            for (const minute of minutes) {
                const driveBy = r.chance(CAL.driveByShare);
                const target = targetMinutes(r, user, driveBy);
                const leave = driveBy ? 'close_tab' : r.chance(LOGOUT_P) ? 'logout' : 'close_tab';
                const others = user.memberships.filter((m) => m.orgId !== user.homeOrgId);
                const startOrgId = others.length > 0 && !r.chance(HOME_ORG_P) ? r.pick(others).orgId : user.homeOrgId;

                let start = zonedToUtc(date, minute, window.tz).getTime();
                if (start < busyUntilMs) start = busyUntilMs;
                const latest = zonedToUtc(date, LAST_START_MIN, window.tz).getTime();
                if (start > latest) continue; // no room left today

                slots.push({ slotId: `${user.id}:${n++}`, userId: user.id, start: new Date(start), targetMinutes: target, driveBy, startOrgId, leave });
                busyUntilMs = Math.ceil(start + (target + GAP_AFTER_SESSION_MIN) * 60_000);
            }
        });
    }

    return slots.sort((a, b) => a.start.getTime() - b.start.getTime() || a.slotId.localeCompare(b.slotId));
}
