# Simulated telemetry

Generates realistic `NavEvent` rows from AI-planned simulated users into a **separate** database,
`taskforge_sim`, for Metabase dashboards. Design: `docs/superpowers/specs/2026-11-15-ai-simulated-telemetry-design.md`.

The real `taskforge` database is never written. The CLI refuses to run if `SIM_DATABASE_URL`
points at the same database as `DATABASE_URL`.

## One-time setup

1. Create the sim database on the existing Postgres container:

   ```bash
   docker exec taskforge_postgres createdb -U postgres taskforge_sim
   ```

2. Add to `backend/project-hub/.env`:

   ```
   SIM_DATABASE_URL="postgresql://postgres:<password>@localhost:5432/taskforge_sim"
   ```

3. Apply the app's migrations to it (from `backend/project-hub`):

   ```bash
   DATABASE_URL="$SIM_DATABASE_URL" npx prisma migrate deploy
   ```

4. In Metabase (http://localhost:3001): Admin → Databases → Add database → PostgreSQL,
   host `postgres` (the compose service name), port `5432`, database `taskforge_sim`.
   Keep it separate from the real `taskforge` data source.

5. Claude API credentials, only needed for `--ai anthropic`: either `ANTHROPIC_API_KEY` in the
   environment or `ant auth login`.

`TELEMETRY_SALT` (at least 32 characters) is read from `.env`, the same way the backend reads it.

## Running

All commands run from `backend/project-hub`.

```bash
# once: snapshot the two real sessions from Metabase (used by the report)
npm run sim -- fetch-ground-truth

# offline dry run: no API calls, deterministic stub plans
npm run sim -- all --ai stub --run dry-stub --reset

# the real 3-day trial (Claude Sonnet 5.5 via the Batch API; ends yesterday by default)
npm run sim -- all --run trial-2026-11-14 --end 2026-11-14 --seed 42 --reset

# re-check a run from what is in the database
npm run sim -- validate --run trial-2026-11-14 --end 2026-11-14 --seed 42
```

Options: `--days` (default 3), `--end` (last day, default yesterday), `--seed` (default 42), `--tz`
(default this machine's), `--run` (run folder name), `--reset` (replace earlier simulated data in
`taskforge_sim`), `--replan` (ask the AI again instead of reusing saved worlds/plans), `--ai anthropic|stub`.

Stages `world` and `plan` run only the AI parts. Everything lands in `sim/runs/<run>/`: `config.json`,
`world/`, `plans/`, `manifest.json` (what `--reset` deletes) and `report.md`. A rerun with the same
seed reuses the saved worlds and plans, makes no API calls, and writes identical rows.
