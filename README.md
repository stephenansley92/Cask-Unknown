# Cask Unknown

Blind whiskey tasting and personal rating application built with Next.js and
Supabase. Hosts create a session, add pours, invite tasters, collect scores,
and reveal the results. Signed-in users can also keep a personal rating
history and optionally publish a profile.

## Runtime

- Node.js 22 (see `.nvmrc`)
- npm 11.13.0
- Next.js 16 / React 19
- Supabase Auth, Postgres, Realtime, and Row Level Security

Use the exact versions in `package-lock.json` via `npm ci` for CI and clean
deployments.

## Local setup

1. Install Node from `.nvmrc`.
2. Copy `.env.example` to `.env.local`.
3. Set the public Supabase project URL and publishable/anon key.
4. Install dependencies and start the app:

```powershell
npm ci
npm run dev
```

Open `http://localhost:3000`.

The `NEXT_PUBLIC_` variables are intentionally browser-visible. Never place a
Supabase secret key, service-role key, database password, or access token in a
`NEXT_PUBLIC_` variable.

## Verification

```powershell
npm run lint
npm run test
npm run typecheck
npm run build
npm run audit:prod
```

`npm run check` runs lint, tests, type-checking, and the production build.
Do not run `next dev` and `next build` concurrently in the same checkout unless
the active Next.js version explicitly isolates their output directories.

GitHub Actions runs all verification commands for pull requests and pushes to
the main working branches.

## Database preflight

The legacy files under `sql/` are incremental production-era scripts, not a
complete schema baseline. Do not assume a fresh Supabase project can be created
from them.

Before applying the RLS/security redesign:

1. Create or select a staging Supabase project.
2. Obtain a percent-encoded Postgres connection string for the target database.
3. Set it only in the current shell:

```powershell
$env:SUPABASE_DB_URL = "postgresql://..."
```

4. Run the read-only export:

```powershell
./scripts/export-supabase-schema.ps1
```

The script always creates these ignored, data-free files under
`artifacts/supabase-preflight/` without requiring Docker:

- `production-catalog.json`
- `preflight-results.json`

When Docker is available, Supabase CLI 2.109.1 also creates:

- `production-schema.sql`
- `production-roles.sql`
- `preflight-report.txt`

The preflight returns schema metadata and aggregate issue counts only; it does
not select emails, host keys, score notes, or other user content. Regenerate
the tracked data-free baseline from a reviewed catalog with `npm run db:baseline`.
The baseline is only for a fresh project; never run it over an existing database.

## Database rollout rules

- Rehearse every migration against staging first.
- Export and retain a production schema backup before changing RLS.
- Audit duplicate score pairs, orphan relationships, invalid score ranges, and
  sessions without `host_user_id` before adding constraints.
- Add secure RPCs and owner-scoped policies before revoking legacy access.
- Switch one client workflow at a time, then remove unsafe policies only after
  the replacement path is verified.
- Use forward-only rollback migrations for anything already deployed.
- Never run `supabase db reset` against a hosted production project.

## Deployment order

For the `20260711` session security rollout, preserve this exact order:

1. Run `npm ci`, `npm run check`, and `npm run audit:prod`.
2. Apply `202607110001_session_integrity.sql` and
   `202607110002_session_api.sql`. These are additive and remain compatible
   with the old client.
3. Deploy application commit `c87b077` or later.
4. Smoke-test create, host, guest join, autosave, core lock, soft reveal, final
   lock, reveal, profile history, and legacy host links.
5. Apply `202607110003_restrict_session_tables.sql`. It hashes remaining
   plaintext host keys and revokes the legacy table policies.
6. Repeat the smoke tests and monitor auth, score persistence, realtime, and
   RPC error events.

`202609270001_reveal_night.sql` (guessing game, flavor tags, bottle facts on
the reveal, bottle pages, palate insights) is additive and can be applied
before or after `202607110003`. The client ships first: it hides those
features while their RPCs are missing and turns them on once the migration
is applied, with no redeploy needed.

Database migrations and application changes that depend on them must document
their required order. Do not deploy a client that calls a new RPC before that
RPC exists in the target database.

## Service worker

Production registers `public/sw.js`. When changing cached shell assets, update
the cache version and verify upgrade behavior on an already-installed PWA.
