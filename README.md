# Lift

A clean, fast, offline-first workout tracker PWA: log sets, reuse templates, review history, and track per-exercise progress and bodyweight. Your data lives in your own Supabase project, with a local IndexedDB cache so the app works offline.

Live (GitHub Pages): https://aarushplatti-afk.github.io/lift/

Status and decisions: [docs/PROGRESS.md](docs/PROGRESS.md). Spec: [docs/PRD.md](docs/PRD.md). Build plan: [docs/PLAN.md](docs/PLAN.md).

## Stack

React 18, TypeScript (strict), Vite, Tailwind CSS 3.4, Zustand, Dexie (IndexedDB cache and outbox), Supabase (Postgres, Auth, RLS), Recharts, vite-plugin-pwa, Vitest, Playwright.

## Prerequisites

- Node 22 (see `.nvmrc`).
- Docker Desktop with the WSL2 backend, for the local Supabase stack. Only needed for `test:rls`, `e2e:local-supabase` and local migrations.

## Setup

1. `npm ci`
2. Create `.env.local` in the repo root:

   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable or anon key>
   ```

   Use the publishable/anon key only. Never put the service-role key in this repo, in `.env*`, or in any client code. `.env.local` is gitignored. `.env.example` lists the variables.
3. `npm run dev`, then open http://localhost:5173/lift/.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run typecheck` | `tsc --noEmit` for app and node configs |
| `npm run lint` | ESLint |
| `npm run test` | Unit and component tests (Vitest) |
| `npm run e2e` | Playwright acceptance tests (390x844) against `vite preview` |
| `npm run e2e:local-supabase` | Same as `e2e`, wrapped to point at the local Supabase stack |
| `npm run test:rls` | Row-level security isolation tests against the local Supabase stack |
| `npm run gen:types` | Regenerate `src/types/database.ts` from the local database |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm run generate-pwa-assets` | Regenerate PWA icons in `public/icons/` from `public/icons/source.svg` |

The `*:local-supabase` and `test:rls` scripts read the local URL and key from `npx supabase status`. Nothing is written to disk.

## Local Supabase workflow

```
npx supabase start          # starts the local stack (needs Docker)
npx supabase db reset       # reapply all migrations from scratch
npm run gen:types           # after any schema change
npm run test:rls            # RLS isolation suite
```

- Schema changes happen only through SQL migrations. Create one with `npx supabase migration new <name>`, then write the SQL in the new file. Do not edit the database by hand.
- Pushing migrations to the remote project (`npx supabase db push`) needs explicit owner approval.
- Never run `npx supabase config push` with the local `supabase/config.toml`.

## Deploy

GitHub Pages, via GitHub Actions (`.github/workflows/deploy.yml`), on every push to `main`. The Vite base is `/lift/` and the router is HashRouter.

- Repository secrets: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Settings → Secrets and variables → Actions).
- Pages source must be set to GitHub Actions.
- Before upload, `scripts/check-dist-secrets.mjs` fails the build if `dist/` contains `service_role` or `sb_secret_` values.
- CI (`.github/workflows/ci.yml`) runs typecheck, lint, test and build on every PR. The `integration` job (local Supabase, RLS and e2e) is not yet a required check.

## Install on a phone

- **iPhone:** open the Pages URL in Safari, then Share → Add to Home Screen.
- **Android:** open the Pages URL in Chrome, then menu → Install app.

The installed app opens offline once you have signed in at least once on that device.

## Data and backups

- Supabase is the system of record. The device keeps an IndexedDB cache plus an outbox of changes not yet uploaded. Changes are saved locally first and synced when online.
- Signing in as a different account wipes the local cache first. The sign-in screen warns if unsynced changes exist.
- Free-tier Supabase projects pause after about one week of inactivity. If the app stops connecting, restore the project from the Supabase dashboard.
- Export and import arrive in M9.

## Architecture notes

- All weights are stored in kg. Conversion to lb happens only at the display boundary (`src/lib/units.ts`).
- Components never call Dexie or Supabase directly. They use repos in `src/db/repos/` and the sync engine in `src/sync/`.
- Only `src/sync/**` and `src/lib/supabase.ts` import `@supabase/supabase-js`. Only `src/db/**` and `src/hooks/useLiveQuery.ts` import `dexie`.
- All math lives in `src/lib/calc/` as pure functions with unit tests.
- Every table has RLS enabled with owner-only policies.
- The active workout autosaves to IndexedDB on every change.
- The service worker never reloads the app while a workout is in progress. Updates are offered by a toast the user accepts.
- No analytics and no third-party CDN assets. Network calls go only to Supabase.

## Deviations from the PRD

The decisions behind these are recorded in [docs/PROGRESS.md](docs/PROGRESS.md) under Decisions.

- Seeded exercise IDs and bodyweight IDs are deterministic UUID v5 values, namespaced per user (D8, D9, Q1, Q3).
- Deleting all data tombstones rows rather than hard-deleting them (Q2).
- Local Dexie never stores deleted rows (D1). The outbox is append-only (D2).
- Pull uses a keyset cursor on `(updated_at, id)` (D4).
- Settings defaults are not written on first run (D11).
- Signing in as a different user wipes the cache. Signing back in as the same user resumes (D12).
- Sign-up is enabled in the local stack for tests. The remote project should have sign-up turned off once the owner account exists (PRD §19.2 overrides §5.6).
