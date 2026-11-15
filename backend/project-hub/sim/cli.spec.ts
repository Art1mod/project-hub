import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { runAll } from './cli';
import { RunConfig } from './config';
import { StubBatchClient } from './ai/stub';
import { buildPopulation } from './population';
import { createRng } from './rng';

const cfg: RunConfig = { runId: 'e2e', seed: 42, days: 3, end: '2026-11-14', tz: 'UTC', orgs: 10, users: 150, replan: false, reset: false };
const SALT = 's'.repeat(32);

describe('runAll with the stub AI', () => {
    const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-e2e-'));
    const captured: Prisma.NavEventCreateManyInput[][] = [];
    const deps = () => ({
        client: new StubBatchClient(buildPopulation(createRng(cfg.seed).fork('population'), cfg), cfg.seed),
        salt: SALT,
        runsRoot,
        aiMode: 'stub',
        sink: async (rows: Prisma.NavEventCreateManyInput[]) => { captured.push(rows); },
        log: () => {},
    });
    let first: Awaited<ReturnType<typeof runAll>>;

    beforeAll(async () => {
        first = await runAll(cfg, deps());
    }, 120_000);

    it('generates a full 3-day run that passes every hard check', () => {
        expect(first.hardFailures).toBe(0);
        expect(first.sessions).toBeGreaterThanOrEqual(300);
        expect(first.sessions).toBeLessThanOrEqual(350);
        expect(first.rows).toBeGreaterThan(10_000);
        expect(captured[0]).toHaveLength(first.rows);
    });

    it('writes a report', () => {
        const report = fs.readFileSync(first.reportPath, 'utf8');
        expect(report).toContain('## Hard checks');
        expect(report).toContain('All hard checks pass');
    });

    it('reproduces identical rows from the saved worlds and plans', async () => {
        const client = deps().client;
        const spy = jest.spyOn(client, 'run');
        const second = await runAll(cfg, { ...deps(), client });
        expect(spy).not.toHaveBeenCalled();
        expect(second.rows).toBe(first.rows);
        expect(JSON.stringify(captured[1])).toBe(JSON.stringify(captured[0]));
    }, 120_000);

    it('refuses to reuse a run folder with a different seed', async () => {
        await expect(runAll({ ...cfg, seed: 7 }, deps())).rejects.toThrow(/config/);
    });
});
