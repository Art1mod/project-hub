# Telemetry reference

Every event the app records, and what each field means. The design is in `docs/superpowers/specs/2026-11-23-telemetry-extension-design.md`.

## Privacy rules

Only enums, bounded integers, route patterns and hashed IDs are stored. Never free text or anything a user can type: titles, names, emails, search text, project or organization names, or the value of an edited field. Where a raw number would identify something, a bucket is used instead (project size, list position).

- User, tenant and entity IDs are HMAC-SHA256 hashes (32 hex characters) made with `TELEMETRY_SALT`. Raw IDs are never stored.
- The server accepts a batch only if the user belongs to the batch's organization.
- Events older than 24 hours or more than 5 minutes in the future are dropped.
- Limits: 50 events per batch, 30 batches per minute per user.

## Row context

| Column | Meaning |
|---|---|
| `origin` | `real`, `pilot` or `synthetic`. Set by the server from `TELEMETRY_ORIGIN` (default `real`), never by the client. |
| `schemaVersion` | `2` for rows written after the extension. The migration marked earlier rows `pilot` / `1`; the two real trial sessions of 4 November 2026 (318 events) were then relabeled `real` / `1` by hand. Version 1 rows have no `trigger`, `position` or `detail`. |
| `variant` | `control` or `prefetch`. The client currently always sends `control`. |
| `trigger` | What caused the navigation or action (table below). NULL when unknown. |
| `position` | 1-based place of a row in the visible list or modal page (1 to 100). Only set on Needs attention rows. |
| `detail` | Small JSON object, keys per action (table below). Unknown keys are dropped and an invalid value rejects the event. |

**Analysis rule:** filter on `origin = 'real'`. That covers the real trials of both versions, and the core metrics (navigation time, cache hit rate, latency) exist in both. Add `AND "schemaVersion" = 2` only for anything that uses the new fields (`trigger`, `position`, `detail`, hidden time), because version 1 rows do not have them.

## Event types

| Type | When | Notable fields |
|---|---|---|
| `session_start` | first tracked event of a session | `detail.viewport`, `detail.connection` |
| `session_end` | logout | |
| `route_change` | the page changes | `fromRoute`, `toRoute`, `dwellMs`, `trigger`, `detail.hiddenMs` |
| `page_ready` | the page's main data is shown, or its query failed | `latencyMs`, `cacheState`, `detail.result` |
| `link_hover` | hover (150 ms) or keyboard focus on a link or row | `toRoute`, entity, `trigger`, `position` |
| `entity_open` | a project or task is opened | entity, `trigger` |
| `page_change` | pagination in a task table | `page`, entity, `trigger` |
| `action` | a user action (below) | `action`, entity, `detail` |
| `prefetch_issued`, `prefetch_used` | reserved: nothing emits them yet | `bytes`, `detail.outcome` |

## Triggers

| Value | Meaning |
|---|---|
| `sidebar` | a sidebar link |
| `dashboard_card` | the workload card or a status card on the dashboard |
| `attention_row` | a row in the dashboard's Needs attention list |
| `attention_modal` | a row in the "show all" modal |
| `project_row` | a row in the Projects list |
| `table_row` | a task row in a project's table |
| `pagination` | the task table's pagination |
| `browser_history` | the browser's back or forward button (the two cannot be told apart) |
| `redirect` | the app moved the user, e.g. after switching organization on a project page |

A click handler records the trigger just before navigating. `route_change` consumes it, and it expires after 2 seconds.

## Actions

Existing: `task_create`, `task_update`, `task_delete`, `project_create`, `project_update`, `project_delete`, `attachment_upload`, `attachment_delete`, `member_remove`, `invitation_create`, `invitation_cancel`.

| Action | When | `detail` keys |
|---|---|---|
| `task_update` | a task field is saved | `field`: `status`, `priority`, `assignee`, `title` or `description` (the name only) |
| `sort_change` | the user clicks a sortable column | `sortBy`: `status`/`priority`; `order`: `asc`, `desc` or `default` (the third click) |
| `project_filter_change` | the dashboard project selector changes | `projectSize`: `all`, `empty`, `small` (1-9 tasks), `medium` (10-49), `large` (50+). Entity is the hashed project, absent for "all". |
| `attention_modal_open` | the "show all" modal opens | |
| `attention_modal_page` | paging inside the modal | `modalPage`: 1 to 100 |
| `attention_modal_close` | the modal closes | `pagesViewed`: 1 to 100; `dwellMs` is the time it was open |
| `org_create` | an organization is created | attributed to the new organization |
| `org_update` | the organization is renamed | |
| `org_switch` | the organization selector changes | attributed to the organization switched to |
| `org_delete` | the user confirms deleting the organization | see the note below |

## Other `detail` keys

| Event | Key | Values |
|---|---|---|
| `route_change` | `hiddenMs` | milliseconds the tab was hidden since the previous route change (`dwellMs` stays the raw value) |
| `page_ready` | `result` | `ok`, `client_error`, `server_error`, `network_error` |
| `session_start` | `viewport` | `sm` (under 640 px), `md` (under 1024 px), `lg` |
| `session_start` | `connection` | `slow`, `medium`, `fast`, `unknown` (the Network Information API is not in every browser) |
| `prefetch_issued`, `prefetch_used` | `outcome` | `used`, `wasted` (reserved) |

## Known blemish

`org_delete` is sent when the user confirms, before the DELETE request, because the server only stores events for organizations the user still belongs to. It therefore records the intent: if the delete then fails, the log still says it happened.

## Metabase

`docs/telemetry-views.sql` defines a view that flattens `detail` and turns the codes above into readable labels. Apply it by hand to the database Metabase reads. It is not part of the migration.
