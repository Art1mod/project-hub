# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project Hub is a multi-tenant task manager (organizations > projects > tasks). It is the practical part of a bachelor's thesis on behavior-driven prefetching and client-side caching. The README describes only what is implemented, so keep it that way: **the prefetch engine does not exist yet** (see "Telemetry" below).

## Layout

Three separate npm projects, not a workspace. Each needs its own `npm install`.

- `backend/`: only holds `prisma` (CLI) and `@prisma/client`. The Prisma CLI and client are installed here, not in `backend/project-hub`.
- `backend/project-hub/`: NestJS API. Contains `prisma/schema.prisma`, `prisma.config.ts` and migrations.
- `frontend/project-hub/`: React SPA (Vite).
- `docker-compose.yml` (root): Postgres 15 (`:5432`, db `taskforge`, user `postgres`, password `password`), SeaweedFS S3 (`:8333`) and Metabase (`:3001`).

## Commands

```bash
docker compose up -d                          # from repo root

# backend (cd backend/project-hub)
npm run start:dev                             # API on :3000
npm run build                                 # nest build
npm run lint                                  # oxlint src/ test/
npm run format                                # prettier
npm test                                      # all unit tests (*.spec.ts, next to the source)
npx jest src/tasks/tasks.service.spec.ts      # one file
npx jest -t "part of a test name"             # one test by name
npm run test:e2e                              # test/*.e2e-spec.ts, separate jest config
npx prisma migrate deploy                     # apply migrations
npx prisma migrate dev --name <name>          # create a migration after editing schema.prisma
npx prisma generate
node create-bucket.js                         # creates the local S3 bucket, once

# frontend (cd frontend/project-hub)
npm run dev                                   # :5173
npm run build                                 # tsc -b && vite build
npm run lint
```

The frontend has no test runner.

## Environment

`backend/project-hub/.env` (copy from `.env.example`). Required: `DATABASE_URL`, `JWT_SECRET`, `S3_*`, and `TELEMETRY_SALT` (at least 32 characters, or the API refuses to start). Local S3 values: endpoint `http://localhost:8333`, bucket `project-hub-attachments`, keys `admin`/`secret`, `S3_FORCE_PATH_STYLE=true`.

- `.env.example` ships `TELEMETRY_ENABLED=false`, which makes the backend drop every telemetry batch. Set it to `true` to record events.
- `STUDY_MODE=true` is required to add members through the bulk organization endpoint (`POST /organizations/bulk`). Members and assignees must already be registered users.
- CORS allows only `http://localhost:5173` (hard-coded in `main.ts`). The frontend reads `VITE_API_URL`, default `http://localhost:3000`.

## Architecture

### Multi-tenancy
The tenant is the `Organization`. One database, one schema. `Membership(userId, organizationId, role)` carries the role (`OWNER`/`ADMIN`/`MEMBER`). A user can belong to several organizations with a different role in each. Projects belong to an organization, tasks to a project.

There is **no global tenant middleware**. Isolation depends on each service method:
- Services check membership themselves, usually via `organizationsService.getOrganizationById(userId, orgId)` or a Prisma `where` that filters through `memberships`. They throw "not found or access denied" otherwise.
- `RolesGuard` + `@Roles(...)` only works on routes with an `:orgId` param. Project, task and attachment routes check roles inside the service.
- Any new endpoint must do its own membership check.

The frontend mirrors roles in `src/permissions.ts` (`Can`, `RequirePermission`, `usePermissions`). That is for UI only. The backend is the authority.

### Frontend data flow
- A single default `QueryClient` (`App.tsx`). Query keys include the active org, for example `['projects', activeOrgId]`. The active org lives in `OrganizationContext`.
- Mutations invalidate keys by hand. When adding a mutation, invalidate the affected keys, including `['analytics']` for anything that changes task status.
- `src/api/*.ts` is one thin axios module per backend resource, on top of `src/lib/api.ts` (attaches the JWT from `localStorage`, redirects to `/login` on 401).

### Telemetry (the thesis instrumentation)
Events flow: hooks in `frontend/.../src/telemetry/` -> batched `POST /telemetry/events` -> `TelemetryService` -> `NavEvent` table (Metabase reads it).

- `usePageReady(route, queryKey, isReady)` reads the cache state (`hit`/`stale`/`miss`) from the query cache **at mount**, then reports latency. Call it once per page, above any early return.
- `hoverIntent()` (150 ms delay, 2 s cooldown) is the behavior signal that a prefetcher would use.
- **Keep these in sync by hand:** the route list in `frontend/.../telemetry/routes.ts`, `backend/.../telemetry/route-normalizer.ts` and the routes in `App.tsx`. Event types and actions in `tracker.ts` must match `create-telemetry-batch.dto.ts`. A new tracked page or action that is missing from either side is silently dropped (the server logs a warning).
- The server stores HMAC-SHA256 hashes (truncated to 32 hex characters) of user, tenant and entity IDs, using `TELEMETRY_SALT`. Raw IDs are never stored. It also rejects events older than 24 h or more than 5 min in the future. Ingestion is limited to 30 batches/min per user.
- `prefetch_issued`/`prefetch_used` event types and `variant: 'prefetch'` exist, but nothing emits them. `VARIANT` is hard-coded to `'control'` in `telemetry/config.ts`.
- Known bug: `TELEMETRY_ENABLED` in `telemetry/config.ts` is inverted (`VITE_TELEMETRY_ENABLED !== 'true'`), so setting it to `true` turns telemetry off.

### Simulator (unmerged)
The simulated-telemetry generator lives on the branch `feat/sim-telemetry`, with its design doc under `docs/superpowers/` on that branch. Do not commit `backend/project-hub/sim/runs/` or `sim/ground-truth/`. `ground-truth` is raw data from real sessions, and `runs` is generated output.

## Stack

- **Backend:** NestJS 12, Prisma 7 with the `@prisma/adapter-pg` driver adapter (the client is built in `PrismaService`), PostgreSQL, Passport JWT, bcrypt, class-validator/class-transformer, `@nestjs/throttler`, AWS SDK v3 (S3 presigned URLs for attachments), Jest 30 + ts-jest, oxlint, Prettier.
- **Frontend:** React 19, Vite 8, React Router 7, TanStack Query 5, Axios, Tailwind CSS 4 (`cn()` in `utils/cn.ts` wraps clsx + tailwind-merge), TypeScript 6, ESLint 10.

## Presets that affect how code must be written

- **Backend TypeScript:** `module: nodenext`, `strict` on but `strictPropertyInitialization` off (DTO fields have no initializers), decorators and `emitDecoratorMetadata` on.
- **Backend validation:** global `ValidationPipe({ whitelist: true })` strips properties that have no decorator in the DTO. A new DTO field needs a class-validator decorator or it is silently removed.
- **Prettier:** single quotes, trailing commas everywhere. **oxlint:** `no-explicit-any` off, `no-floating-promises` warn.
- **Frontend TypeScript:** `verbatimModuleSyntax` (use `import type` for types), `erasableSyntaxOnly` (no enums, no parameter properties, no namespaces), `noUnusedLocals` and `noUnusedParameters` are errors (they fail `npm run build`).
- **Rate limits:** global throttler 120 requests/min; telemetry endpoint 30/min per user.

## Conventions

Commit messages follow `type(scope): summary`, with scopes such as `frontend/tasks`, `backend/telemetry` and `frontend/api` (see `git log`).
