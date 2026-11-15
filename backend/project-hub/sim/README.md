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
