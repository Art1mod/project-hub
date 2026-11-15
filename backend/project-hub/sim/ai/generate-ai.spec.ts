import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runPaths } from '../config';
import { Population } from '../population';
import { SessionSlot } from '../schedule';
import { AnthropicBatchClient, BatchClient, BatchItem, BatchOutcome } from './batch';
import { estimateCostUsd, generatePlans, generateWorlds } from './generate-ai';
import { UserPlan, World } from './schemas';

const ORG = 'org-1';
const pop: Population = {
    orgs: [{ id: ORG, index: 0, size: 2 }],
    users: [
        { id: 'u-owner', email: 'u1@org1.sim.invalid', persona: 'manager', activity: 'regular', homeOrgId: ORG, memberships: [{ orgId: ORG, role: 'OWNER' }] },
        { id: 'u-member', email: 'u2@org1.sim.invalid', persona: 'worker', activity: 'regular', homeOrgId: ORG, memberships: [{ orgId: ORG, role: 'MEMBER' }] },
    ],
};
const tasks = (n: number) => Array.from({ length: n }, (_, i) => ({
    key: `T${i}`, title: `Task ${i}`, description: '', status: 'TODO' as const, priority: 'MEDIUM' as const, assigneeUserId: null,
}));
const goodWorld: World = {
    orgId: ORG, theme: 'agency',
    projects: [
        { key: 'P1', name: 'Big', description: '', state: 'busy', tasks: tasks(25) },
        ...['P2', 'P3', 'P4'].map((key) => ({ key, name: key, description: '', state: 'stale' as const, tasks: [] })),
    ],
    focus: [{ userId: 'u-owner', projectKeys: ['P1'] }, { userId: 'u-member', projectKeys: ['P1'] }],
};
const slot = (userId: string): SessionSlot => ({
    slotId: `${userId}:0`, userId, start: new Date('2026-11-12T09:00:00Z'), targetMinutes: 8, driveBy: false, startOrgId: ORG, leave: 'close_tab',
});
const slots = [slot('u-owner'), slot('u-member')];
const planFor = (userId: string, taskRef = 'T1'): UserPlan => ({
    userId,
    sessions: [{ slotId: `${userId}:0`, goal: 'work', steps: [{ step: 'open_task', taskRef }, { step: 'leave', how: 'close_tab' }] }],
});
const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } as BatchOutcome extends { usage: infer U } ? U : never;

class FakeBatchClient implements BatchClient {
    calls: BatchItem[][] = [];
    constructor(private respond: (item: BatchItem, call: number) => BatchOutcome) {}
    async run(items: BatchItem[]): Promise<BatchOutcome[]> {
        this.calls.push(items);
        return items.map((item) => this.respond(item, this.calls.length));
    }
}

const ok = (customId: string, json: unknown): BatchOutcome => ({ customId, ok: true, json, usage });
const tmpPaths = () => runPaths({ runId: 'test' }, fs.mkdtempSync(path.join(os.tmpdir(), 'sim-ai-')));
const worlds = new Map([[ORG, goodWorld]]);
const planJson = (item: BatchItem) => planFor(item.customId.includes('u-owner') ? 'u-owner' : 'u-member');

describe('AnthropicBatchClient.toRequest', () => {
    it('builds a structured-output batch request for Sonnet 5.5', () => {
        const req = AnthropicBatchClient.toRequest({
            customId: 'plan-x', maxTokens: 1000, schema: { type: 'object' },
            system: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b', cache_control: { type: 'ephemeral' } }],
            user: [{ type: 'text', text: 'hi' }],
        });
        expect(req.custom_id).toBe('plan-x');
        expect(req.params.model).toBe('claude-sonnet-5-5');
        expect(req.params.output_config).toEqual({ effort: 'high', format: { type: 'json_schema', schema: { type: 'object' } } });
        const system = req.params.system as { cache_control?: unknown }[];
        expect(system.at(-1)?.cache_control).toEqual({ type: 'ephemeral' });
        expect(req.params.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
    });
});

describe('generateWorlds', () => {
    it('reuses saved worlds without calling the API unless replan is set', async () => {
        const paths = tmpPaths();
        const client = new FakeBatchClient((item) => ok(item.customId, goodWorld));
        const first = await generateWorlds(client, pop, paths, { replan: false });
        expect(first.worlds.get(ORG)?.projects).toHaveLength(4);
        expect(client.calls).toHaveLength(1);
        await generateWorlds(client, pop, paths, { replan: false });
        expect(client.calls).toHaveLength(1);
        await generateWorlds(client, pop, paths, { replan: true });
        expect(client.calls).toHaveLength(2);
    });

    it('retries a too-small world once, then fails the run', async () => {
        const tiny = { ...goodWorld, projects: goodWorld.projects.slice(0, 2) };
        const client = new FakeBatchClient((item) => ok(item.customId, tiny));
        await expect(generateWorlds(client, pop, tmpPaths(), { replan: false })).rejects.toThrow(/world/i);
        expect(client.calls).toHaveLength(2);
    });

    it('fills in focus for members the AI left out', async () => {
        const noFocus = { ...goodWorld, focus: [] };
        const client = new FakeBatchClient((item) => ok(item.customId, noFocus));
        const { worlds: out } = await generateWorlds(client, pop, tmpPaths(), { replan: false });
        expect(out.get(ORG)?.focus.map((f) => f.userId).sort()).toEqual(['u-member', 'u-owner']);
    });
});

describe('generatePlans', () => {
    it('reuses saved plans without calling the API unless replan is set', async () => {
        const paths = tmpPaths();
        const client = new FakeBatchClient((item) => ok(item.customId, planJson(item)));
        await generatePlans(client, pop, worlds, slots, paths, { replan: false, tz: 'UTC' });
        await generatePlans(client, pop, worlds, slots, paths, { replan: false, tz: 'UTC' });
        expect(client.calls).toHaveLength(1);
        await generatePlans(client, pop, worlds, slots, paths, { replan: true, tz: 'UTC' });
        expect(client.calls).toHaveLength(2);
    });

    it('puts the org world block first with a cache breakpoint', async () => {
        const client = new FakeBatchClient((item) => ok(item.customId, planJson(item)));
        await generatePlans(client, pop, worlds, slots, tmpPaths(), { replan: false, tz: 'UTC' });
        const item = client.calls[0][0];
        expect(item.user[0].cache_control).toEqual({ type: 'ephemeral' });
        expect(item.user[0].text).toContain('"theme": "agency"');
        expect(item.system.at(-1)?.cache_control).toEqual({ type: 'ephemeral' });
    });

    it('uses the retry when the first attempt errors', async () => {
        const client = new FakeBatchClient((item, call) =>
            call === 1 && item.customId.includes('u-member') ? { customId: item.customId, ok: false, reason: 'errored' } : ok(item.customId, planJson(item)));
        const out = await generatePlans(client, pop, worlds, slots, tmpPaths(), { replan: false, tz: 'UTC' });
        expect(client.calls).toHaveLength(2);
        expect(client.calls[1]).toHaveLength(1);
        expect(out.fallbacks).toEqual([]);
        expect(out.plans.get('u-member')?.sessions[0].steps[0]).toEqual({ step: 'open_task', taskRef: 'T1' });
    });

    it('falls back to drive-by sessions after two refusals, and remembers the fallback', async () => {
        const paths = tmpPaths();
        const client = new FakeBatchClient((item) =>
            item.customId.includes('u-member') ? { customId: item.customId, ok: false, reason: 'refusal' } : ok(item.customId, planJson(item)));
        const out = await generatePlans(client, pop, worlds, slots, paths, { replan: false, tz: 'UTC' });
        expect(out.fallbacks).toEqual(['u-member']);
        expect(out.plans.get('u-member')?.sessions).toEqual([
            { slotId: 'u-member:0', goal: 'fallback: quick look', steps: [{ step: 'scan_dashboard', intensity: 'light' }, { step: 'leave', how: 'close_tab' }] },
        ]);
        const again = await generatePlans(client, pop, worlds, slots, paths, { replan: false, tz: 'UTC' });
        expect(client.calls).toHaveLength(2);
        expect(again.fallbacks).toEqual(['u-member']);
    });

    it('reports plan steps that refer to unknown tasks', async () => {
        const client = new FakeBatchClient((item) =>
            ok(item.customId, item.customId.includes('u-member') ? planFor('u-member', 'NOPE') : planJson(item)));
        const out = await generatePlans(client, pop, worlds, slots, tmpPaths(), { replan: false, tz: 'UTC' });
        expect(out.dropped).toEqual([expect.objectContaining({ userId: 'u-member', slotId: 'u-member:0', index: 0 })]);
    });

    it('treats JSON that fails the schema like a failed item', async () => {
        const client = new FakeBatchClient((item, call) =>
            call === 1 && item.customId.includes('u-owner') ? ok(item.customId, { nope: true }) : ok(item.customId, planJson(item)));
        const out = await generatePlans(client, pop, worlds, slots, tmpPaths(), { replan: false, tz: 'UTC' });
        expect(client.calls).toHaveLength(2);
        expect(out.fallbacks).toEqual([]);
    });
});

describe('estimateCostUsd', () => {
    it('uses Sonnet 5.5 batch rates', () => {
        expect(estimateCostUsd({ input: 1e6, output: 1e6, cacheRead: 0, cacheWrite: 0 })).toBe(6);
        expect(estimateCostUsd({ input: 0, output: 0, cacheRead: 1e6, cacheWrite: 1e6 })).toBeCloseTo(0.05 + 1.25);
    });
});
