# AI-Simulated Telemetry (3-day trial) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate 3 days of realistic `NavEvent` rows from about 150 AI-planned simulated users into a separate `taskforge_sim` database, with a validation report against the 2 real sessions.

**Architecture:**
- Seeded code builds the population and session slots.
- Claude (Batch API, structured JSON) writes each org's world and each user's 3-day step plan.
- A deterministic simulator expands the plans into frontend-faithful telemetry events, then runs them through the same pure row builder the backend uses (extracted from `TelemetryService`) and bulk-inserts the rows.
- Everything lives in `backend/project-hub/sim/` and runs through `npm run sim`.

**Tech Stack:**
- TypeScript (Node 24, CommonJS through `module: nodenext`), ts-node, Jest + ts-jest
- Prisma 7 with `@prisma/adapter-pg`, PostgreSQL 15
- `@anthropic-ai/sdk`, `zod` v4

**Spec:** `docs/superpowers/specs/2026-11-15-ai-simulated-telemetry-design.md`

## Global Constraints

- The `NavEvent` schema and stored format do not change. No Prisma migration is added.
- Simulated data is written only to `taskforge_sim`, via `SIM_DATABASE_URL`. The CLI refuses to run if that URL points at the same database as `DATABASE_URL`.
- Real data is read only from the Metabase public endpoints `http://localhost:3001/api/public/card/{c4d7a16b-620f-47fe-a146-23efdbb2a8b4,ec317d14-f122-4b44-a245-e51a49e06701}/query/json`, snapshotted to `sim/ground-truth/real-sessions.json`.
- Hashing: `HMAC-SHA256(TELEMETRY_SALT, "<domain>:<id>")` as hex, sliced to 32 characters. Domains `user`, `tenant`, `entity:<entityType>`. The salt must be at least 32 characters.
- Every row has `variant = 'control'`. No `prefetch_*` events.
- Model `claude-sonnet-5-5`, `output_config.effort: "high"`, `output_config.format: { type: "json_schema", schema }`. All AI calls go through the Message Batches API. Shared system prompt blocks carry `cache_control: { type: "ephemeral" }`.
- JSON schemas sent to the API: every object is `z.strictObject` (`additionalProperties: false`), with no `minimum`, `maximum`, `minLength` or `maxLength`. Ranges are checked in code.
- Default window: 3 days ending yesterday. Run on 2026-11-15, that is Thu 2026-11-12 to Sat 2026-11-14. The time zone defaults to `Intl.DateTimeFormat().resolvedOptions().timeZone`. Every timestamp is stored in UTC.
- Population: 10 orgs and 150 users. Exactly 1 OWNER per org, 1–3 ADMINs, the rest MEMBER. About 10% of users are in 2–3 orgs.
- Persona follows the home-org role: OWNER → `manager`, ADMIN → `lead`, about 12% of MEMBERs → `scanner`, other MEMBERs → `worker`. Drive-by is a per-session flag, set on about 15% of sessions.
- Inserts use `createMany` in chunks of 1,000.
- Same seed and same saved world/plan JSON produce byte-identical rows, including `id` and `createdAt`.
- Commit style follows the repo, e.g. `feat:(backend/sim): …`. Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work happens on branch `feat/sim-telemetry`, never on `main`.

## Review Focus

1. **The sim database URL is unset or points at the real database under a different spelling** (`localhost` vs `127.0.0.1`, extra query params). Expected: refuse before connecting. Test in Task 2.
2. **Running again into a sim database that already has data, without `--reset`.** Expected: refuse with a message naming `--reset`. No duplicates. Test in Task 12.
3. **A batch item errors, expires or is refused.** Expected: retry once, then fall back (world: fail the run; plan: drive-by sessions for that user). The run completes and the report counts fallbacks. Test in Task 8.
4. **A plan refers to an entity that's gone or out of scope.** Examples: a task deleted earlier in the same plan, a project in an org the user has switched away from, a `new:<n>` ref before its `create_task`. Expected: the step is dropped and logged. Test in Task 7.
5. **One user's sessions overlap, or timestamps go backwards.** Expected: a user's sessions never overlap, `clientTs` never decreases within a session, and `createdAt >= clientTs`. Tests in Tasks 6 and 12.

---

## File Structure

```
backend/project-hub/
  src/telemetry/nav-event-row.ts          # NEW pure row builder + hashId (shared by service and sim)
  src/telemetry/nav-event-row.spec.ts     # NEW
  src/telemetry/telemetry.service.ts      # MODIFY: delegate to nav-event-row
  package.json                            # MODIFY: deps @anthropic-ai/sdk, zod; script "sim"
  .gitignore                              # MODIFY: sim/runs/, sim/ground-truth/
  .env.example                            # MODIFY: SIM_DATABASE_URL
  sim/
    README.md                             # setup: create DB, migrate, Metabase data source, run
    cli.ts                                # arg parsing + stage orchestration
    config.ts                             # RunConfig type, defaults, run folder paths
    db.ts                                 # guarded Prisma client for the sim DB
    rng.ts                                # seeded RNG, forkable streams, distributions, uuid
    time.ts                               # zoned local time -> UTC
    calibration.ts                        # numbers from spec §4 as constants
    ground-truth.ts                       # fetch + load snapshot
    stats.ts                              # per-session metrics (shared by calibration check + report)
    population.ts                         # orgs, users, roles, personas, activity
    schedule.ts                           # session slots
    permissions.ts                        # role -> allowed steps (mirrors frontend permissions.ts)
    ai/schemas.ts                         # zod: World, UserPlan, Step
    ai/validate-plan.ts                   # id/permission/order checks
    ai/prompts.ts                         # system + user prompt builders
    ai/batch.ts                           # BatchClient interface + Anthropic impl + runBatch
    ai/generate-ai.ts                     # world + plan stages, retry/fallback, file reuse, cost
    world-db.ts                           # world -> app table rows, write/reset
    engine/world-state.ts                 # mutable world: tasks, pages, attention list
    engine/cache-model.ts                 # TanStack Query cacheState model
    engine/hover.ts                       # hover targets per page + cooldown
    engine/session.ts                     # steps -> timed TelemetryEvents
    generate.ts                           # sessions -> flush times -> rows -> insert
    validate/hard-checks.ts
    validate/compare.ts
    validate/report.ts
    **/*.spec.ts                          # tests next to each file
```

Tests run from `backend/project-hub` with `npx jest <path>`. The Jest `testRegex` already matches `sim/**/*.spec.ts`. `tsconfig.build.json` includes only `src`, so `sim/` stays out of `nest build`.

---

### Task 1: Extract the pure NavEvent row builder

**Files:**
- Create: `backend/project-hub/src/telemetry/nav-event-row.ts`, `backend/project-hub/src/telemetry/nav-event-row.spec.ts`
- Modify: `backend/project-hub/src/telemetry/telemetry.service.ts` (replace `hash` and `buildRow` with calls into the new module)

**Interfaces:**
- Produces:
  - `hashId(salt: string, domain: string, value: string): string`
  - `interface NavEventRowContext { sessionId: string; variant: string; userHash: string; tenantHash: string; role: Role }`
  - `buildNavEventRow(e: TelemetryEventDto, ctx: NavEventRowContext, opts: { now: number; salt: string }): Prisma.NavEventCreateManyInput | null`
  - `MAX_AGE_MS = 86_400_000`, `MAX_FUTURE_MS = 300_000`, exported

- [ ] **Step 0: Branch and record the baseline**

```bash
git checkout -b feat/sim-telemetry
cd backend/project-hub && npx jest 2>&1 | tail -20
```
Write down which suites fail before any change (e.g. `telemetry.service.spec.ts` needs `PrismaService` and `TELEMETRY_SALT`). Later tasks may only add failures that this plan explains.

- [ ] **Step 1: Write the failing tests in `nav-event-row.spec.ts`**

`SALT = 'x'.repeat(32)`, `NOW = Date.parse('2026-11-14T12:00:00Z')`, `ctx` with role `'MEMBER'`, variant `'control'`. Tests:
- `hashId matches HMAC-SHA256 hex sliced to 32`: equals `createHmac('sha256', SALT).update('user:abc').digest('hex').slice(0, 32)`, and has length 32.
- `hashId domains differ`: `hashId(S,'user','a') !== hashId(S,'tenant','a')`.
- `normalizes routes`: `toRoute '/projects/<uuid>?page=2'` gives `'/projects/:id'`. `toRoute '/login'` gives `null` for the whole row.
- `drops events outside the time window`: `clientTs` at `NOW - MAX_AGE_MS - 1` gives `null`. `NOW + MAX_FUTURE_MS + 1` gives `null`. `NOW - 3 days` with `opts.now = that ts + 2000` gives a row.
- `enforces per-type required fields`, each giving `null`:
  - `route_change` without `toRoute`
  - `page_ready` without `latencyMs`
  - `page_change` without `page`
  - `entity_open` without entity
  - `action` without `action`
  - `entityId` without `entityType`
- `hashes entities by type`: `entityHash === hashId(SALT, 'entity:task', id)`.
- `maps optional fields to null`: a `session_start` row has `fromRoute`, `toRoute`, `dwellMs`, `latencyMs`, `page`, `bytes`, `cacheState`, `action`, `entityType` and `entityHash` all `null`, and `clientTs` is a `Date` equal to the input.

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `npx jest src/telemetry/nav-event-row.spec.ts`
Expected: FAIL, "Cannot find module './nav-event-row'".

- [ ] **Step 3: Implement `nav-event-row.ts`**

Move the body of `TelemetryService.buildRow` and `hash` here unchanged. The only differences: the clock and salt come from `opts`, and `this.hash(d, v)` becomes `hashId(opts.salt, d, v)`. `TelemetryService` keeps its salt check, computes `userHash`/`tenantHash` with `hashId`, and calls `buildNavEventRow(event, ctx, { now: Date.now(), salt: this.salt })`.

- [ ] **Step 4: Run the tests to make sure they pass, and check for regressions**

Run: `npx jest src/telemetry && npm run build`
Expected: `nav-event-row.spec.ts` PASS. Other suites match the Step 0 baseline. The build succeeds.

- [ ] **Step 5: Commit, including the spec and the plan**

```bash
git add src/telemetry ../../docs/superpowers
git commit -m "refactor:(backend/telemetry): extract pure NavEvent row builder"
```

---

### Task 2: Sim scaffolding and the guarded database client

**Files:**
- Create: `sim/config.ts`, `sim/db.ts`, `sim/db.spec.ts`, `sim/README.md`
- Modify: `package.json` (add deps `@anthropic-ai/sdk`, `zod@^4`; script `"sim": "ts-node sim/cli.ts"`), `.gitignore` (`sim/runs/`, `sim/ground-truth/`), `.env.example` (`SIM_DATABASE_URL="postgresql://postgres:password@localhost:5432/taskforge_sim"`)

**Interfaces:**
- Produces:
  - `assertSimDatabase(simUrl: string | undefined, mainUrl: string | undefined): void`. Throws `Error` with a message containing `SIM_DATABASE_URL`.
  - `createSimPrisma(): PrismaClient`. Reads env, calls `assertSimDatabase`, uses `PrismaPg` as `src/prisma/prisma.service.ts` does.
  - `interface RunConfig { runId: string; seed: number; days: number; end: string /* YYYY-MM-DD, last day inclusive */; tz: string; orgs: number; users: number; replan: boolean; reset: boolean }`
  - `defaultConfig(now: Date): RunConfig` gives `days 3`, `end` = yesterday in local tz, `seed 42`, `orgs 10`, `users 150`, `runId` = `trial-<end>-s<seed>`
  - `runPaths(cfg): { dir; config; world; plans; report; manifest }` under `sim/runs/<runId>/`

- [ ] **Step 1: Write the failing tests in `db.spec.ts`**

- Throws when `simUrl` is undefined.
- Throws when it is the same database as `mainUrl`, comparing host (with `localhost` = `127.0.0.1` = `::1`), port (default 5432) and database name, and ignoring user, password and query string. For example `postgresql://a:b@127.0.0.1/taskforge?schema=public` vs `postgresql://postgres:password@localhost:5432/taskforge`.
- Passes for `.../taskforge_sim` vs `.../taskforge`.

- [ ] **Step 2: Run them to make sure they fail**

`npx jest sim/db.spec.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `db.ts` and `config.ts`, install the deps, write `sim/README.md`**

The README covers:
- `docker exec taskforge_postgres createdb -U postgres taskforge_sim`
- `DATABASE_URL=$SIM_DATABASE_URL npx prisma migrate deploy`
- Adding Metabase → Admin → Databases → Add, host `postgres` (the compose service name), db `taskforge_sim`
- `ANTHROPIC_API_KEY` or `ant auth login`
- The run commands from Task 14

- [ ] **Step 4: Run the tests to make sure they pass**

`npx jest sim/db.spec.ts`. Expected: PASS.

- [ ] **Step 5: Create the sim database for real and check it's empty**

Run the README commands. Then:
```bash
docker exec taskforge_postgres psql -U postgres -d taskforge_sim -c 'SELECT count(*) FROM "NavEvent"'
```
Expected: `0`.

- [ ] **Step 6: Commit**

`git commit -m "feat:(backend/sim): scaffold sim package with guarded database client"`

---

### Task 3: Seeded RNG, time helpers and calibration constants

**Files:**
- Create: `sim/rng.ts`, `sim/rng.spec.ts`, `sim/time.ts`, `sim/time.spec.ts`, `sim/calibration.ts`

**Interfaces:**
- Produces:
  - `interface Rng { next(): number /* [0,1) */; int(min: number, max: number): number /* inclusive */; pick<T>(xs: readonly T[]): T; weighted<T>(xs: readonly [T, number][]): T; chance(p: number): boolean; lognormal(median: number, p90: number): number; uuid(): string /* v4 format */; fork(label: string): Rng }`
  - `createRng(seed: number): Rng`. `fork` derives an independent stream from (parent seed, label), so adding a user doesn't shift another user's draws.
  - `zonedToUtc(date: string /* YYYY-MM-DD */, minutesOfDay: number, tz: string): Date`, `localDayOfWeek(date: string): number /* 0=Sun */`, `windowDates(end: string, days: number): string[]` (ascending)
  - `CAL`: the spec §4 values as constants. `gapMs {median:1933,p90:14400}`, `hoverLagMs {p10:144,median:412,p90:1169}`, `hoversPerNav {median:2,p90:5,max:24}`, `dwellMs` per route (`/projects {3946,16868}`, `/projects/:id {56871,214051}`, `/dashboard {100028,443323}`, `/members {16250,112661}`), `pageChangeGapMs {median:3589,p90:15035}`, `latencyMs {miss:{56,214}, hit:{9,31}, stale:{4,8}}`, `uploadLatencyMs {239..290}`, `uploadBytes {1323..5981}`, `ingestLagMs {min:17,max:5052}`, `hoverDelayMs 150`, `hoverCooldownMs 2000`, `flushIntervalMs 5000`, `flushAt 20`, `tasksPerPage 10`, `attentionTake 6`. The macro targets go here too: weekend factor `0.15–0.20`, drive-by `0.15`, `sessionEndShare 0.20`, top-20% share `0.40–0.50`, quiet users `0.10`.

- [ ] **Step 1: Write the failing tests**

- Same seed gives the same first 100 `next()`. `fork('a')` is stable and differs from `fork('b')`.
- `lognormal(412, 1169)` over 20k draws: sample median within ±5% of 412, p90 within ±7% of 1169.
- `int` stays inside its bounds. `uuid()` matches `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`.
- `zonedToUtc('2026-11-12', 9*60, 'Europe/Berlin')` gives `2026-11-12T08:00:00.000Z`. With `'America/New_York'` it gives `14:00Z`. With `'UTC'` it gives `09:00Z`.
- `windowDates('2026-11-14', 3)` gives `['2026-11-12','2026-11-13','2026-11-14']`. `localDayOfWeek('2026-11-14')` gives `6`.

- [ ] **Step 2: Run them to make sure they fail.** `npx jest sim/rng.spec.ts sim/time.spec.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - RNG: mulberry32. `fork` seeds from an FNV-1a hash of `${seed}:${label}`.
  - Lognormal: `exp(ln(median) + z·σ)`, with `σ = ln(p90/median)/1.2816` and `z` from Box–Muller.
  - `zonedToUtc`: find the offset with `Intl.DateTimeFormat(…,{timeZone, …}).formatToParts`, and iterate twice to handle DST edges.

- [ ] **Step 4: Run them to make sure they pass.** Expected: PASS.

- [ ] **Step 5: Commit.** `feat:(backend/sim): add seeded rng, time zone helpers and calibration`

---

### Task 4: Ground-truth snapshot and session stats

**Files:**
- Create: `sim/ground-truth.ts`, `sim/stats.ts`, `sim/stats.spec.ts`

**Interfaces:**
- Produces:
  - `type StatRow = { sessionId: string; type: string; fromRoute: string|null; toRoute: string|null; entityType: string|null; dwellMs: number|null; latencyMs: number|null; cacheState: string|null; action: string|null; page: number|null; role: string; tenantHash: string; clientTs: Date }`
  - `fetchGroundTruth(baseUrl: string, uuids: string[], outFile: string): Promise<StatRow[]>`. Maps Metabase's PascalCase keys (`ClientTs`, `ToRoute`, …) and treats Metabase's zone-less `ClientTs` as UTC.
  - `loadGroundTruth(file: string): StatRow[]`. Throws with a "run `npm run sim -- fetch-ground-truth`" hint when the file is missing.
  - `interface SessionStats { events: number; durationMs: number; mix: Record<string, number>; gapMs: number[]; hoversPerNav: number[]; hoverLagMs: number[]; dwellByRoute: Record<string, number[]>; pageChangeGapMs: number[]; latencyByCache: Record<string, number[]>; transitions: Record<string, number> }`
  - `sessionStats(rows: StatRow[]): SessionStats` (one session, any order). `pooledStats(rows: StatRow[]): SessionStats`. `quantile(xs: number[], p: number): number` (nearest-rank, as in spec §4).
- Definitions, which must match how §4 was computed:
  - `hoverLagMs` = for each `route_change`, the time since the last `link_hover` with the same `toRoute`, when under 10 s
  - `pageChangeGapMs` = gaps between consecutive `page_change` events under 60 s
  - `mix` keys are `type` or `action:<action>`

- [ ] **Step 1: Write the failing tests** on a hand-built 8-row fixture: hover at t=0 to `/projects`, `route_change` at t=400 dwell 5000, `page_ready` miss 50, two `page_change` 3 s apart, one action. Assert:
  - `hoverLagMs` is `[400]`
  - `pageChangeGapMs` is `[3000]`
  - `transitions['/dashboard -> /projects']` is `1`
  - `mix['action:task_update']` is `1`
  - `quantile([1,2,3,4,5], 0.5)` is `3`

- [ ] **Step 2: Run them to make sure they fail.** `npx jest sim/stats.spec.ts`. Expected: FAIL.

- [ ] **Step 3: Implement both modules.**

- [ ] **Step 4: Run them to make sure they pass.** Expected: PASS.

- [ ] **Step 5: Snapshot the real data and check it against the spec.** Temporary script or Task 14's CLI: `npx ts-node -e` calling `fetchGroundTruth` to `sim/ground-truth/real-sessions.json`, then print `pooledStats`.
Expected:
  - 318 rows
  - median gap 1933 and p90 14400
  - hover lag median 412
  - `/projects/:id` dwell median 56871
  - miss latency median 56

If Metabase isn't reachable, stop and report it. Don't guess.

- [ ] **Step 6: Commit.** `feat:(backend/sim): snapshot real sessions and compute session stats`

---

### Task 5: Population generator

**Files:**
- Create: `sim/population.ts`, `sim/population.spec.ts`

**Interfaces:**
- Consumes: `Rng`, `RunConfig`
- Produces:
  - `type Persona = 'manager'|'lead'|'scanner'|'worker'`
  - `type Activity = 'heavy'|'regular'|'light'|'quiet'`
  - `interface SimUser { id: string; email: string; persona: Persona; activity: Activity; homeOrgId: string; memberships: { orgId: string; role: Role }[] }`
  - `interface SimOrg { id: string; index: number; size: number }`
  - `interface Population { orgs: SimOrg[]; users: SimUser[] }`
  - `buildPopulation(rng: Rng, cfg: Pick<RunConfig,'orgs'|'users'>): Population`
- Rules:
  - Org sizes are uneven, e.g. 2 orgs of 30–40 and the rest 6–15, with home-org members summing to `users`.
  - Each org has exactly 1 OWNER and 1–3 ADMINs. The rest are MEMBERs.
  - 8–12% of users get 1–2 extra memberships (role MEMBER 80%, ADMIN 20%). An extra membership never makes a second OWNER.
  - Persona comes from the home-org role (Global Constraints).
  - Activity mix: heavy 20%, regular 50%, light 20%, quiet 10%.
  - Email is `u<n>@org<k>.sim.invalid`.

- [ ] **Step 1: Write the failing tests** (seed 42, 10 orgs, 150 users):
  - `users.length === 150`
  - every org has exactly one OWNER
  - every org has 1–3 ADMINs
  - every OWNER is `manager` in their home org and every home ADMIN is `lead`
  - scanner share of MEMBER-home users is between 8% and 16%
  - multi-org share is between 8% and 12%
  - no user has two memberships in the same org
  - two calls with the same seed are `toEqual`

- [ ] **Step 2: Run them to make sure they fail.** `npx jest sim/population.spec.ts`

- [ ] **Step 3: Implement `buildPopulation`.** Each sub-step uses its own `rng.fork(...)` stream.

- [ ] **Step 4: Run them to make sure they pass.**

- [ ] **Step 5: Commit.** `feat:(backend/sim): generate org and user population`

---

### Task 6: Session slot scheduler

**Files:**
- Create: `sim/schedule.ts`, `sim/schedule.spec.ts`

**Interfaces:**
- Consumes: `Population`, `Rng`, `CAL`, `zonedToUtc`, `windowDates`, `localDayOfWeek`
- Produces:
  - `interface SessionSlot { slotId: string /* `${userId}:${n}` */; userId: string; start: Date; targetMinutes: number; driveBy: boolean; startOrgId: string; leave: 'logout'|'close_tab' }`
  - `buildSlots(rng: Rng, pop: Population, window: { dates: string[]; tz: string }): SessionSlot[]`, sorted by `start`
- Rules:
  - Per workday sessions by activity: heavy 2–3, regular ~1 (p 0.85), light ~0.35, quiet ~0.5 on the first day and 0 after. Weekend days are scaled by a factor in 0.15–0.20.
  - Start times follow a bimodal local-time mix peaking around 09:30–11:00 and 14:00–16:00, kept inside 07:30–19:30 local.
  - `targetMinutes`:
    - drive-by: 0.3–1
    - manager: lognormal(4, 10)
    - worker: lognormal(9, 15)
    - lead: lognormal(12, 22)
    - scanner: lognormal(10, 18)
  - `driveBy` p 0.15. `leave = 'logout'` p 0.20.
  - `startOrgId` is the home org with p 0.85, otherwise another membership.
  - A user's sessions never overlap: next start ≥ previous start + `targetMinutes` + 10 min.

- [ ] **Step 1: Write the failing tests** (seed 42 population; dates `2026-11-12..14`, tz `Europe/Berlin`):
  - total slots between 300 and 350
  - Saturday slots ÷ mean weekday slots is between 0.12 and 0.23
  - top 20% of users by slot count hold 40–50% of slots
  - drive-by share 0.12–0.18
  - logout share 0.16–0.24
  - every start's local hour (in Berlin) is in [7, 20)
  - for every user, slots don't overlap
  - same seed gives deep-equal output

- [ ] **Step 2: Run them to make sure they fail.** `npx jest sim/schedule.spec.ts`

- [ ] **Step 3: Implement `buildSlots`.** Tune the per-activity rates until the tests pass. Don't loosen the test ranges; they come from the spec.

- [ ] **Step 4: Run them to make sure they pass.**

- [ ] **Step 5: Commit.** `feat:(backend/sim): schedule session slots per user`

---

### Task 7: AI schemas, permissions and plan validation

**Files:**
- Create: `sim/permissions.ts`, `sim/ai/schemas.ts`, `sim/ai/schemas.spec.ts`, `sim/ai/validate-plan.ts`, `sim/ai/validate-plan.spec.ts`

**Interfaces:**
- Produces:
  - `WorldSchema = z.strictObject({ orgId: z.string(), theme: z.string(), projects: z.array(z.strictObject({ key: z.string(), name: z.string(), description: z.string(), state: z.enum(['busy','stale','behind']), tasks: z.array(z.strictObject({ key: z.string(), title: z.string(), description: z.string(), status: z.enum(['TODO','IN_PROGRESS','DONE']), priority: z.enum(['LOW','MEDIUM','HIGH','URGENT']), assigneeUserId: z.string().nullable() })) })), focus: z.array(z.strictObject({ userId: z.string(), projectKeys: z.array(z.string()) })) })`
    - The AI uses its own `key`s for projects and tasks. UUIDs are assigned in code (Task 9).
  - `StepSchema`: a `z.discriminatedUnion('step', [...])` over the spec §8 vocabulary. Argument names:
    - `projectKey`, `taskRef` (task key or `new:<n>`), `pages: number[]`, `intensity: 'light'|'heavy'`, `orgId`, `minutes`, `route`, `how: 'logout'|'close_tab'`
    - `create_task` has a `ref: string` (`new:<n>`)
  - `UserPlanSchema = z.strictObject({ userId: z.string(), sessions: z.array(z.strictObject({ slotId: z.string(), goal: z.string(), steps: z.array(StepSchema) })) })`
  - `type World = z.infer<typeof WorldSchema>`, `type UserPlan = z.infer<typeof UserPlanSchema>`, `type Step = z.infer<typeof StepSchema>`
  - `toApiSchema(s: z.ZodType): object`: `z.toJSONSchema(s)` with the `$schema` key removed
  - `ROLE_STEPS`: steps limited to OWNER/ADMIN = `create_project`, `update_project`, `delete_project`, `view_invitations`, `invite`, `cancel_invitation`. This mirrors `frontend/project-hub/src/permissions.ts`.
  - `validatePlan(plan: UserPlan, ctx: { user: SimUser; worlds: Map<string /*orgId*/, World>; slots: SessionSlot[] }): { plan: UserPlan; dropped: { slotId: string; index: number; reason: string }[] }`
- Validation walks each session in order, tracking the active org (starting at `slot.startOrgId`), deleted tasks and the `new:<n>` refs created so far, across sessions. It drops:
  - unknown or other-org project/task refs
  - refs to deleted tasks
  - `new:<n>` used before its `create_task`
  - role-limited steps in an org where the user is MEMBER
  - `switch_org` to a non-member org
  - any `leave` that isn't last

  If the last step isn't a `leave`, it appends `leave(how: slot.leave)`. If `leave.how` disagrees with `slot.leave`, it is overwritten with `slot.leave`, because code owns the logout share. Sessions whose `slotId` isn't in `ctx.slots` are dropped, and missing slots get `[scan_dashboard light, leave]`.

- [ ] **Step 1: Write the failing tests**
  - `schemas.spec.ts`: walking `toApiSchema(WorldSchema)` and `toApiSchema(UserPlanSchema)`, every `type:'object'` node has `additionalProperties === false`, and no node has `minimum`, `maximum`, `minLength` or `maxLength`.
  - `validate-plan.spec.ts`, one test per rule above, plus:
    - Review Focus 4: delete then update the same task drops the update. `switch_org` to org B, then a project key of org A, drops the step.
    - A valid plan comes through unchanged with `dropped: []`.

- [ ] **Step 2: Run them to make sure they fail.** `npx jest sim/ai`

- [ ] **Step 3: Implement the three modules.**

- [ ] **Step 4: Run them to make sure they pass.**

- [ ] **Step 5: Commit.** `feat:(backend/sim): define AI output schemas and plan validation`

---

### Task 8: Prompts, batch runner and AI stages

**Files:**
- Create: `sim/ai/prompts.ts`, `sim/ai/batch.ts`, `sim/ai/generate-ai.ts`, `sim/ai/generate-ai.spec.ts`

**Interfaces:**
- Consumes: the schemas, `validatePlan`, `Population`, `SessionSlot[]`, `runPaths`
- Produces:
  - `interface BatchItem { customId: string; system: Anthropic.TextBlockParam[]; user: Anthropic.TextBlockParam[]; schema: object; maxTokens: number }`. For plan items, `user[0]` is the org-world JSON block with `cache_control: {type:'ephemeral'}` (the per-org cache breakpoint), and `user[1]` is the user-specific text.
  - `type DroppedStep = { userId: string; slotId: string; index: number; reason: string }`
  - `type UsageTotals = { input: number; output: number; cacheRead: number; cacheWrite: number }`
  - `type BatchOutcome = { customId: string; ok: true; json: unknown; usage: Anthropic.Usage } | { customId: string; ok: false; reason: 'errored'|'expired'|'canceled'|'refusal'|'max_tokens'|'invalid_json' }`
  - `interface BatchClient { run(items: BatchItem[]): Promise<BatchOutcome[]> }`
  - `class AnthropicBatchClient implements BatchClient`. Uses `client.messages.batches.create({ requests: [{ custom_id, params: { model: 'claude-sonnet-5-5', max_tokens, system, messages: [{role:'user', content: user}], output_config: { effort: 'high', format: { type: 'json_schema', schema } } } }] })`, then polls `batches.retrieve(id)` every 30 s until `processing_status === 'ended'`, then iterates `batches.results(id)`. It checks `stop_reason` before parsing the first text block, and keys results by `custom_id`, never by position.
  - `buildSystemBlocks(): Anthropic.TextBlockParam[]`. Static text only: an app map of routes, hover targets and what each step does, the step vocabulary, the persona catalog with each persona's typical session, and the rules. Last block has `cache_control: {type:'ephemeral'}`. No dates, ids or randomness.
  - `worldPrompt(org, members): Anthropic.TextBlockParam[]`. `planPrompt(user, worlds, slots): Anthropic.TextBlockParam[]`. The home-org world block comes first (with the cache breakpoint), so plans for users in the same org share a cacheable prefix.
  - `generateWorlds(client: BatchClient, pop: Population, paths, opts: { replan: boolean }): Promise<Map<string, World>>`
  - `generatePlans(client: BatchClient, pop, worlds, slots, paths, opts): Promise<{ plans: Map<string, UserPlan>; dropped: DroppedStep[]; fallbacks: string[]; usage: UsageTotals }>`
  - `estimateCostUsd(u: UsageTotals): number`. Batch rates for `claude-sonnet-5-5`: input $1.00/MTok, output $5.00/MTok, cache read $0.05/MTok, cache write ×1.25 of input. These are 50% of the $2/$10 list price and the $0.10 cache read.
- Rules:
  - If `world/<orgId>.json` or `plans/<userId>.json` exists and `replan` is false, reuse it with no API call.
  - Failed items, and items failing zod or a world-level sanity check (every member referenced in `focus`, at least 4 projects, at least 1 project with more than 20 tasks), are retried once in a second batch.
  - A world that still fails throws, and the run stops.
  - A plan that still fails becomes a fallback plan of drive-by sessions for every slot, and the user id goes in `fallbacks`.

- [ ] **Step 1: Write the failing tests in `generate-ai.spec.ts`** with a `FakeBatchClient` that records items and returns scripted outcomes:
  - The request shape built by `AnthropicBatchClient.toRequest(item)` (a pure exported helper) has model `'claude-sonnet-5-5'`, `output_config.effort 'high'`, `output_config.format.type 'json_schema'`, and `cache_control` on the last system block.
  - Existing plan files cause zero client calls when `replan` is false, and a fresh call when it is true.
  - Review Focus 3: first outcome `errored`, retry succeeds, so the plan is used and no fallback. Both attempts `refusal`, so a fallback plan with one drive-by session per slot, and the user id is in `fallbacks`.
  - A plan step referencing an unknown task ends up in `dropped`.
  - `estimateCostUsd({input:1e6, output:1e6, cacheRead:0, cacheWrite:0})` is `6`.

- [ ] **Step 2: Run them to make sure they fail.** `npx jest sim/ai/generate-ai.spec.ts`

- [ ] **Step 3: Implement the three modules.** Prompt wording is the builder's call within the rules above. Saved files are pretty-printed JSON with sorted keys, so they diff cleanly.

- [ ] **Step 4: Run them to make sure they pass.**

- [ ] **Step 5: Commit.** `feat:(backend/sim): generate org worlds and user plans via batch API`

---

### Task 9: World to app tables

**Files:**
- Create: `sim/world-db.ts`, `sim/world-db.spec.ts`

**Interfaces:**
- Consumes: `Population`, `Map<orgId, World>`, `Rng`
- Produces:
  - `interface WorldRows { organizations; users; memberships; projects; tasks }`, each a `Prisma.<Model>CreateManyInput[]`
  - `interface IdMap { project: Map<string /*orgId:key*/, string /*uuid*/>; task: Map<string, string> }`
  - `worldToRows(pop, worlds, rng): { rows: WorldRows; ids: IdMap }`
    - User `password` is the literal `'!sim-no-login'`. That isn't a bcrypt hash, so nobody can log in.
    - Timestamps are fixed at window start minus 30 days, plus a seeded offset.
  - `writeWorld(prisma, rows): Promise<void>` (single transaction, `createMany`)
  - `writeManifest(paths, { orgIds, userIds, tenantHashes })`
  - `resetFromManifest(prisma, manifest): Promise<void>`. Deletes the listed orgs (cascade) and users, then `NavEvent` rows `where tenantHash in manifest.tenantHashes`.
  - `assertEmptyOrReset(prisma, reset: boolean, manifestPath): Promise<void>`. Throws `'sim database already has data; rerun with --reset'` when any `Organization` exists and `reset` is false.

- [ ] **Step 1: Write the failing tests** (pure):
  - `worldToRows` gives 10 orgs and 150 users.
  - Membership count equals the sum of `memberships` lengths.
  - Every task's `projectId` exists. Every `assigneeId` is null or a member of that project's org.
  - Ids are stable for the same seed.
  - No `password` looks like bcrypt (`/^\$2[aby]\$/`).

- [ ] **Step 2: Run them to make sure they fail.** `npx jest sim/world-db.spec.ts`

- [ ] **Step 3: Implement it.** A world task whose `assigneeUserId` isn't an org member gets `null` and is logged.

- [ ] **Step 4: Run them to make sure they pass.**

- [ ] **Step 5: Commit.** `feat:(backend/sim): map simulated worlds to app tables`

---

### Task 10: World state and cache model

**Files:**
- Create: `sim/engine/world-state.ts`, `sim/engine/world-state.spec.ts`, `sim/engine/cache-model.ts`, `sim/engine/cache-model.spec.ts`

**Interfaces:**
- Produces:
  - `class WorldState`:
    - `constructor(rows: WorldRows)`
    - `tasksOf(projectId)`, ordered as the task list sorts: status asc (TODO, IN_PROGRESS, DONE), priority desc (URGENT…LOW), title asc, id asc
    - `pageOf(taskId): number` = ceil(rank/10)
    - `pageCount(projectId)`
    - `attention(orgId, projectId?): { taskId: string; projectId: string; page: number }[]`: open (TODO/IN_PROGRESS) and HIGH/URGENT, ordered priority desc, status asc, title asc, id asc, first 6
    - `apply(action, args)` for task create/update/delete (update cycles status or priority with the seeded rng), project create/update/delete, attachments (metadata only)
    - `changes(): { tasks: …; attachments: … }` for writing back
  - `type PageRoute = '/dashboard'|'/projects'|'/projects/:id'|'/members'|'/invitations'|'/settings'|'/profile'`
  - `class CacheModel`:
    - `mount(route: PageRoute, key: { orgId: string; projectId?: string; dashboardFilter?: string }, atMs: number): 'hit'|'stale'|'miss'|null` (`null` for routes without `usePageReady`)
    - `invalidate(action: string, key, atMs)`
    - `switchOrg()` (new org, new keys)
- Model, derived from `frontend/project-hub/src` and the spec §9:
  - **Main key per page:**
    - `/dashboard` → `['analytics','workload',org,filter]`
    - `/projects` → `['projects',org]`
    - `/projects/:id` → `['project',id]`
    - `/members` → `['members',org]`
    - `/invitations` → `['invitations',org]`
  - **Keys each page observes while mounted:**
    - Dashboard: projects, workload, attention
    - Projects: projects
    - Project page: project, tasks page
  - **State on mount:**
    - `miss` if the key was never loaded or has been unobserved for more than 300,000 ms
    - `stale` if it is invalidated, or still observed by the page being left at the moment of mount (because the new page renders before the old one unmounts)
    - otherwise `hit`
  - After mount the key is loaded, fresh and observed.
  - **Invalidations, matching the mutation `onSuccess` handlers:**
    - `task_create`/`task_update`/`task_delete` → `['tasks',projectId]` prefix, `['analytics']` prefix
    - `project_update` → `['project',id]`, `['projects']` prefix
    - `project_create` → `['projects',org]`
    - `project_delete` → remove `['project',id]` and `['tasks',id]`; invalidate `['projects']` and `['analytics']`
    - `invitation_create`/`invitation_cancel` → `['invitations']` prefix
    - attachments → none of the page keys
  - Invalidating a key that is currently observed refetches it, so it stays fresh.

- [ ] **Step 1: Write the failing tests**
  - `world-state.spec.ts`:
    - ordering and `pageOf` on a fixture of 23 tasks give pages 1–3
    - `attention` excludes DONE and LOW/MEDIUM and caps at 6
    - after `apply('task_update')` makes a task DONE, it leaves `attention`
  - `cache-model.spec.ts`:
    - first `/projects` mount is `miss`
    - Dashboard → Projects is `stale`
    - Projects → project → Projects within 5 min is `hit`
    - Dashboard unobserved 6 min, then mount, is `miss`
    - Dashboard → project → `task_create` → Dashboard is `stale`
    - `/settings` gives `null`
  - **Replay test**, skipped with a visible `console.warn` if the snapshot file is missing: replay both real sessions' `route_change`, `page_ready` and `action` rows through `CacheModel`. Assert that at least 90% of the 36 real `page_ready` rows match their recorded `cacheState`, and print each mismatch.

- [ ] **Step 2: Run them to make sure they fail.** `npx jest sim/engine`

- [ ] **Step 3: Implement both modules.**

- [ ] **Step 4: Run them to make sure they pass.** If the replay match rate is under 90%, re-check the key and observer list against the page code. If it's still under, report the mismatches back to the user rather than weakening the threshold.

- [ ] **Step 5: Commit.** `feat:(backend/sim): model world state and query cache states`

---

### Task 11: Session engine

**Files:**
- Create: `sim/engine/hover.ts`, `sim/engine/session.ts`, `sim/engine/session.spec.ts`

**Interfaces:**
- Consumes: `WorldState`, `CacheModel`, `IdMap` (Task 9), `Rng`, `CAL`, `SessionSlot`, plan session `steps: Step[]`, `SimUser`
- Produces:
  - `interface SimEvent { orgId: string; event: TelemetryEventDto /* clientTs ISO, entityId raw uuid */ }`
  - `interface SimSession { sessionId: string; userId: string; slot: SessionSlot; events: SimEvent[]; leave: 'logout'|'close_tab' }`
  - `hoverTargets(route: PageRoute, world: WorldState, view: { orgId; projectId?; dashboardFilter? }): HoverTarget[]` where `HoverTarget = { to: string; toRoute: PageRoute; entity?: { entityType:'project'|'task'; entityId: string; page?: number } }`
    - nav links: all static routes, plus `/invitations` only for OWNER/ADMIN in the active org
    - `/projects` rows: project entity, no page
    - `/dashboard` attention rows: task entity plus page
    - `/dashboard` status cards: filtered → project entity plus page; unfiltered → `/projects`, no entity
    - `/dashboard` donut: filtered → project entity, no page
  - `class HoverTracker { hover(target: HoverTarget, currentRoute: PageRoute, atMs: number): TelemetryEventDto | null }`. Applies "never the current route", and a 2,000 ms cooldown keyed by `to`. Each emitted hover's timestamp is `atMs + 150`.
  - `simulateSession(input: { slot: SessionSlot; steps: Step[]; user: SimUser; world: WorldState; ids: IdMap; rng: Rng }): SimSession`. `WorldState` persists across a user's sessions (and across users, in slot start order) so that later sessions see earlier changes.
- Rules (spec §9; values from `CAL`):
  - A new `sessionId` (`rng.uuid()`). `session_start` at the first event. The first `route_change` is `/dashboard` with no `fromRoute`/`dwellMs`.
  - Every navigation:
    - 0–N scan hovers, N from `hoversPerNav` scaled by intensity and persona
    - a hover on the click target `hoverLagMs` before
    - `route_change` with `dwellMs` = time since the previous `route_change`
    - `entity_open(project)` on `/projects/:id`
    - `page_ready` with `CacheModel.mount`, plus latency from `CAL.latencyMs[state]` (skipped when `mount` gives `null`)
  - A step that needs a different page navigates there first: a Dashboard attention click when the task is in `attention`, otherwise nav → `/projects` → row. `open_task` arriving from an attention click emits `entity_open(task)` straight after the project open.
  - Step gaps come from `gapMs`, `browse_tasks` gaps from `pageChangeGapMs`, and `idle(m)` adds m minutes. Steps are scaled so total length is roughly `slot.targetMinutes`. Each step's `entityId` refs resolve through `IdMap` and `new:<n>` resolves to the uuid created at `create_task`.
  - Actions apply to `WorldState` and invalidate `CacheModel`, and their event fields match spec §9:
    - `attachment_upload`: `latencyMs` 200–400, `bytes` lognormal(3000, 9000)
    - `invitation_create` / `invitation_cancel`: no entity
  - `switch_org` emits nothing itself. Later events carry the new `orgId` and the cache resets. The route stays the same and a `route_change` to `/dashboard` follows.
  - `leave('logout')` emits `session_end`. `close_tab` emits nothing more.
  - Drive-by slots (`slot.driveBy`) ignore `steps`: Dashboard, 1–4 hovers, under 60 s, `close_tab`.

- [ ] **Step 1: Write the failing tests in `session.spec.ts`**

Use a small fixture world: 1 org, 2 projects, 23 tasks, 3 of them HIGH/URGENT. Use fixed plans: worker (open project, browse `[2,3,2]`, open task, update, leave logout), lead (scan heavy, create task, upload to `new:1`, invite, close_tab), and one with `switch_org`. Assert:
- `clientTs` never decreases.
- `session_start` is first. `session_end` appears only for logout.
- Every `page_ready` comes right after a `route_change` to the same `toRoute` (with entity_open in between allowed).
- Each `dwellMs` equals the gap between consecutive `route_change`s.
- No `link_hover.toRoute` equals the current route.
- No two hovers to the same `to` within 2,000 ms.
- Every `route_change` except the first has a hover to its target 100–1,500 ms before.
- `page_change` appears only while on `/projects/:id`.
- The MEMBER plan contains no `invitation_create`.
- After `switch_org`, the events' `orgId` changes.
- The upload event has `latencyMs` and `bytes`. The invite has no entity.
- A drive-by slot gives a session under 60 s with no `session_end`.
- Every event passes `buildNavEventRow` (from Task 1) with `now` = the event time + 5 s.

- [ ] **Step 2: Run them to make sure they fail.** `npx jest sim/engine/session.spec.ts`

- [ ] **Step 3: Implement `hover.ts` and `session.ts`.**

- [ ] **Step 4: Run them to make sure they pass.**

- [ ] **Step 5: Commit.** `feat:(backend/sim): expand plans into frontend-faithful telemetry events`

---

### Task 12: Rows, flush timing and insert

**Files:**
- Create: `sim/generate.ts`, `sim/generate.spec.ts`

**Interfaces:**
- Consumes: `SimSession[]`, `buildNavEventRow`, `hashId`, `Population` (for roles per org), `Rng`, `createSimPrisma`, `assertEmptyOrReset`, `WorldState.changes()`
- Produces:
  - `flushTimes(events: SimEvent[], leave, rng): number[]` (createdAt in ms for each event):
    - a timer every 5,000 ms from the first event
    - an immediate flush when 20 events are queued
    - a final flush at the last event for both logout and close_tab
    - plus 15–60 ms server time
  - `sessionsToRows(sessions, pop, salt: string, rng): Prisma.NavEventCreateManyInput[]`
    - ctx per event from its `orgId`: `tenantHash` = `hashId(salt,'tenant',orgId)`, `role` from the membership, `userHash`, `variant 'control'`
    - row = `buildNavEventRow(e, ctx, { now: createdAt, salt })`, then `id: rng.uuid()` and `createdAt: new Date(createdAt)`
    - a `null` row throws, naming the session and event index
  - `insertRows(prisma, rows): Promise<number>` (chunks of 1,000)
  - `writeWorldChanges(prisma, changes)`

- [ ] **Step 1: Write the failing tests**
  - `flushTimes`: 45 events 100 ms apart flush at counts 20 and 40, then at the end. Every `createdAt >= clientTs`. The `createdAt - clientTs` spread is within 0–5,060 ms (Review Focus 5).
  - `sessionsToRows` with salt `'s'.repeat(32)`:
    - row count equals event count
    - `userHash === hashId(salt,'user',userId)`
    - after a `switch_org` the `tenantHash` and `role` change
    - the same inputs and seed give `JSON.stringify`-equal output
  - `assertEmptyOrReset` with a mocked prisma where `organization.count` is 1 and `reset` false rejects with a message containing `--reset` (Review Focus 2).

- [ ] **Step 2: Run them to make sure they fail.** `npx jest sim/generate.spec.ts`

- [ ] **Step 3: Implement it.**

- [ ] **Step 4: Run them to make sure they pass.**

- [ ] **Step 5: Commit.** `feat:(backend/sim): turn simulated sessions into NavEvent rows`

---

### Task 13: Validation report

**Files:**
- Create: `sim/validate/hard-checks.ts`, `sim/validate/hard-checks.spec.ts`, `sim/validate/compare.ts`, `sim/validate/report.ts`

**Interfaces:**
- Consumes: the generated rows (or `StatRow[]` read back from the sim DB), `loadGroundTruth`, `sessionStats`/`pooledStats`/`quantile`, `CAL`, the slots, the AI results (`dropped`, `fallbacks`, `usage`)
- Produces:
  - `hardChecks(rows: StatRow[], ctx: { salt?: string }): { name: string; failures: string[] }[]`. These are the spec §11.1 checks, by name:
    - `rows-valid`
    - `hashes-deterministic`: same `userHash` for every row of a session's user per tenant, and `entityHash` stable per entity across the run
    - `role-permissions`
    - `ready-follows-route`
    - `dwell-equals-gap`
    - `no-hover-to-current`
    - `hover-cooldown`
    - `page-change-on-project`
    - `session-start-first`
  - `compareToReal(sim: SessionStats, real: SessionStats): { metric: string; real: [p10,p50,p90]; sim: [p10,p50,p90]; flag: boolean }[]`. A metric is flagged when the sim p50 falls outside [real p10 / 2, real p90 × 2]. This covers the event mix shares, `gapMs`, `hoverLagMs`, dwell per route, `pageChangeGapMs` and latency per cache state. The transitions table is shown without flagging.
  - `macroChecks(rows, slots, cfg): { metric; target; actual; ok }[]`. Covers:
    - hour-of-day histogram (local tz)
    - weekend/weekday ratio
    - sessions per user (top-20% share)
    - drive-by share
    - `session_end` share
    - persona/role mix
    - totals (sessions 300–350, rows 20k–30k as expectations, not failures)
  - `writeReport(path, sections): void`. Writes markdown with a hard-check summary (pass/fail first), the comparison table, macro table, cache replay match rate (from Task 10), AI calls, dropped steps, fallbacks, and estimated cost.
  - A non-empty `hardChecks` failure list makes the CLI exit with code 1.

- [ ] **Step 1: Write the failing tests in `hard-checks.spec.ts`.** Start from a valid 6-row session. Inject one violation per check (e.g. set a hover `toRoute` to the current route, change one `dwellMs` by +500, add `action:invitation_create` with role MEMBER). Assert that only that check reports a failure.

- [ ] **Step 2: Run them to make sure they fail.** `npx jest sim/validate`

- [ ] **Step 3: Implement the four modules.**

- [ ] **Step 4: Run them to make sure they pass.**

- [ ] **Step 5: Commit.** `feat:(backend/sim): validate simulated logs and write report`

---

### Task 14: CLI and an end-to-end dry run

**Files:**
- Create: `sim/cli.ts`, `sim/cli.spec.ts`
- Modify: `sim/README.md` (usage section)

**Interfaces:**
- Consumes: everything above
- Produces:
  - `npm run sim -- <stage> [--days 3] [--end YYYY-MM-DD] [--seed 42] [--tz <IANA>] [--run <id>] [--reset] [--replan] [--ai anthropic|stub]`, parsed with `node:util` `parseArgs`
  - Stages: `fetch-ground-truth`, `world`, `plan`, `generate`, `validate`, and `all` (world → plan → generate → validate)
  - `config.json` is written to the run folder on first use. A later run with the same `--run` and different `seed`/`days`/`end` refuses.
  - `--ai stub` uses `StubBatchClient`, which deterministically builds a valid world and plan from the prompt context with no network. Use it for the dry run and tests.
  - Fails fast before any batch is submitted if `--ai anthropic` has no credential. Detection: `new Anthropic()` throws, or `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` are unset and `ant auth status` fails.
  - Requires `TELEMETRY_SALT` of at least 32 characters (from `.env`).
  - `runAll(cfg, deps: { client: BatchClient; prisma?: PrismaClient; sink?: (rows) => Promise<void> }): Promise<{ sessions: number; rows: number; reportPath: string; hardFailures: number }>`

- [ ] **Step 1: Write the failing test in `cli.spec.ts`.** `runAll` with `StubBatchClient`, a temp run dir, an in-memory `sink`, seed 42, days 3, end `2026-11-14`, tz `UTC`. Assert:
  - `hardFailures === 0`
  - `sessions` is between 300 and 350
  - `rows` is greater than 10,000 (stub plans are simpler, so the real-run row range isn't asserted here)
  - the report file exists and contains `## Hard checks`
  - a second run with the same inputs gives a deep-equal rows array

- [ ] **Step 2: Run it to make sure it fails.** `npx jest sim/cli.spec.ts`

- [ ] **Step 3: Implement `cli.ts`, `StubBatchClient`, and the README usage.**

- [ ] **Step 4: Run it to make sure it passes, then run the whole sim suite.** `npx jest sim src/telemetry`. Expected: all PASS, and the rest of the suite matches the baseline.

- [ ] **Step 5: Do a stub dry run against the real sim DB.**
```bash
npm run sim -- all --ai stub --run dry-stub --reset
```
Expected:
- exit code 0
- `sim/runs/dry-stub/report.md` with all hard checks passing
- `SELECT count(*) FROM "NavEvent"` in `taskforge_sim` equals the reported row count
- `SELECT count(*) FROM "NavEvent"` in `taskforge` is unchanged from before the run

- [ ] **Step 6: Commit.** `feat:(backend/sim): add sim CLI with stub dry run`

---

### Task 15: The 3-day trial run

**Files:** none in the repo (outputs land in the git-ignored `sim/runs/`). Only `sim/README.md` changes, with a "Trial results" note.

- [ ] **Step 1: Check credentials and cost before spending.** Run `ant auth status` (or check `ANTHROPIC_API_KEY`). Tell the user the expected spend from Task 8's estimate formula (about 160 batch requests) and get their go-ahead before submitting. This step stops for confirmation.

- [ ] **Step 2: Run the trial.**
```bash
npm run sim -- all --ai anthropic --run trial-2026-11-14 --end 2026-11-14 --seed 42 --reset
```
Expected: two batches (worlds, then plans), each ending with `processing_status: ended`. Exit code 0.

- [ ] **Step 3: Check the report.** `sim/runs/trial-2026-11-14/report.md`:
- all hard checks pass
- sessions 300–350 and rows 20k–30k, or the actual numbers explained
- cache replay ≥ 90%
- flagged comparison metrics listed
- fallbacks ≤ 5% of users
- cost recorded

Anything outside these ranges is reported to the user as-is, not tuned away silently.

- [ ] **Step 4: Check it in Metabase.** Add `taskforge_sim` as a data source (README). Open a NavEvent question grouped by `type` and by hour of `clientTs`. Expected: the counts match the report.

- [ ] **Step 5: Check that the run reproduces.** Run Step 2 again without `--replan`. Expected: no batch submitted, and an identical row count and `md5` of the `ORDER BY id` dump:
```bash
docker exec taskforge_postgres psql -U postgres -d taskforge_sim -Atc 'SELECT md5(string_agg(t::text, '"''"' ORDER BY id)) FROM "NavEvent" t'
```
The output must be the same before and after the rerun.

- [ ] **Step 6: Commit the README note**, then hand the report summary to the user. `docs:(backend/sim): record 3-day trial results`
