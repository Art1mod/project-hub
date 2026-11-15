import { Role } from '@prisma/client';
import { RunConfig } from './config';
import { Rng } from './rng';

export type Persona = 'manager' | 'lead' | 'scanner' | 'worker';
export type Activity = 'heavy' | 'regular' | 'light' | 'quiet';

export interface SimMembership {
    orgId: string;
    role: Role;
}

export interface SimUser {
    id: string;
    email: string;
    persona: Persona;
    activity: Activity;
    homeOrgId: string;
    memberships: SimMembership[];
}

export interface SimOrg {
    id: string;
    index: number;
    /** Number of users whose home org this is. */
    size: number;
}

export interface Population {
    orgs: SimOrg[];
    users: SimUser[];
}

const BIG_ORGS = 2;
const BIG_SIZE = [30, 40] as const;
const SMALL_SIZE = [6, 15] as const;
const SCANNER_SHARE = 0.12;
const MULTI_ORG_SHARE = 0.1;
const MAX_ADMINS = 3;
const ACTIVITY_MIX: [Activity, number][] = [['heavy', 0.2], ['regular', 0.5], ['light', 0.2], ['quiet', 0.1]];

export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function orgSizes(rng: Rng, orgs: number, users: number): number[] {
    const bigCount = Math.min(BIG_ORGS, orgs);
    const sizes = [
        ...Array.from({ length: bigCount }, () => rng.int(BIG_SIZE[0], BIG_SIZE[1])),
        ...Array.from({ length: orgs - bigCount }, () => SMALL_SIZE[0]),
    ];
    let remaining = users - sizes.reduce((s, x) => s + x, 0);
    while (remaining > 0) {
        const open = sizes.map((s, i) => (i >= bigCount && s < SMALL_SIZE[1] ? i : -1)).filter((i) => i >= 0);
        const i = open.length > 0 ? rng.pick(open) : rng.int(0, bigCount - 1);
        sizes[i]++;
        remaining--;
    }
    while (remaining < 0) {
        const i = rng.int(0, bigCount - 1);
        sizes[i]--;
        remaining++;
    }
    return shuffle(rng, sizes);
}

const adminsFor = (size: number) => (size >= 30 ? 3 : size >= 10 ? 2 : 1);

export function buildPopulation(rng: Rng, cfg: Pick<RunConfig, 'orgs' | 'users'>): Population {
    const ids = rng.fork('ids');
    const sizes = orgSizes(rng.fork('sizes'), cfg.orgs, cfg.users);
    const orgs: SimOrg[] = sizes.map((size, index) => ({ id: ids.uuid(), index, size }));

    const users: SimUser[] = [];
    for (const org of orgs) {
        const admins = adminsFor(org.size);
        for (let k = 0; k < org.size; k++) {
            const role: Role = k === 0 ? 'OWNER' : k <= admins ? 'ADMIN' : 'MEMBER';
            const n = users.length + 1;
            users.push({
                id: ids.uuid(),
                email: `u${n}@org${org.index + 1}.sim.invalid`,
                persona: role === 'OWNER' ? 'manager' : role === 'ADMIN' ? 'lead' : 'worker',
                activity: 'regular',
                homeOrgId: org.id,
                memberships: [{ orgId: org.id, role }],
            });
        }
    }

    const members = users.filter((u) => u.memberships[0].role === 'MEMBER');
    for (const u of shuffle(rng.fork('scanners'), members).slice(0, Math.round(SCANNER_SHARE * members.length))) {
        u.persona = 'scanner';
    }

    const adminCount = new Map(orgs.map((o) => [o.id, adminsFor(o.size)]));
    const multi = rng.fork('multi');
    for (const u of shuffle(multi, users).slice(0, Math.round(MULTI_ORG_SHARE * users.length))) {
        const extra = multi.chance(0.7) ? 1 : 2;
        for (const org of shuffle(multi, orgs.filter((o) => o.id !== u.homeOrgId)).slice(0, extra)) {
            const wantsAdmin = multi.chance(0.2) && (adminCount.get(org.id) ?? 0) < MAX_ADMINS;
            if (wantsAdmin) adminCount.set(org.id, (adminCount.get(org.id) ?? 0) + 1);
            u.memberships.push({ orgId: org.id, role: wantsAdmin ? 'ADMIN' : 'MEMBER' });
        }
    }

    const shuffled = shuffle(rng.fork('activity'), users);
    let at = 0;
    ACTIVITY_MIX.forEach(([activity, share], i) => {
        const n = i === ACTIVITY_MIX.length - 1 ? shuffled.length - at : Math.round(share * users.length);
        for (const u of shuffled.slice(at, at + n)) u.activity = activity;
        at += n;
    });

    return { orgs, users };
}

export function roleIn(user: SimUser, orgId: string): Role | undefined {
    return user.memberships.find((m) => m.orgId === orgId)?.role;
}
