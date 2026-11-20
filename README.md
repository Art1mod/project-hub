# Project Hub

A multi-tenant project and task management app, built as a testbed for measuring how behavior-driven prefetching and client-side caching change the latency users feel.

> This is the practical part of my bachelor's thesis, **"Behavior-Driven Prefetching and Client-Side Caching in Multi-Tenant SaaS Applications"**.

**Status: work in progress. There are no final results yet.** The app, the client cache and the telemetry pipeline are implemented. The prefetching itself is not (see [Roadmap](#roadmap)).

## The problem

In a multi-tenant SaaS app, every page change can wait on a network round trip to a shared backend. Users feel that wait, and it grows with data volume and load.

Prefetching hides it by fetching data before the user asks for it. Naive prefetching ("load everything the user might open") pays for the guesses in bandwidth and server load. Most of those guesses are wrong, and on a shared backend the extra requests from every tenant add up.

The question this project asks is whether a prefetcher driven by observed user behavior can cut perceived latency without paying that cost. To answer it I need an app that can measure both sides.

## The approach

1. **Client-side cache.** Server data lives in a TanStack Query cache keyed by tenant (for example `['projects', orgId]`). Revisiting a page can show cached data right away. Mutations invalidate the affected keys.
2. **Behavior signals.** The frontend records what users actually do: hovering or focusing a link (150 ms delay, 2 s cooldown, so a mouse passing over a link does not count), route changes with time spent on each page, opening a project or task, paging through tables, and user actions. A hover on a link is the strongest hint of where the user goes next.
3. **Measurement.** When a page finishes loading, the app records how long it took and what state the cache was in (`hit`, `stale` or `miss`). Each event carries an experiment `variant` (`control` or `prefetch`). The backend stores events with user, tenant and entity IDs hashed, so I can analyse behavior without storing raw IDs.

**Not built yet:** the component that turns those signals into prefetch requests. The event types `prefetch_issued` and `prefetch_used` exist in the schema, but nothing emits them, and the client always reports `variant = 'control'`.

## Evaluation plan

No measurements have been collected for the thesis yet. These are the metrics and what the repo already supports:

| Metric | Source | State in repo |
|---|---|---|
| Navigation time | `page_ready.latencyMs`: time from page mount until its main data is shown | Implemented. It measures time to data, not full browser navigation timing. |
| Cache hit rate | `page_ready.cacheState` (`hit` / `stale` / `miss`) | Implemented |
| Wasted prefetches | `prefetch_issued` events with no matching `prefetch_used` | Event types exist, nothing emits them yet |
| Extra bandwidth | `bytes` on events | Column exists, but only attachment uploads set it today. Prefetch requests will need to record it. |

**Baseline:** the `control` variant, which is the current app: TanStack Query cache, no prefetching.

**Method:** compare `control` and `prefetch` sessions on the metrics above using the `variant` field on each event. Analysis runs on the `NavEvent` table, which Metabase (in `docker-compose.yml`) can query. The client currently hard-codes the variant. A code comment says it should later be assigned per user by the server.

## Preliminary findings

None yet. I will add measurements here once the study has run.

## Roadmap

**Done**
- Multi-tenant app: organizations, roles, invitations, projects, tasks (filter, sort, paginate), attachments, dashboard analytics
- Client cache with cache-state reporting on every main page
- Behavior telemetry pipeline: client batching, rate-limited ingestion, hashed IDs, `NavEvent` storage, Metabase for exploration

**In progress**
- A generator for AI-simulated telemetry logs, for building dashboards before enough real sessions exist (branch `feat/sim-telemetry`, not merged). Its output is synthetic and is not evidence for the thesis.

**Next**
- Prefetch engine driven by hover and navigation signals
- Server-side variant assignment per user
- Emit `prefetch_issued`, `prefetch_used` and `bytes` for prefetch requests
- Run the study, then analyse and write up

## Architecture

```
Browser (React SPA)
 ├─ TanStack Query cache  (keys include orgId)
 └─ Telemetry tracker     (hover / route / page_ready / actions, batched every 5 s)
        │  REST + JWT
        ▼
NestJS API ── auth · organizations · projects · tasks · analytics
        │     invitations · attachments · telemetry
        ├──► PostgreSQL (Prisma)   app tables + NavEvent log
        └──► S3-compatible storage (attachments, presigned URLs)

Metabase ──► PostgreSQL   (exploring NavEvent data)
```

**Multi-tenancy.** The tenant is the `Organization`. All tenants share one database and one schema. A user can belong to several organizations with a different role in each (`OWNER`, `ADMIN`, `MEMBER`, stored on `Membership`). Projects belong to an organization and tasks belong to a project. The service layer checks membership on each request, either directly or by filtering through `memberships`, and returns "not found or access denied" otherwise. On the client, the active organization is held in a context, and cache keys include its ID so tenants do not share cached data.

**Telemetry and tenants.** Each batch holds events for one organization, and the server checks membership before storing it. User, tenant and entity IDs are stored as truncated HMAC-SHA256 hashes. The server refuses to start without a `TELEMETRY_SALT` of at least 32 characters.

## Key decisions and trade-offs

| I chose | It costs | I would change |
|---|---|---|
| Shared schema, tenant checks in the service layer | Every query has to remember its tenant filter. A missed check is a cross-tenant leak. | Centralize the tenant scoping, or add Postgres row-level security |
| TanStack Query as the cache, not a custom one | I get its default semantics. The cache is in memory only and lost on reload. | Persist the cache if the study shows reloads matter |
| Hover and focus as the "intent" signal | Hover is noisy and does not exist on touch devices. | Add more signals, such as visit history per role |
| Hashed IDs in telemetry | I cannot join a log row back to a specific task or user. | Nothing. This is deliberate. |
| Best-effort telemetry (dropped on failure, queue capped at 200) | Lost events slightly bias the metrics. | Measure the drop rate during the study |
| Variant hard-coded to `control` for now | No randomized assignment yet | Server-side per-user assignment (planned) |

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, React Router, TanStack Query 5, Axios, Tailwind CSS 4
- **Backend:** NestJS 12, Prisma 7 on PostgreSQL, Passport JWT, class-validator, `@nestjs/throttler`, AWS SDK v3 (S3)
- **Infra (local):** Docker Compose with PostgreSQL 15, SeaweedFS (S3 API) and Metabase
- **Tooling:** Jest, ESLint, oxlint

## Run it locally

Prerequisites: Node.js, npm and Docker.

**1. Start PostgreSQL, S3 storage and Metabase** (from the repo root)

```bash
docker compose up -d
```

Postgres runs on `:5432`, the S3 API on `:8333` and Metabase on `:3001`.

**2. Backend**

```bash
cd backend && npm install            # installs the Prisma CLI and client
cd project-hub && npm install
cp .env.example .env
```

Edit `.env`. These values match the Docker Compose setup:

```ini
DATABASE_URL="postgresql://postgres:password@localhost:5432/taskforge"
JWT_SECRET="<a long random string>"
S3_ENDPOINT=http://localhost:8333
S3_REGION=us-east-1
S3_BUCKET=project-hub-attachments
S3_ACCESS_KEY_ID=admin
S3_SECRET_ACCESS_KEY=secret
S3_FORCE_PATH_STYLE=true
TELEMETRY_SALT="<at least 32 random characters, required>"
TELEMETRY_ENABLED=true               # .env.example ships with false, which drops all events
```

Then create the bucket, apply the migrations and start the API:

```bash
node create-bucket.js
npx prisma migrate deploy
npx prisma generate
npm run start:dev                    # http://localhost:3000
```

**3. Frontend**

```bash
cd frontend/project-hub
npm install
npm run dev                          # http://localhost:5173
```

The API allows CORS only from `http://localhost:5173`. The frontend talks to `http://localhost:3000` unless `VITE_API_URL` is set.

**Tests and checks**

```bash
cd backend/project-hub && npm test      # unit tests (npm run test:e2e for e2e)
cd frontend/project-hub && npm run lint && npm run build
```

## Contact

Artem Honcharov · [artmod2112@gmail.com](mailto:artmod2112@gmail.com) · [LinkedIn](https://www.linkedin.com/in/artem-honcharov-a7018521a/)
