# After merging `feat/sim-telemetry`: follow-up for the telemetry extension

`feat/telemetry-extension` (this work) and `feat/sim-telemetry` were both cut from `main` and have not seen each other. This is what to do when they meet.

## Files that will conflict

Compared against the sim branch, only one source file changed on both sides:

- **`backend/project-hub/src/telemetry/telemetry.service.ts`**: the sim branch moved row building out of `buildRow` into `nav-event-row.ts` (`buildNavEventRow`, `hashId`). This branch added `origin`, `trigger`, `position`, `detail` and `schemaVersion` inside `buildRow`. Resolve by keeping the sim branch's structure and moving this branch's additions into `buildNavEventRow` (below).

These do not conflict as text but must be checked by hand:

- `backend/project-hub/tsconfig.json`: both branches add `"rootDir": "./"` (identical line, merges cleanly).
- `backend/project-hub/src/telemetry/telemetry.service.spec.ts`: this branch rewrote it around `buildRow` through `recordBatch`. After the merge those row rules belong to `nav-event-row.spec.ts`; keep only the service-level tests here (`origin` validation, membership check).
- `frontend/project-hub/src/telemetry/tracker.ts` and the event DTO: the sim branch did not change them, but its simulator copies their rules (below).

## Changes needed in `nav-event-row.ts`

1. `NavEventRowContext` gains `origin: 'real' | 'pilot' | 'synthetic'`. `buildNavEventRow` writes `origin: ctx.origin` and `schemaVersion: TELEMETRY_SCHEMA_VERSION` (from `telemetry-vocabulary.ts`).
2. Write `trigger: e.trigger ?? null`, `position: e.position ?? null` and `detail`.
3. Call `sanitizeDetail(e.type, e.action, e.detail)` and return `null` when it says `{ ok: false }`; store `detail.detail ?? undefined` (not `Prisma.JsonNull`, which would write a JSON null).
4. Update `nav-event-row.spec.ts` with the cases from `telemetry.service.spec.ts` on this branch: stores the new fields, drops unknown `detail` keys, rejects an invalid value, accepts an old-shape event with empty new fields.

## Changes needed in the simulator (`backend/project-hub/sim`)

1. **Set `origin: 'synthetic'` on every row it writes (critical).** The new column defaults to `real`, so without this, simulated rows would be counted as real participant data. Add a check in `sim/validate/hard-checks.ts` that every simulated row has `origin = 'synthetic'` and `schemaVersion = 2`.
2. **Migrate the sim database, then reset it.** `20261123120000_add_nav_event_context` ends with `UPDATE "NavEvent" SET "origin" = 'pilot', "schemaVersion" = 1`, which would relabel every existing simulated row. Apply it to `taskforge_sim` and rerun the simulator with `--reset` so the rows are written with the right values.
3. **Decide what the simulated events carry.** The new fields are optional, so the simulator keeps working unchanged. To make synthetic data the same shape as real data, emit in `sim/engine/session.ts` (which mirrors the frontend's emission rules):
   - `trigger` on navigations and actions, following `docs/telemetry.md`;
   - `position` on Needs attention hovers;
   - `detail.hiddenMs` on `route_change`, `detail.result` on `page_ready`, and the environment on `session_start`;
   - the new actions (`sort_change`, `project_filter_change`, `attention_modal_*`, `org_*`).
4. **Keep the cache model honest.** `sim/engine/cache-model.ts` replays the real `cacheState` values. Org switching now emits `org_switch`, and the new Needs attention row click opens a task through the URL; check that neither changes the cache replay (36/36 on the recorded sessions).
5. **Real-session comparison.** `sim/validate/compare.ts` reads `ground-truth/real-sessions.json`, which predates the new columns. Treat those rows as `pilot`/1 and compare only the fields both versions have.
6. Update the report (`sim/validate/report.ts`) to group by `origin` so it can never mix synthetic rows with real ones.

## Order of work

1. Merge the branches and resolve `telemetry.service.ts` as above.
2. Add `origin` and the new fields to `nav-event-row.ts` and its spec; run the telemetry specs.
3. Set `origin: 'synthetic'` in the simulator and add the hard check.
4. Migrate and reset the sim database, regenerate, and confirm the report's hard checks pass.
5. Add the optional new fields to the simulator.
