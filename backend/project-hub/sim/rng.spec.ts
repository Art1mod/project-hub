import { createRng } from './rng';

const quantile = (xs: number[], p: number) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

describe('createRng', () => {
    it('is deterministic for a seed', () => {
        const a = createRng(42);
        const b = createRng(42);
        const xs = Array.from({ length: 100 }, () => a.next());
        const ys = Array.from({ length: 100 }, () => b.next());
        expect(xs).toEqual(ys);
        expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
        expect(createRng(43).next()).not.toBe(createRng(42).next());
    });

    it('forks stable, independent streams', () => {
        const r = createRng(42);
        expect(r.fork('a').next()).toBe(createRng(42).fork('a').next());
        expect(r.fork('a').next()).not.toBe(r.fork('b').next());
        // forking does not consume the parent's stream
        const p1 = createRng(7);
        p1.fork('x');
        expect(p1.next()).toBe(createRng(7).next());
    });

    it('lognormal matches the requested median and p90', () => {
        const r = createRng(1);
        const xs = Array.from({ length: 20_000 }, () => r.lognormal(412, 1169));
        expect(Math.abs(quantile(xs, 0.5) - 412) / 412).toBeLessThan(0.05);
        expect(Math.abs(quantile(xs, 0.9) - 1169) / 1169).toBeLessThan(0.07);
    });

    it('int stays inside inclusive bounds and reaches both ends', () => {
        const r = createRng(3);
        const xs = Array.from({ length: 2000 }, () => r.int(2, 5));
        expect(Math.min(...xs)).toBe(2);
        expect(Math.max(...xs)).toBe(5);
    });

    it('uuid has v4 format', () => {
        const r = createRng(9);
        for (let i = 0; i < 50; i++) {
            expect(r.uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        }
    });

    it('weighted and pick choose from the inputs', () => {
        const r = createRng(5);
        const counts = { a: 0, b: 0 };
        for (let i = 0; i < 4000; i++) counts[r.weighted([['a', 3], ['b', 1]] as const)]++;
        expect(counts.a / 4000).toBeGreaterThan(0.7);
        expect(counts.a / 4000).toBeLessThan(0.8);
        expect(['x', 'y']).toContain(r.pick(['x', 'y']));
    });
});
