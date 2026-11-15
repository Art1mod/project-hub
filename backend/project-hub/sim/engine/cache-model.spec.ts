import * as fs from 'fs';
import { GROUND_TRUTH_FILE } from '../config';
import { loadGroundTruth } from '../ground-truth';
import { CacheModel, replayCacheStates } from './cache-model';

const ORG = 'org-1';
const MIN = 60_000;
const ctx = { orgId: ORG };

describe('CacheModel', () => {
    it('reports miss on the first load of a page', () => {
        expect(new CacheModel().mount('/projects', ctx, 0)).toBe('miss');
    });

    it('reports stale when the page being left still uses the key (Dashboard -> Projects)', () => {
        const c = new CacheModel();
        c.mount('/dashboard', ctx, 0);
        expect(c.mount('/projects', ctx, 10_000)).toBe('stale');
    });

    it('reports hit when returning within 5 minutes', () => {
        const c = new CacheModel();
        c.mount('/projects', ctx, 0);
        c.mount('/projects/:id', { orgId: ORG, projectId: 'p1' }, 5_000);
        expect(c.mount('/projects', ctx, 60_000)).toBe('hit');
        expect(c.mount('/projects/:id', { orgId: ORG, projectId: 'p1' }, 70_000)).toBe('hit');
    });

    it('reports miss after the data sat unused for more than 5 minutes', () => {
        const c = new CacheModel();
        c.mount('/dashboard', ctx, 0);
        c.mount('/members', ctx, 1_000);
        expect(c.mount('/dashboard', ctx, 1_000 + 6 * MIN)).toBe('miss');
    });

    it('reports stale after an action marked the data out of date', () => {
        const c = new CacheModel();
        c.mount('/dashboard', ctx, 0);
        c.mount('/projects/:id', { orgId: ORG, projectId: 'p1' }, 2_000);
        c.invalidate('task_create', { orgId: ORG, projectId: 'p1' }, 3_000);
        expect(c.mount('/dashboard', ctx, 4_000)).toBe('stale');
    });

    it('keeps data fresh when the page that uses it is mounted during the action', () => {
        const c = new CacheModel();
        c.mount('/projects', ctx, 0);
        c.invalidate('project_create', ctx, 1_000); // the Projects page refetches immediately
        c.mount('/members', ctx, 2_000);
        expect(c.mount('/projects', ctx, 3_000)).toBe('hit');
    });

    it('gives null for pages without page_ready', () => {
        expect(new CacheModel().mount('/settings', ctx, 0)).toBeNull();
    });

    it('scopes keys by org', () => {
        const c = new CacheModel();
        c.mount('/projects', ctx, 0);
        c.mount('/members', ctx, 1_000);
        expect(c.mount('/projects', { orgId: 'org-2' }, 2_000)).toBe('miss');
    });
});

const haveSnapshot = fs.existsSync(GROUND_TRUTH_FILE);
if (!haveSnapshot) console.warn(`cache replay test skipped: no snapshot at ${GROUND_TRUTH_FILE}`);
(haveSnapshot ? describe : describe.skip)('replayCacheStates on the real sessions', () => {
    it('reproduces at least 90% of the recorded cache states', () => {
        const result = replayCacheStates(loadGroundTruth(GROUND_TRUTH_FILE));
        for (const m of result.mismatches) console.log(`cache mismatch: ${m}`);
        expect(result.total).toBe(36);
        expect(result.matched / result.total).toBeGreaterThanOrEqual(0.9);
    });
});
