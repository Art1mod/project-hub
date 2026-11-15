/** Seeded, forkable random source. All randomness in the simulator goes through this. */
export interface Rng {
    /** Uniform in [0, 1). */
    next(): number;
    /** Integer in [min, max], inclusive. */
    int(min: number, max: number): number;
    uniform(min: number, max: number): number;
    pick<T>(xs: readonly T[]): T;
    weighted<T>(xs: readonly (readonly [T, number])[]): T;
    chance(p: number): boolean;
    /** Lognormal sample with the given median and 90th percentile. */
    lognormal(median: number, p90: number): number;
    /** Random UUID in v4 format. */
    uuid(): string;
    /** Independent stream derived from (this stream's seed, label). Does not consume this stream. */
    fork(label: string): Rng;
}

function fnv1a(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

const Z90 = 1.2815515655446004;

export function createRng(seed: number): Rng {
    let state = seed >>> 0;
    const next = () => {
        // mulberry32
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const rng: Rng = {
        next,
        int: (min, max) => min + Math.floor(next() * (max - min + 1)),
        uniform: (min, max) => min + next() * (max - min),
        pick: (xs) => {
            if (xs.length === 0) throw new Error('pick from empty list');
            return xs[Math.floor(next() * xs.length)];
        },
        weighted: (xs) => {
            const total = xs.reduce((s, [, w]) => s + w, 0);
            let r = next() * total;
            for (const [x, w] of xs) {
                r -= w;
                if (r < 0) return x;
            }
            return xs[xs.length - 1][0];
        },
        chance: (p) => next() < p,
        lognormal: (median, p90) => {
            const sigma = Math.log(p90 / median) / Z90;
            const u1 = 1 - next(); // (0, 1]
            const u2 = next();
            const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            return Math.exp(Math.log(median) + z * sigma);
        },
        uuid: () => {
            const b = Array.from({ length: 16 }, () => Math.floor(next() * 256));
            b[6] = (b[6] & 0x0f) | 0x40;
            b[8] = (b[8] & 0x3f) | 0x80;
            const h = b.map((x) => x.toString(16).padStart(2, '0')).join('');
            return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
        },
        fork: (label) => createRng(fnv1a(`${seed}:${label}`)),
    };
    return rng;
}
