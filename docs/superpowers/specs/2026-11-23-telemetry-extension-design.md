# Telemetry extension: design

Date: 2026-11-23 · Branch: `feat/telemetry-extension` (from `main`) · Status: approved in conversation

## 1. Intent

Project Hub records navigation telemetry as `NavEvent` rows. The thesis needs to (a) predict where a user goes next and (b) evaluate a future prefetcher. Today the data lacks two things: **what caused** a navigation or action, and several user actions that matter for prediction (Needs attention, sorting, organization changes, the dashboard project selector). It is also hard to read in Metabase, because meanings are encoded in free columns.

This change adds the missing tracking points and makes each row self-describing, **without weakening privacy**.

## 2. Goals, non-goals, anti-goals

**Goals**
- Four new tracking areas (section 6).
- A `trigger` on navigations and actions, a `detail` object per action, an `origin` and a `schemaVersion` on every row.
- A closed vocabulary for actions, triggers and detail keys, documented in one reference, plus a Metabase-friendly view.
- Fields reserved for the prefetch outcome so the schema does not change again mid-study.

**Non-goals**
- The prefetch engine and server-side variant assignment.
- Any change to the simulator (`backend/project-hub/sim`) or the extracted row builder (`nav-event-row.ts`). They are not on `main`. A follow-up list is in section 11.
- Frontend test infrastructure.
- Applying the migration. This work writes the migration file; the owner applies it.

**Anti-goals (a failure even if it works)**
- Logging anything a user can type: titles, names, emails, search text, project or organization names, raw field values.
- Letting the client set `origin`.
- Touching the real `taskforge` database or its data.
- Noisy events that push users toward the batch cap (50 events) or the rate limit (30 batches/min).

## 3. Privacy rules (non-negotiable)

Only enums, bounded integers, route patterns and hashed IDs are stored. Prefer buckets to raw values (project size, list position). The server drops unknown `detail` keys, and rejects an event whose known key has an invalid value.

## 4. Constraints found in the code (verified)

- The server stores a batch only if the user is **still a member** of `orgId` (`TelemetryService.recordBatch`). An event flushed after an organization is deleted is rejected, because the membership is gone.
- Entity types are limited to `project` and `task` (`TELEMETRY_ENTITY_TYPES`).
- `AttentionRow` is shared by the dashboard list and the modal, so it cannot tell them apart today.
- A task opened through `?task=<id>` in the URL (which is how an Attention row click lands on it) emits no `entity_open`. `entity_open` for tasks fires only in `selectTask` (a table click).
- Sorting state lives in the URL (`sort`, `order`). The click cycle is off, asc, desc, off, and it resets `page` and `task`.
- The dashboard project selection lives in the URL (`?project=`) and `localStorage`. The project list carries no task counts.
- Validation lives in `TelemetryService.buildRow` and the DTO, as on `main`.
- `hoverIntent` has a 150 ms delay and a 2 s cooldown per target.

## 5. Approaches considered

**Where action-specific data lives**

| | Approach | Trade-off | Decision |
|---|---|---|---|
| A | One `detail` jsonb with per-action key allowlists | No migration for new signals. Harder in Metabase, no column types. | Rejected |
| B | Fixed nullable columns for everything | Easiest to query. Wide, mostly-NULL table, a migration per signal. | Rejected |
| **C** | **Fixed columns for broad fields (`trigger`, `origin`, `schemaVersion`, `position`) plus a small `detail` jsonb** | Common filters are plain columns. Rare keys do not bloat the schema. | **Chosen** |

**How `org_delete` is recorded**

| | Approach | Trade-off | Decision |
|---|---|---|---|
| **A** | **Client emits on the confirm click and flushes immediately, before the DELETE** | Smallest change. Records intent: a failed delete would still be logged. | **Chosen** |
| B | Server writes the event inside the delete flow | Exact, but couples organizations to telemetry and needs the session ID on every request | Rejected |
| C | Do not log `org_delete` | Nothing to work around, but the event is lost | Rejected |

`org_create` is attributed to the new organization by setting the tracker's org before tracking.

## 6. Data model (one migration, additive)

`NavEvent` gains:

| Column | Type | Notes |
|---|---|---|
| `trigger` | text, nullable | closed vocabulary (section 8) |
| `position` | int, nullable | 1-based place in the visible list or page |
| `origin` | text, not null | `real`, `pilot` or `synthetic` |
| `schemaVersion` | int, not null | new rows `2` |
| `detail` | jsonb, nullable | per-action key allowlist (section 8) |

**Cutover.** No real participants exist yet, and the study starts after this change. The migration sets existing rows to `origin = 'pilot'`, `schemaVersion = 1`. New rows get `schemaVersion = 2` from a server constant, and `origin` comes from the server env var `TELEMETRY_ORIGIN` (default `real`). The client never sends `origin`. Analysis filters on `origin = 'real' AND schemaVersion = 2`.

## 7. Server validation

In `TelemetryService.buildRow` and the DTOs on `main`:
- Allowlists for `trigger` and for the new action names.
- A per-action map of allowed `detail` keys, each with an enum or a capped integer.
- Unknown keys are dropped. A known key with an invalid value rejects the event, with a logged warning, like other invalid fields today.
- `position` is an integer from 1 to 100.
- Existing rules stay (route normalization, hashed IDs, event age, entity pairing).

## 8. Vocabulary

**`trigger`:** `sidebar`, `dashboard_card`, `attention_row`, `attention_modal`, `project_row`, `table_row`, `pagination`, `browser_history`, `redirect`. `browser_history` covers a history POP, which cannot tell back from forward. A missing trigger is stored as NULL.

**New actions:** `org_create`, `org_update`, `org_delete`, `org_switch`, `sort_change`, `project_filter_change`, `attention_modal_open`, `attention_modal_close`, `attention_modal_page`.

**`detail` keys** (each documented in `docs/telemetry.md`):

| Event or action | Key | Values |
|---|---|---|
| `route_change` | `hiddenMs` | int, time the tab was hidden since the previous route change |
| `page_ready` | `result` | `ok`, `client_error`, `server_error`, `network_error` |
| `session_start` | `viewport` | `sm`, `md`, `lg` |
| `session_start` | `connection` | `slow`, `medium`, `fast`, `unknown` |
| `task_update` | `field` | `status`, `priority`, `assignee`, `title`, `description` (names only, never values) |
| `sort_change` | `sortBy` | `status`, `priority` |
| `sort_change` | `order` | `asc`, `desc`, `default` |
| `project_filter_change` | `projectSize` | `all`, `empty`, `small`, `medium`, `large` |
| `attention_modal_close` | `pagesViewed` | int, 1 to 100 |
| `attention_modal_page` | `modalPage` | int, 1 to 100 |
| `prefetch_issued`, `prefetch_used` (reserved) | `outcome` | `used`, `wasted` (with the existing `bytes` column) |

Size buckets come from the task total: `empty` 0, `small` 1 to 9, `medium` 10 to 49, `large` 50 or more.

## 9. Client design

- **`trigger` plumbing.** A small module holds a pending trigger. Click handlers set it just before navigating. `useNavigationTracking` reads and clears it when it emits `route_change`. It expires after 2 s so a stale value never lands on a later navigation. With no pending trigger and a history POP, the trigger is `browser_history`.
- **`hiddenMs`.** The tracker accumulates hidden-tab time between route changes. `dwellMs` stays the raw value.
- **`usePageReady`** also reports when the main query fails (`result`).
- **`session_start`** carries the coarse environment. Connection type is optional, because not every browser exposes it.
- **Noise.** No new high-frequency events. New events are click-level, or hover on a few targets under the existing 2 s cooldown.

## 10. Tracking points

1. **Needs attention.** Modal open, and close with `dwellMs` and `pagesViewed`. Paging inside the modal. Row hover with `position` and `trigger` (`attention_row` or `attention_modal`). The row click now emits `entity_open` for the task, closing the gap in section 4.
2. **Sorting.** One `sort_change` per user click in Project Details. Never from URL state on load. The return to default is logged only when the user clicks it.
3. **Organizations.** `org_create` (after setting the tracker's org to the new one), `org_update`, `org_delete` (on the confirm click, flushed immediately), and `org_switch` from the organization selector.
4. **Dashboard selector.** `project_filter_change` with the hashed project ID and a size bucket. For "all projects" there is no entity and the bucket is `all`. The event is sent once the new workload has loaded, so the size is known.

## 11. Docs, Metabase and the sim follow-up

- `docs/telemetry.md`: every action, trigger and `detail` key, the privacy rules, and the known blemish that `org_delete` records intent.
- A SQL view script (not part of the migration) that flattens `detail` and translates codes into labels for Metabase.
- At the end of the work, a short list of what the sim package and `nav-event-row.ts` need after both branches merge, and the files likely to conflict: `TelemetryService.buildRow`, the DTO and `tracker.ts`.

## 12. Testing and workflow

- Jest specs for `buildRow`: new allowlists, `detail` per-action validation, origin and version. Existing specs keep passing.
- The frontend has no test runner, so changes are checked with `npm run build` and `npm run lint`, plus a manual check.
- Small steps, in this order: migration, backend validation, shared types, tracker, each tracking point, documentation. One logical change per commit, each file committed separately, conventional messages. Stop if a test fails.

## 13. Small calls made while writing this

- `org_switch` is attributed to the **new** organization (the tracker's org is set before tracking), so its tenant hash is the one the user switched to.
- `TELEMETRY_ORIGIN` is documented in `backend/project-hub/.env.example`, with no secret value.
- `position` is only set on list rows (Attention list and modal). It is NULL elsewhere.

## 14. Left to the builder

- Exact `task_update` field names against `UpdateTaskDto`.
- Hover and click wiring per component, and the exact mechanism for viewport and connection detection.
- The wording of `docs/telemetry.md` and the view's labels.
