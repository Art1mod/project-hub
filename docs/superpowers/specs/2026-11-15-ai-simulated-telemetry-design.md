# AI-simulated users for telemetry logs: design

Date: 2026-11-15 · Status: approved in conversation, pending written review · Scope: **3-day trial only**

## 1. Intent

Project Hub records navigation telemetry as `NavEvent` rows (see `backend/project-hub/src/telemetry/`). Only two real sessions exist so far. The goal is a larger, realistic volume of these rows for **analytics dashboards in Metabase**, produced by AI-simulated users whose behavior is grounded in the real sessions.

Because the logs are for dashboards, what must be realistic is the **aggregate shape**: counts and distributions per user, org and role; time-of-day and weekday rhythm; funnels (Dashboard/Projects → project → task → action); returning users; page-load and cache-state charts. Event order within a session must be believable and follow the frontend's rules, but it does not need to be precise enough to train a next-page model.

## 2. Goals, non-goals, anti-goals

**Goals**
- A 3-day trial run: about 150 simulated users in 10 orgs, in a separate database Metabase can read. The population is fixed. Session and row counts are *outputs* of the behavior model, expected around 300–350 sessions and 20–30k `NavEvent` rows (see §10), and reported rather than forced.
- Rows indistinguishable in format from what the real backend writes.
- Reproducible: the same seed plus the saved AI outputs gives byte-identical rows.
- A validation report showing how the simulated data compares with the real sessions and with the stated targets.

**Non-goals (for this trial)**
- 7-day or longer runs. The day count is a setting, but only 3 days are in scope now.
- Live generation through the API.
- The browser cross-check (Playwright running plans through the real app). Deferred until after the trial.
- `prefetch` variant, `prefetch_issued` / `prefetch_used` events. Nothing emits them today, so the simulation doesn't either. Every row is `variant = 'control'`.
- Fixing frontend bugs found along the way (see §11).

**Anti-goals: failure even if it "works"**
- Any change to the `NavEvent` schema or to the stored log format.
- Simulated rows landing in the real `taskforge` database.
- Rows the real server would have rejected or written differently: wrong hashing, un-normalized routes, missing required fields.
- Distributions that come from the AI model's guesses rather than from code. Timing, volume and rhythm must be controlled and checkable.
- Every simulated session looking like the two real sessions (e.g. paging sweeps in every session).

## 3. Constraints found in the code

- **The ingestion API rejects old events.** `TelemetryService.buildRow` drops events with `clientTs` older than 24 h or more than 5 min in the future. A 3-day backfill therefore can't go through the HTTP endpoint and must write to the database directly.
- **Rate limit.** 30 batches/min per user (`UserThrottlerGuard`), another reason not to use the API.
- **Hashing.** `userHash`, `tenantHash` and `entityHash` are `HMAC-SHA256(TELEMETRY_SALT, "<domain>:<id>")`, sliced to 32 hex chars. Domains: `user`, `tenant`, `entity:<entityType>`. `role` comes from the user's `Membership` in that org.
- **Route normalization.** Only `/dashboard`, `/projects`, `/projects/:id`, `/members`, `/invitations`, `/settings`, `/profile` are stored (`route-normalizer.ts`).
- **Server row rules.** `route_change`, `link_hover` and `page_ready` need `toRoute`. `entityType` and `entityId` come together or not at all. `entity_open` needs an entity, `page_change` needs `page`, `page_ready` needs `latencyMs`, and `action` needs `action`.
- **Role permissions** (`frontend/.../permissions.ts`). Only OWNER/ADMIN can manage projects, see `/invitations` and remove members. Only OWNER can delete the org.
- **Task table page size** is 10 (`ProjectDetails.tsx`).

## 4. Ground truth: the real sessions

Source: Metabase public questions on the local instance (`docker-compose.yml`, port 3001):
- `http://localhost:3001/public/question/c4d7a16b-620f-47fe-a146-23efdbb2a8b4` (MEMBER session)
- `http://localhost:3001/public/question/ec317d14-f122-4b44-a245-e51a49e06701` (ADMIN session)

Raw rows come from `GET /api/public/card/<uuid>/query/json`: two sessions, 318 events, same main tenant, recorded 2026-11-04.

**Access rule:** the real data is read only through these Metabase public endpoints, never by querying the `taskforge` database. A `sim fetch-ground-truth` step snapshots the raw rows once to `backend/project-hub/sim/ground-truth/real-sessions.json` (git-ignored). Validation always reads that snapshot, so reports stay reproducible and don't depend on live data.

| Session | Length | Events | Mix |
|---|---|---|---|
| MEMBER | 14 min | 144 | 54 link_hover, 44 page_change, 14 route_change, 14 page_ready, 10 entity_open, 6 action, start + end |
| ADMIN (switches orgs) | 20 min | 174 | 88 link_hover, 26 page_change, 22 route_change, 22 page_ready, 9 entity_open, 6 action, end only |

Measured distributions (both sessions pooled; median / 90th percentile unless noted):

| Pattern | Value |
|---|---|
| Gap between events | 1.9 s / 14.4 s; 3 idle gaps > 60 s (max 6 min) |
| Hovers before each navigation | 2 / 5, max 24 |
| Hover → navigation lag | 0.41 s / 1.17 s (p10 0.14 s) |
| Time on page (`dwellMs`) | `/projects` 3.9 s / 17 s · `/projects/:id` 57 s / 214 s · `/dashboard` 100 s (range 0.6 s–7.4 min) · `/members` 16–113 s |
| Gap between `page_change` events | 3.6 s / 15 s; sweeps 1→5→1, sometimes 0.2 s per step |
| `page_ready` latency | miss 56 / 214 ms · hit 9 / 31 ms · stale 4 / 8 ms |
| Page-to-page moves | Projects→project 11, project→Projects 8, Dashboard→Projects 6, Projects→Dashboard 4, rest ≤ 2 |
| Actions | task_update 7, task_create 2, attachment_upload 2 (`latencyMs` 239/290, `bytes` 1.3k/6k), invitation_create 1 (stored with no entity) |
| Ingest lag (`createdAt − clientTs`) | 17 ms – 5.05 s (5 s flush interval) |
| Org switching | ADMIN session spans 3 tenants; role is ADMIN in one and MEMBER in the other two |

Interpretation, and the limits of this data:
- Two sessions set the **in-session micro-behavior**. They are far too few to fit transition models or to test statistical significance.
- The repeated 1→5→1 paging sweeps look like app testing. They are kept as one persona's behavior, not the default.
- Both sessions end in logout (`session_end`). Real users mostly close the tab, which emits no `session_end`.

**From general knowledge** (sets the macro shape; these are targets, configurable):
- Sessions fall in local office hours, peaking around 09–11 and 14–16. Weekend volume is about 15–20% of a weekday.
- Activity is skewed but not extreme: the top 20% of users produce about 40–50% of sessions (2–3 per workday). Most users return every 1–3 workdays, about 10% go quiet during the window, and on average there is about 1 session per user per workday.
- About 15% of sessions are short visits under 1 min (Dashboard glance, then close).
- About 20% of sessions end with `session_end` (logout). The rest just stop.
- Settings and Profile are hovered often and opened rarely.

## 5. Approaches considered

| | Approach | Trade-off | Decision |
|---|---|---|---|
| A | An AI model drives a real browser (Playwright), with the app's own telemetry intercepted | Highest fidelity to the frontend code. About one AI call per action (tens of thousands), slow, fragile, hard to reproduce | Rejected as the main path; a few sessions may be used later as a cross-check |
| **B** | **The AI plans intent, a seeded simulator emits events** | About one AI call per user, fast, reproducible. The simulator must mirror the frontend's emission rules | **Chosen by the user** |
| C | Purely statistical (Markov model plus fitted distributions) | Cheapest, but two sessions can't support the fit, there's no variety of intent, and it drops the "AI-simulated users" requirement | Rejected |

## 6. Decisions

Made by the user:
- Purpose: analytics/dashboards.
- Separate database for simulated data.
- Population: medium, 10 orgs and about 150 users.
- Approach B.
- **3-day run only for now.**

Proposed by me and accepted in review of each section:
- Org sizes uneven (a couple large, several small). About 1 OWNER and 1–3 ADMINs per org, the rest MEMBER.
- About 10% of users belong to 2–3 orgs and switch mid-session, with a different role per org.
- Each org gets its own projects and tasks as real rows in the sim database.
- The five personas in §7.
- The code/AI split in §8.
- Simulator rules in §9; storage and command in §10; validation in §11.
- Trial window covers Thu–Sat, ending yesterday (relative to the run date), so it includes one weekend day.

Settled after the written review (my calls; flagged for the user when the spec was handed over):
- **Persona follows role** (§7). Shares in the original table were approximate, and they didn't fit the role mix.
- **Volume:** the population is binding. Session and row counts follow from the behavior model, about 300–350 sessions rather than the earlier rough ~220. The heavy-user skew is softened to "top 20% produce 40–50%".
- **`cacheState` follows the app's real TanStack Query behavior** (§9), not a random hit/stale split.
- **Ground truth** is snapshotted once from the Metabase public endpoints (§4). The real database is never queried.

## 7. Population and personas

Code, from a seeded random generator, fixes the population structure: org sizes, role assignment, multi-org members, and each user's activity level (heavy / regular / light / goes quiet). The AI only adds flavor (§8).

**Persona follows the user's role in their home org (first org).** Shares are approximate and fall out of the role mix (about 10 OWNERs, about 20 ADMINs, about 120 MEMBERs):

| Persona | Assigned to | ≈ Users | Typical session |
|---|---|---|---|
| Manager | every OWNER | ~10 (7%) | Short Dashboard check-ins, Members/Invitations, few edits |
| Lead / triage | every ADMIN | ~20 (13%) | Long Dashboard scanning (many attention and workload hovers), creates and reassigns tasks across projects, occasional invite |
| Browser / scanner | ~12% of MEMBERs | ~15 (10%) | Long `page_change` sweeps through task tables, few actions (this is where the real 1→5→1 pattern goes) |
| Task worker | remaining MEMBERs | ~105 (70%) | Dashboard → project → open and update 1–4 tasks; 5–15 min |

**Drive-by is a session type, not a persona:** about 15% of all sessions, for any user. A Dashboard glance under 1 min, then close the tab.

A multi-org user keeps one persona. In each org, the steps available are limited by the role held there, so a Lead acting in an org where they are MEMBER can't invite. Persona and role must agree with permissions: a MEMBER-role user never gets OWNER/ADMIN-only steps in that org.

Session frequency comes from each user's activity level (heavy / regular / light / goes quiet), not from persona, so the skew target in §4 holds. Persona changes what a session contains and how long it is.

## 8. AI planning layer

**Split of responsibility:** code decides *when and how much*. The AI decides *what and why*.

**Code (seeded) produces each user's session slots for the 3 days:**
- start time and target length, drawn from the targets in §4
- drive-by flag
- which org the session starts in

**AI call 1: org world (once per org, 10 calls).** Input: the org's fixed structure (size, members with roles and personas). Output (structured JSON):
- org theme
- 4–15 projects (name, description, busy/stale/behind)
- tasks per project (title, status, priority, assignee from the org's members; enough tasks that busy projects span several pages of 10)
- each user's focus projects

Written to the sim database as `Organization`, `User`, `Membership`, `Project`, `Task` rows with generated UUIDs.

**AI call 2: user plan (once per user per run, about 150 calls).** Input: org world(s) the user belongs to, the user's persona and role(s), and the session slots. Output (structured JSON): for each slot, a one-line `goal` and an ordered list of steps drawn from a fixed vocabulary:

| Step | Arguments | Notes |
|---|---|---|
| `scan_dashboard` | intensity (light/heavy) | hovers over attention and workload items |
| `filter_dashboard` | project id | Dashboard project select; emits no event itself but changes which hovers are possible |
| `open_projects_list` | – | |
| `open_project` | project id | |
| `browse_tasks` | pages to visit (list) | `page_change` events |
| `open_task` | task id | |
| `update_task` | task id | |
| `create_task` | project id | the new task can be referred to later as `new:<n>` |
| `delete_task` | task id | rare |
| `upload_attachment` | task id | |
| `delete_attachment` | task id | rare |
| `create_project` / `update_project` / `delete_project` | ids | OWNER/ADMIN only |
| `view_members` | – | |
| `view_invitations` / `invite` / `cancel_invitation` | – | OWNER/ADMIN only |
| `hover_nav` | target route | hovers without clicking, e.g. Settings/Profile |
| `open_settings` / `open_profile` | – | rare |
| `switch_org` | org id | user must be a member |
| `idle` | minutes | |
| `leave` | `logout` or `close_tab` | last step |

A whole user's 3 days are planned in one call, so the story carries over between sessions. A task created on Thursday can be updated on Saturday.

**Plan checks:** the JSON schema is valid; every id exists (including `new:<n>` references created earlier in the plan); role permissions hold in the org that is active at that step; `leave` comes last. A step that breaks a rule is dropped and logged. A plan that fails structurally is requested again once, then the user's sessions fall back to drive-by sessions and the fallback is logged.

**API usage:**
- Anthropic TypeScript SDK (`@anthropic-ai/sdk`), model `claude-sonnet-5-5` at `effort: "high"`.
- Structured outputs via `output_config.format` with a JSON schema.
- Message Batches API for both call types (async, 50% cost).
- Prompt caching on the shared system prompt (app map, step vocabulary, persona catalog, rules) and on each org's world block.
- Credentials from the environment (`ANTHROPIC_API_KEY` or an `ant auth login` profile).
- Refusals and errored batch items are handled like a failed plan (retry once, then fallback).

**Estimated cost** for the trial: a few dollars. Measured and written into the report.

**Reproducibility:** all world and plan JSON is saved under the run folder. A rerun reuses them and makes no AI calls unless `--replan` is passed. All randomness in code comes from one seeded generator, so the same seed and saved files give identical rows.

## 9. Simulator: plan → events

The simulator walks each session's steps on a simulated clock and emits `TelemetryEventDto`-shaped events, following the frontend's emission rules exactly:

- **Session:** new `sessionId` (UUID) per session. `session_start` immediately before the first tracked event. `session_end` only when the last step is `leave(logout)`. Org switches keep the same `sessionId`; later events get the new org's `tenantHash` and role.
- **Navigation:** every navigation emits `route_change` (`fromRoute` = previous route, `dwellMs` = time since previous `route_change`; neither on the first one), then `page_ready` for pages that report it (`/dashboard`, `/projects`, `/projects/:id`, `/members`, `/invitations`). `page_ready.cacheState` follows the app's real cache logic, not a random draw. The app uses TanStack Query v5 with defaults (`staleTime` 0, `gcTime` 5 min), and `usePageReady` reads the state of the page's main query key when the page mounts:
  - `miss`: the key has never been loaded in this session, or nothing has used it for more than 5 min (garbage-collected).
  - `stale`: the key is still being used by a mounted component as the page mounts (e.g. Dashboard → Projects, both of which use `['projects', orgId]`, which is why real `stale` loads are the fastest), or an action has marked it out of date (e.g. `task_update` / `task_create` mark tasks and the Dashboard analytics out of date).
  - `hit`: otherwise.

  The simulator keeps a per-session model of query keys: last used, observers, marked out of date. The builder derives the exact query keys and which actions mark which keys out of date from the page code and mutation `onSuccess` handlers. They check the model against the snapshot: every real `cacheState` should be reproduced when that session's navigation is replayed. Latency is sampled from the measured spread for the resulting state. On `/projects/:id` the `entity_open(project)` comes alongside the `route_change`, as in the real rows.
- **Hovers:** only from real hover targets:
  - nav links (no entity)
  - Projects list rows (`project`, no `page`)
  - Dashboard attention items (`task`, with `page` = the page that task is on)
  - Dashboard status cards and donut (`project` with `page` when the dashboard is filtered to a project, else route `/projects` with no entity)

  Never to the current route. A 2 s cooldown per target; hover delay 150 ms. Each click is preceded by a hover on its target 0.1–1.5 s before. Scanning adds extra hovers on other targets, about 2 per navigation (5 at the 90th percentile; heavy scans up to about 25).
- **Task panel:** `open_task` emits `entity_open(task)` unless that task is already open. `browse_tasks` emits `page_change(page, project)`, with gaps from the measured spread, and closes the open task.
- **Actions:** `action` events with the same fields the real rows have:
  - task and project actions carry their entity
  - `attachment_upload` carries `latencyMs` and `bytes`
  - `invitation_create` and `invitation_cancel` carry no entity
- **Timing:** step gaps, dwell and idle come from the measured distributions (fitted, e.g. lognormal), scaled by persona and by the slot's target length. All `clientTs` values are in UTC. Office hours are based on a time-zone setting (default: the machine's time zone).
- **`createdAt`:** the time of the next simulated flush, i.e. `clientTs` plus 0–5 s (flush every 5 s or at 20 queued events).
- **World state:** the simulator applies actions to its in-memory world (status changes, new tasks, attachments), so later hovers, pages and attention items reflect them. It also writes the matching `Task` and `Attachment` changes to the sim database so the app's own tables agree with the logs. Attachments are metadata rows only; no files are stored.

**Shared row-building (backend refactor, behavior-preserving):** the validation, normalization and hashing in `TelemetryService.buildRow` / `hash` move into a pure exported function, e.g. `buildNavEventRow(event, ctx, { now, salt })`, in `src/telemetry/`. `TelemetryService` calls it with the real clock, so its behavior doesn't change. The generator calls it with `now` set to each event's simulated flush time, so the 24 h age check passes for historical events while every other rule stays identical. New unit tests cover the extracted function: each rule, the hash format and domains, and route normalization. The existing `telemetry.service.spec.ts` only checks that the service is defined.

The salt is `TELEMETRY_SALT`, read the same way the backend reads it.

## 10. Storage and running

- **Sim database:** `taskforge_sim`, a second database on the existing `taskforge_postgres` container. Created once, then `prisma migrate deploy` with `DATABASE_URL` pointing at it. Added in Metabase as a separate data source. The real `taskforge` database is never touched. The command refuses to run if its target database URL is the backend's main `DATABASE_URL`.
- **Code location:** `backend/project-hub/sim/`, TypeScript, using the backend's Prisma client and adapter.
- **Command:** one entry point.

  ```
  npm run sim -- --days 3 --end <YYYY-MM-DD> --seed <n> [--run <id>] [--reset] [--replan]
  ```

  Stages: `world → plan → generate → validate`. Each stage can be rerun on its own from the saved files.
- **Run folder:** `backend/project-hub/sim/runs/<runId>/` with `config.json`, `world/*.json`, `plans/*.json`, `report.md`. Git-ignored.
- **Writes:** `createMany` in chunks of about 1,000. `--reset` deletes the rows a previous simulation wrote to the sim database (simulated orgs cascade to memberships, projects, tasks and attachments; `NavEvent` rows by the run's tenant hashes) before writing.
- **Trial size:** 3 days (Thu–Sat), 10 orgs, about 150 users. Expected output: about 300–350 sessions (about 1 per user per workday, Saturday at 15–20%) and 20–30k `NavEvent` rows (about 70–90 events per session on average, since drive-bys and Manager check-ins are short). These are expectations reported in `report.md`, not hard targets.

## 11. Validation

`report.md` per run, in three parts.

1. **Hard checks (the run fails if any break):**
   - every row passes `buildNavEventRow` with no drops
   - hashes are deterministic for the same ids
   - no MEMBER-role row has an OWNER/ADMIN-only action or route
   - `page_ready` always follows a `route_change` to the same route
   - `dwellMs` equals the gap between consecutive `route_change`s
   - no hover targets the current route; the hover cooldown holds
   - `page_change` only happens while on `/projects/:id`
   - `session_start` is first in a session whenever present
2. **Comparison with the real sessions** (read from the `ground-truth/real-sessions.json` snapshot, §4). Also a replay check: replaying each real session's navigation through the cache model must reproduce its recorded `cacheState` values. For each simulated session, the event-type mix, gap quantiles, hover→navigation lag, dwell per route, latency per cache state, and the page-to-page move table. Each is shown next to the real values and flagged when it falls well outside the real range (e.g. more than 2× beyond the real 10th–90th band). With n = 2 real sessions this is a range check, not a significance test.
3. **Overall shape against targets:** hour-of-day histogram, weekday vs weekend ratio, sessions per user, short-visit share, `session_end` share, persona and role mix, and AI cost and calls.

## 12. Left to the builder

- Exact distribution families and parameters fitted to §4, and the persona scaling factors.
- Prompt wording, the exact JSON schemas, and batch polling details.
- Internal module layout under `sim/`, and how stages pass data.
- How to create the sim database (a small script or documented commands) and the Metabase data-source steps (documented).
- Report formatting.

## 13. Observations outside scope

- `frontend/.../telemetry/config.ts`: `TELEMETRY_ENABLED = VITE_TELEMETRY_ENABLED !== 'true'` is inverted. Setting the variable to `true` turns telemetry off.
- `invitation_create` sends `entityId` without `entityType`. The server rule would drop such an event, yet the real row is stored without an entity, so the id is probably undefined at runtime. The simulation copies the stored shape.
- The real ADMIN session has no `session_start`, probably because the tab's `sessionStorage` already had the started flag.
