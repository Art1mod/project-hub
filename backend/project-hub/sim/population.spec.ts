import { createRng } from './rng';
import { buildPopulation, Population } from './population';

describe('buildPopulation', () => {
    const pop: Population = buildPopulation(createRng(42), { orgs: 10, users: 150 });
    const homeRole = (u: Population['users'][number]) => u.memberships.find((m) => m.orgId === u.homeOrgId)!.role;

    it('creates the requested users and orgs', () => {
        expect(pop.users).toHaveLength(150);
        expect(pop.orgs).toHaveLength(10);
        expect(pop.orgs.reduce((s, o) => s + o.size, 0)).toBe(150);
    });

    it('gives every org exactly one OWNER and 1-3 ADMINs', () => {
        for (const org of pop.orgs) {
            const roles = pop.users.flatMap((u) => u.memberships.filter((m) => m.orgId === org.id).map((m) => m.role));
            expect(roles.filter((r) => r === 'OWNER')).toHaveLength(1);
            const admins = roles.filter((r) => r === 'ADMIN').length;
            expect(admins).toBeGreaterThanOrEqual(1);
            expect(admins).toBeLessThanOrEqual(3);
        }
    });

    it('keeps org sizes uneven: two large, the rest small', () => {
        const sizes = pop.orgs.map((o) => o.size).sort((a, b) => b - a);
        expect(sizes[0]).toBeGreaterThanOrEqual(30);
        expect(sizes[1]).toBeGreaterThanOrEqual(30);
        expect(sizes.slice(2).every((s) => s >= 6 && s <= 15)).toBe(true);
    });

    it('derives persona from the home-org role', () => {
        for (const u of pop.users) {
            const role = homeRole(u);
            if (role === 'OWNER') expect(u.persona).toBe('manager');
            if (role === 'ADMIN') expect(u.persona).toBe('lead');
            if (role === 'MEMBER') expect(['worker', 'scanner']).toContain(u.persona);
        }
        const members = pop.users.filter((u) => homeRole(u) === 'MEMBER');
        const scannerShare = members.filter((u) => u.persona === 'scanner').length / members.length;
        expect(scannerShare).toBeGreaterThanOrEqual(0.08);
        expect(scannerShare).toBeLessThanOrEqual(0.16);
    });

    it('puts 8-12% of users in more than one org, never twice in the same org', () => {
        const multi = pop.users.filter((u) => u.memberships.length > 1).length / pop.users.length;
        expect(multi).toBeGreaterThanOrEqual(0.08);
        expect(multi).toBeLessThanOrEqual(0.12);
        for (const u of pop.users) {
            expect(new Set(u.memberships.map((m) => m.orgId)).size).toBe(u.memberships.length);
            expect(u.memberships.length).toBeLessThanOrEqual(3);
        }
    });

    it('assigns activity levels in the planned mix', () => {
        const count = (a: string) => pop.users.filter((u) => u.activity === a).length;
        expect(count('heavy')).toBe(30);
        expect(count('regular')).toBe(75);
        expect(count('light')).toBe(30);
        expect(count('quiet')).toBe(15);
    });

    it('uses unique sim-only emails', () => {
        expect(new Set(pop.users.map((u) => u.email)).size).toBe(150);
        expect(pop.users.every((u) => /^u\d+@org\d+\.sim\.invalid$/.test(u.email))).toBe(true);
    });

    it('is deterministic for a seed', () => {
        expect(buildPopulation(createRng(42), { orgs: 10, users: 150 })).toEqual(pop);
        expect(buildPopulation(createRng(43), { orgs: 10, users: 150 })).not.toEqual(pop);
    });
});
