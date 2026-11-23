# Telemetry Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Needs-attention, sorting, organization and dashboard-selector tracking points, plus `trigger`, `position`, `detail`, `origin` and `schemaVersion` on every `NavEvent`, without weakening privacy.

**Architecture:** One additive Prisma migration. The server validates new fields in `TelemetryService.buildRow` and the DTOs through a pure `sanitizeDetail` function with a per-action key allowlist. The client records a short-lived "pending trigger" that `route_change` consumes, and tracks each new point at its call site.

**Tech Stack:** NestJS 12, Prisma 7 (PostgreSQL), class-validator, Jest 30; React 19, React Router 7, TanStack Query 5 (frontend has no test runner).

**Spec:** `docs/superpowers/specs/2026-11-23-telemetry-extension-design.md`

## Global Constraints

- Privacy: only enums, bounded integers, route patterns and hashed IDs. Never titles, names, emails, search text or raw field values.
- Branch `feat/telemetry-extension`. Do not touch `backend/project-hub/sim` or `nav-event-row.ts` (not on `main`).
- Never run `prisma migrate dev/deploy/reset` or anything that connects to the `taskforge` database. Never commit `.env`. The migration is a file the owner applies.
- The uncommitted change to `frontend/project-hub/src/telemetry/config.ts` belongs to the owner: never stage it.
- `trigger` values: `sidebar`, `dashboard_card`, `attention_row`, `attention_modal`, `project_row`, `table_row`, `pagination`, `browser_history`, `redirect`.
- New actions: `org_create`, `org_update`, `org_delete`, `org_switch`, `sort_change`, `project_filter_change`, `attention_modal_open`, `attention_modal_close`, `attention_modal_page`.
- `detail` keys: `route_change.hiddenMs` (int 0..86400000); `page_ready.result` (`ok|client_error|server_error|network_error`); `session_start.viewport` (`sm|md|lg`), `session_start.connection` (`slow|medium|fast|unknown`); `task_update.field` (`status|priority|assignee|title|description`); `sort_change.sortBy` (`status|priority`), `sort_change.order` (`asc|desc|default`); `project_filter_change.projectSize` (`all|empty|small|medium|large`); `attention_modal_close.pagesViewed` and `attention_modal_page.modalPage` (int 1..100); `prefetch_issued|prefetch_used.outcome` (`used|wasted`).
- Size buckets from task total: `empty` 0, `small` 1-9, `medium` 10-49, `large` 50+. `position` is an integer 1..100.
- `origin` is server-set from `TELEMETRY_ORIGIN` (`real|pilot|synthetic`, default `real`, anything else throws at startup). New rows `schemaVersion = 2`; the migration sets existing rows to `pilot` / `1`.
- Unknown `detail` keys are dropped. A known key with an invalid value rejects the whole event (logged warning).
- Backend and frontend vocabularies are kept in sync by hand (no shared package).
- One logical change per commit, one file per commit; if a file cannot compile without another, commit in dependency order and say so in the message. Messages: `feat(scope): ...`, `refactor(scope): ...`, `docs(scope): ...`, ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stop and report if any test, build or lint step fails.
- Frontend verification is `npm run build` and `npm run lint` only. Do not run the app against the local `taskforge` database.

## Review Focus

1. Old cached client bundles send batches with none of the new fields: they must still be stored, with NULLs. (Task 4 test.)
2. `detail` arrives as an array, string, `null` or a very large object: ignored or sanitized, never crashing, and only allowlisted keys are read. (Task 2 tests.)
3. A stale pending trigger must not land on a later navigation: it expires after 2000 ms and is cleared when taken. (Task 5, checked by review of `trigger.ts`.)
4. A hidden tab at the moment of a route change counts only its hidden time so far, and the accumulator resets. (Task 6.)
5. `org_delete` flush fails or the org is already gone: the delete itself must still proceed, and `flushNow` must never reject. (Task 11.)

---

### Task 1: Migration and schema

**Files:**
- Create: `backend/project-hub/prisma/migrations/20261123120000_add_nav_event_context/migration.sql`
- Modify: `backend/project-hub/prisma/schema.prisma` (model `NavEvent`)
- Modify: `backend/project-hub/.env.example`

**Produces:** `NavEvent` fields `trigger String?`, `position Int?`, `origin String @default("real")`, `schemaVersion Int @default(2)`, `detail Json?`.

- [ ] **Step 1:** Write `migration.sql`: one `ALTER TABLE "NavEvent"` adding the five columns (`origin TEXT NOT NULL DEFAULT 'real'`, `schemaVersion INTEGER NOT NULL DEFAULT 2`, `detail JSONB`, the others nullable), then `UPDATE "NavEvent" SET "origin" = 'pilot', "schemaVersion" = 1;` so rows that exist when it is applied are marked pilot/v1. Commit: `feat(backend/prisma): add context columns to nav events`.
- [ ] **Step 2:** Add the five fields to `NavEvent` in `schema.prisma`, matching the SQL. Run from `backend/project-hub`: `DATABASE_URL=postgresql://x:y@localhost:5432/none npx prisma validate` (Expected: valid) and `npx prisma generate` (no database needed). Commit: `feat(backend/prisma): add context fields to NavEvent model`.
- [ ] **Step 3:** Append `TELEMETRY_ORIGIN=real` to `.env.example`. Commit: `docs(env): document telemetry origin variable`.

### Task 2: Vocabulary and `detail` sanitizer

**Files:**
- Create: `backend/project-hub/src/telemetry/telemetry-vocabulary.ts`
- Create: `backend/project-hub/src/telemetry/detail-schema.ts`
- Test: `backend/project-hub/src/telemetry/detail-schema.spec.ts`

**Produces:**
- `TELEMETRY_TRIGGERS`, `TELEMETRY_ORIGINS` (`as const` arrays), `TELEMETRY_SCHEMA_VERSION = 2`.
- `sanitizeDetail(type: string, action: string | undefined, raw: unknown): { ok: true; detail: Record<string, string | number> | null } | { ok: false }`. The rule set is chosen by `action:<action>` when an action is present, otherwise `type:<type>`.

- [ ] **Step 1:** Write `detail-schema.spec.ts`. Tests: `keeps valid keys for route_change`; `drops unknown keys and returns null when nothing is left`; `rejects a known key with an invalid enum value` (`sort_change`, `order: 'sideways'` returns `{ ok: false }`); `rejects an out-of-range integer` (`pagesViewed: 101`); `returns null detail for non-object input` (array, string, `null`, number); `ignores keys that belong to a different action` (`field` on `sort_change`); `does not iterate unknown keys` (object with 10,000 keys returns quickly with `null`); `accepts the reserved prefetch outcome` (`prefetch_used`, `outcome: 'wasted'`). Use exact values from Global Constraints.
- [ ] **Step 2:** Run `npx jest src/telemetry/detail-schema.spec.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement both files. Approach: a rules map `{ [ruleKey]: { [key]: (v: unknown) => boolean } }`; read only the allowlisted keys from `raw`.
- [ ] **Step 4:** Run the spec. Expected: PASS.
- [ ] **Step 5:** Commit separately, vocabulary first: `feat(backend/telemetry): add trigger, origin and schema version constants`; then `feat(backend/telemetry): validate event detail against per-action key allowlists` (spec file in its own commit: `test(backend/telemetry): cover detail sanitizer`).

### Task 3: DTO

**Files:**
- Modify: `backend/project-hub/src/telemetry/dto/create-telemetry-batch.dto.ts`
- Test: `backend/project-hub/src/telemetry/dto/create-telemetry-batch.dto.spec.ts` (create)

**Consumes:** `TELEMETRY_TRIGGERS` from Task 2.
**Produces:** `TelemetryEventDto` gains `trigger?`, `position?`, `detail?`; `TELEMETRY_ACTIONS` gains the nine new names.

- [ ] **Step 1:** Spec using `plainToInstance` + `validate` on `CreateTelemetryBatchDto`. Tests: `accepts the new action names`; `accepts each trigger and rejects an unknown one`; `rejects position 0 and 101, accepts 1 and 100`; `rejects detail that is not an object`; `still accepts an event with none of the new fields`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** In the DTO add `@IsOptional() @IsIn(TELEMETRY_TRIGGERS) trigger`, `@IsOptional() @IsInt() @Min(1) @Max(100) position`, `@IsOptional() @IsObject() detail`, and extend `TELEMETRY_ACTIONS`.
- [ ] **Step 4:** Run the spec. Expected: PASS.
- [ ] **Step 5:** Commit DTO (`feat(backend/telemetry): accept trigger, position and detail in event DTO`), then the spec (`test(backend/telemetry): cover event DTO validation`).

### Task 4: Service

**Files:**
- Modify: `backend/project-hub/src/telemetry/telemetry.service.ts`
- Modify (replace): `backend/project-hub/src/telemetry/telemetry.service.spec.ts`

**Consumes:** `sanitizeDetail`, `TELEMETRY_ORIGINS`, `TELEMETRY_SCHEMA_VERSION`.
**Produces:** rows with `trigger`, `position`, `detail`, `origin`, `schemaVersion`. `detail` is `Prisma.JsonNull` when absent.

- [ ] **Step 1:** Run `npx jest src/telemetry` first and record the baseline. The existing spec provides only `TelemetryService`, which also needs `PrismaService` and `TELEMETRY_SALT`.
- [ ] **Step 2:** Rewrite the spec with `new TelemetryService(prismaMock)`, `TELEMETRY_SALT = 'x'.repeat(32)` set in `beforeEach`, and `membership.findFirst` / `navEvent.createMany` mocked. Tests, via `recordBatch`: `stores trigger, position and detail`; `sets schemaVersion 2 and origin real by default`; `uses TELEMETRY_ORIGIN when set to pilot`; `throws at construction when TELEMETRY_ORIGIN is invalid`; `drops unknown detail keys`; `drops the event when a detail value is invalid` (others in the batch still stored); `stores events from an old client with null new fields` (Review Focus 1); `rejects a batch for a non-member org` (existing behavior).
- [ ] **Step 3:** Run it. Expected: FAIL.
- [ ] **Step 4:** Implement: read and validate `TELEMETRY_ORIGIN` in the constructor (fail fast like the salt), add `origin` to `BatchContext`, extend `buildRow`.
- [ ] **Step 5:** Run `npx jest src/telemetry && npm run lint`. Expected: PASS.
- [ ] **Step 6:** Commit service (`feat(backend/telemetry): store trigger, position, detail, origin and schema version`), then spec (`test(backend/telemetry): cover telemetry service row building`).

### Task 5: Frontend types and helpers

**Files (all create, under `frontend/project-hub/src/telemetry/`):** `types.ts`, `classify.ts`, `environment.ts`, `trigger.ts`

**Produces:**
- `types.ts`: `TelemetryTrigger`, `TelemetryAction`, `SizeBucket`, `TaskField`, `PageResult`, `TelemetryDetail` (every key from Global Constraints, all optional).
- `classify.ts`: `sizeBucket(total: number): Exclude<SizeBucket, 'all'>`; `taskFieldOf(data: Partial<CreateTaskProps>): TaskField | undefined` (maps `assigneeId` to `assignee`); `classifyError(error: unknown): Exclude<PageResult, 'ok'>` (axios 4xx, 5xx, no response means `network_error`).
- `environment.ts`: `readEnvironment(): { viewport: 'sm' | 'md' | 'lg'; connection: 'slow' | 'medium' | 'fast' | 'unknown' }`. Viewport breakpoints 640 and 1024 px. Connection from `navigator.connection?.effectiveType`: `slow-2g|2g` slow, `3g` medium, `4g` fast, otherwise unknown.
- `trigger.ts`: `PENDING_TRIGGER_TTL_MS = 2000`, `setPendingTrigger(t)`, `peekPendingTrigger(): TelemetryTrigger | null` (null once older than the TTL), `takePendingTrigger()` (peek then clear), `setLastNavTrigger(t | null)`, `getLastNavTrigger()`.

- [ ] **Step 1:** Create the four files. `import type` for types (the frontend uses `verbatimModuleSyntax`; no enums).
- [ ] **Step 2:** Run `cd frontend/project-hub && npm run build && npm run lint`. Expected: no errors.
- [ ] **Step 3:** Commit one file each, in order `types.ts`, `classify.ts`, `environment.ts`, `trigger.ts` (`feat(frontend/telemetry): ...`).

### Task 6: Tracker and hover

**Files:** Modify `frontend/project-hub/src/telemetry/tracker.ts`, `frontend/project-hub/src/telemetry/hover.ts`

**Consumes:** Task 5 types and helpers.
**Produces:**
- `TelemetryEvent` gains `trigger?: TelemetryTrigger`, `position?: number`, `detail?: TelemetryDetail`, and `action?: TelemetryAction`.
- `takeHiddenMs(): number`: hidden-tab time since the last call, then reset. A tab that is hidden right now counts its partial interval (Review Focus 4).
- `flushNow(): Promise<void>`: sends everything queued and resolves when the sends settle. Never rejects.
- `session_start` events carry `detail: readEnvironment()`.
- `hoverIntent(to: string, entity?: Entity, meta?: { trigger?: TelemetryTrigger; position?: number })`; the emitted `link_hover` includes both.

- [ ] **Step 1:** Implement both files.
- [ ] **Step 2:** `npm run build && npm run lint` in `frontend/project-hub`. Expected: clean.
- [ ] **Step 3:** Commit `tracker.ts` (`feat(frontend/telemetry): add hidden time, flushNow and session environment`), then `hover.ts` (`feat(frontend/telemetry): pass trigger and position on hover events`).

### Task 7: Navigation trigger, hidden time and page result

**Files:** Modify `telemetry/useNavigationTracking.ts`, `telemetry/usePageReady.ts`, `pages/Dashboard.tsx`, `pages/Projects.tsx`, `pages/ProjectDetails.tsx`, `pages/Members.tsx`, `pages/Invitations.tsx`

**Produces:** `route_change` carries `trigger` and `detail.hiddenMs`; `usePageReady(route, queryKey, isReady, error?: unknown)` reports once when ready or errored, with `detail.result`.

- [ ] **Step 1:** In `useNavigationTracking`: trigger is `takePendingTrigger()`, else `browser_history` when `useNavigationType() === 'POP'` and it is not the first route of the session, else none. Always call `setLastNavTrigger` with the result. Attach `detail: { hiddenMs: takeHiddenMs() }` only when `last.current` exists.
- [ ] **Step 2:** In `usePageReady`, run the report effect when `isReady || error`; `result` is `ok` or `classifyError(error)`.
- [ ] **Step 3:** `npm run build && npm run lint`. Commit the two hooks first (`feat(frontend/telemetry): ...`), then each page passing its query's `error` as the new argument, one commit per page (`feat(frontend/<page>): report query errors in page ready`).

### Task 8: Trigger call sites

**Files:** Modify `layouts/AppLayout.tsx`, `pages/Projects.tsx`, `pages/Dashboard.tsx`, `pages/ProjectDetails.tsx`

- [ ] **Step 1:** Before each navigation call `setPendingTrigger`: sidebar links and Profile `onClick` (`sidebar`); project row click (`project_row`); dashboard donut and status cards (`dashboard_card`); the org-change `navigate('/projects')` in `ProjectDetails` (`redirect`). Pass the same value as `hoverIntent`'s `meta.trigger` where the element already uses it.
- [ ] **Step 2:** In `ProjectDetails`, `goToPage` adds `trigger: 'pagination'` and `selectTask` adds `trigger: 'table_row'` to their existing `track` calls.
- [ ] **Step 3:** `npm run build && npm run lint`. One commit per file, in the order listed.

### Task 9: Needs attention

**Files:** Modify `components/dashboard/AttentionList.tsx`, `components/dashboard/AttentionModal.tsx`, `pages/Dashboard.tsx`, `pages/ProjectDetails.tsx`

**Produces:** `AttentionRow` props `{ task; showProject; trigger: 'attention_row' | 'attention_modal'; position: number }`.

- [ ] **Step 1:** `AttentionRow` calls `hoverIntent(to, entity, { trigger, position })` and `setPendingTrigger(trigger)` before `navigate`. `AttentionList` passes `position = index + 1`; the modal passes the index within its current page.
- [ ] **Step 2:** `Dashboard` tracks `{ type: 'action', action: 'attention_modal_open' }` in `onShowAll`.
- [ ] **Step 3:** `AttentionModal` tracks `attention_modal_page` with `detail.modalPage` on Previous/Next, and `attention_modal_close` with `dwellMs` (clamped to 86,400,000) and `detail.pagesViewed` (distinct pages seen) when closing.
- [ ] **Step 4:** `ProjectDetails` emits `entity_open` for a task that arrives via `?task=`: an effect on `selectedTask?.id`, skipped when a ref shows `selectTask` already tracked it, with `trigger: peekPendingTrigger() ?? getLastNavTrigger() ?? undefined`. `selectTask` sets that ref. Reset the ref when the selection clears.
- [ ] **Step 5:** `npm run build && npm run lint`. Commit order: `AttentionList.tsx`, `AttentionModal.tsx`, `Dashboard.tsx`, `ProjectDetails.tsx` (the first two do not compile without the row props; say so in the message).

### Task 10: Sorting and task field

**Files:** Modify `pages/ProjectDetails.tsx`

- [ ] **Step 1:** In `toggleSort`, after computing the next state, track `{ type: 'action', action: 'sort_change', detail: { sortBy: column, order } }` where `order` is `asc`, `desc`, or `default` for the third click. Only the click handler tracks, never URL state.
- [ ] **Step 2:** In the `updateTaskMutation` success handler, add `detail: { field: taskFieldOf(variables.data) }` to the existing `task_update` event (omit `detail` when `field` is undefined).
- [ ] **Step 3:** `npm run build && npm run lint`. Commit as two commits (`feat(frontend/tasks): track sort changes`, `feat(frontend/tasks): record the edited field on task updates`).

### Task 11: Organizations

**Files:** Modify `layouts/AppLayout.tsx`, `pages/Settings.tsx`

- [ ] **Step 1:** `AppLayout`: on create success, `setTelemetryOrg(newOrg.id)` then track `org_create`. In the selector `onChange`, `setTelemetryOrg(id)` then track `org_switch` (attributed to the new org).
- [ ] **Step 2:** `Settings`: track `org_update` on update success. For delete, track `org_delete` then `await flushNow()` before calling `deleteOrganizationMutation.mutate` (Review Focus 5: the delete proceeds even if telemetry fails).
- [ ] **Step 3:** `npm run build && npm run lint`. One commit per file.

### Task 12: Dashboard project selector

**Files:** Modify `pages/Dashboard.tsx`

- [ ] **Step 1:** `selectProject` stores the chosen id in a ref. An effect fires when `metrics` for the current query key loads: track `project_filter_change` with `detail.projectSize = projectId ? sizeBucket(total) : 'all'` and, when a project is chosen, `entityType: 'project'`, `entityId`. Clear the ref after tracking. Initial page load and saved selections never track.
- [ ] **Step 2:** `npm run build && npm run lint`. Commit: `feat(frontend/dashboard): track project selector changes`.

### Task 13: Documentation

**Files:** Create `docs/telemetry.md`, `docs/telemetry-views.sql`; modify `CLAUDE.md`

- [ ] **Step 1:** `docs/telemetry.md`: every action, trigger and `detail` key with meaning and values, the privacy rules, the `origin`/`schemaVersion` rules (analysis filters on `origin = 'real' AND schemaVersion = 2`), and the known blemish that `org_delete` records intent. Commit `docs(telemetry): document actions, triggers and detail keys`.
- [ ] **Step 2:** `docs/telemetry-views.sql`: a `CREATE OR REPLACE VIEW` over `"NavEvent"` that flattens `detail` into columns and maps codes to readable labels. Header comment says it is applied manually in Metabase's database, not by a migration. Commit `docs(telemetry): add readable Metabase view`.
- [ ] **Step 3:** Update the Telemetry section of `CLAUDE.md` (new fields, vocabulary location, `TELEMETRY_ORIGIN`). If the owner has committed the `TELEMETRY_ENABLED` fix by then, replace the "known bug" line; otherwise leave it. Commit `docs: update CLAUDE.md for telemetry extension`.

### Task 14: Sim follow-up and summary

**Files:** Create `docs/telemetry-sim-followup.md`

- [ ] **Step 1:** List what `feat/sim-telemetry` needs after the merge: `nav-event-row.ts` must produce the five new fields and call `sanitizeDetail`; set `origin = 'synthetic'` and `schemaVersion = 2`; the simulator should emit `trigger`, `position` and the new actions, or leave them NULL on purpose; sim tests and the report must filter on `origin`. List likely conflicts: `TelemetryService.buildRow`, `create-telemetry-batch.dto.ts`, `tracker.ts`. Commit `docs(telemetry): list follow-up work for the sim merge`.
- [ ] **Step 2:** Report to the owner: what was added, the sim follow-up, and decisions still open (apply the migration, runtime check against a throwaway database, the `config.ts` change).
