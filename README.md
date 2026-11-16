# Lift

A clean, fast, offline-first workout tracker PWA: log sets, reuse templates, review history, and track per-exercise progress and bodyweight. Your data lives in your own Supabase project, with a local IndexedDB cache so the app works offline.

Live (GitHub Pages): https://aarushplatti-afk.github.io/lift/

Status and decisions: [docs/PROGRESS.md](docs/PROGRESS.md). Spec: [docs/PRD.md](docs/PRD.md). Build plan: [docs/PLAN.md](docs/PLAN.md). Current milestone spec: [docs/milestones/M10-spec.md](docs/milestones/M10-spec.md).

## Stack

React 18, TypeScript (strict), Vite, Tailwind CSS 3.4, Zustand, Dexie (IndexedDB cache and outbox), Supabase (Postgres, Auth, RLS), Recharts, vite-plugin-pwa, Vitest, Playwright.

## Prerequisites

- Node 22 (see `.nvmrc`).
- Docker Desktop with the WSL2 backend, for the local Supabase stack. Only needed for `test:rls`, `e2e:local-supabase` and local migrations. On Windows, install WSL2 first and reboot. Launch Docker Desktop before `npx supabase start`, because the engine may not respond until it has started.

## Local development

1. `npm ci`
2. Create `.env.local` (see Environment below).
3. `npm run dev`, then open http://localhost:5173/lift/.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run typecheck` | `tsc --noEmit` for app and node configs |
| `npm run lint` | ESLint |
| `npm run test` | Unit and component tests (Vitest, pinned to `TZ=America/New_York`) |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm run size` | Bundle budget: gzipped initial JS (entry plus modulepreload) of `dist/`, fails over 250 kB, warns over 230 kB |
| `npm run e2e` | Playwright acceptance tests (390x844) against `vite preview` |
| `npm run e2e:local-supabase` | Same as `e2e`, pointed at the local Supabase stack |
| `npm run test:rls` | Row-level security isolation and constraint tests against the local stack |
| `npm run gen:types` | Regenerate `src/types/database.ts` from the local database |
| `npm run generate-pwa-assets` | Regenerate PWA icons in `public/icons/` from `public/icons/source.svg` |

`*:local-supabase` and `test:rls` read the local URL and keys from `npx supabase status -o env` in memory and pass them to the child process. Nothing is written to disk.

Definition of done for a change: `typecheck`, `lint`, `test` and the relevant e2e suites pass, and the UI works at 390 px in both themes.

## Environment

`.env.example` lists the two variables. Copy it to `.env.local` and fill in:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable or anon key>
```

- Use the publishable (`sb_publishable_…`) or anon key only. It is public by design, and RLS protects the data.
- Never put the service-role or secret key in this repo, in any `.env*` file, in client code, or in CI. `scripts/check-dist-secrets.mjs` fails the build if `dist/` contains `service_role` or `sb_secret_` values.
- `.env` and `.env.*` are gitignored. Only `.env.example` is committed.

## Local Supabase (Docker and WSL2)

```
npx supabase start          # starts the local stack (needs Docker)
npx supabase db reset       # reapply all migrations from scratch
npm run gen:types           # after any schema change
npm run test:rls            # RLS isolation suite
npm run e2e:local-supabase  # full e2e against the local stack
npx supabase status         # URLs and keys, including the local Mailpit inbox
```

Local auth differs from the remote project in two ways: `supabase/config.toml` sets `email_sent = 100` (local only), and the redirect allow-list includes `http://127.0.0.1:4173/lift/` for e2e. Never run `npx supabase config push` with the local `supabase/config.toml`.

## Migrations

- Schema changes happen only through SQL files in `supabase/migrations/`. Create one with `npx supabase migration new <name>`, write the SQL, then `npx supabase db reset` to check it. Do not edit the database by hand.
- Pushing to the remote project (`npx supabase db push`, or the MCP apply tool) needs explicit owner approval.
- **Version-name gotcha.** Supabase identifies a migration by the timestamp prefix of its file name, and the remote records the version it was applied under. If a migration was applied remotely under a different version (for example through the dashboard or MCP), rename the local file so its prefix matches the version the remote recorded. Otherwise the local and remote histories disagree and the next `db push` fails or re-applies the change. Example: `0001_init` was applied remotely as version `20261114022326`, so the local file is `supabase/migrations/20261114022326_0001_init.sql`.
- After any migration, regenerate types with `npm run gen:types` and run `npm run test:rls`.

## RLS tests

`npm run test:rls` runs `tests/rls/*.test.ts` against the local stack. They create two users and assert that each can read, write and delete only their own rows across every table, that a cross-user id collision fails with `42501`, and that the bodyweight and settings constraints hold. The suite needs `npx supabase start` first. Read the CI `integration` job logs rather than trusting a green check alone.

## Deploy

GitHub Pages, via GitHub Actions (`.github/workflows/deploy.yml`), on every push to `main`. The Vite base is `/lift/` and the router is HashRouter.

### Repository setup

- Repository secrets (Settings → Secrets and variables → Actions): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The workflows read these exact names.
- Settings → Pages → Source: **GitHub Actions**.
- CI (`.github/workflows/ci.yml`) runs typecheck, lint, test, build, the bundle budget and the secret guard on every PR. The `integration` job (local Supabase, RLS and e2e) must be made a required check after its first green run (Settings → Branches, branch protection on `main`). This is an owner action.

### Supabase Auth configuration (remote project)

Dashboard → Authentication → URL Configuration and Providers:

- **Site URL:** exactly `https://aarushplatti-afk.github.io/lift/`
- **Redirect allow-list:** must contain exactly `https://aarushplatti-afk.github.io/lift/`. Sign-up confirmation and password reset both redirect here.
- **Allow new users to sign up:** ON. The app is open to multi-user sign-up (PRD §19.2).
- **Minimum password length:** 8. This matches the app's `PASSWORD_MIN_LENGTH`.
- **Confirm email:** optional. Turning it off is recommended for a personal project.

## Install on a phone

- **iPhone (iOS 16.4+):** open the Pages URL in Safari, then Share → Add to Home Screen. Open the app from the Home Screen icon. Installed apps run full screen and work offline after you have signed in once on that device.
- **Android:** open the Pages URL in Chrome. Either go to Settings → About and tap **Install app** (shown when Chrome offers the install), or open the browser menu and tap Install app or Add to Home screen. Settings → About → **How to install** shows these steps in the app.

## Password reset

1. On the sign-in screen, tap **Forgot password?** and enter your email. The message is the same whether or not an account exists.
2. Open the email link. It opens in the browser (Safari on iPhone), not in the installed app. This is accepted behaviour (PRD §19.2).
3. Set a new password (at least 8 characters, entered twice).
4. The app does not sign you in after the reset. Go back to the installed app, sign in with the new password, and the email is prefilled.

The default Supabase email sender (SMTP) is rate limited to a few emails per hour, so repeated reset requests may be refused. Wait a few minutes. A custom SMTP provider raises the limit. None is configured for this project.

## Backup, restore and the 30-day nudge

Settings → Data:

- **Export backup** writes JSON (epoch milliseconds, kg, completed workouts). **Export CSV** writes a spreadsheet-friendly export, with a guard against formula injection.
- **Import backup** is Replace only. It shows a summary and asks for confirmation. Cross-account imports get new ids. Import needs the device online, no active workout, and no unsynced changes.
- **Delete all** needs the exact text `DELETE`. It tombstones every row on the server, resets settings, and the seeded exercise library returns on the next sync. Same online and no-active-workout rules as import.

Export also runs from the blocking storage dialog and from the error screen.

A card on Workout home appears when at least 30 days have passed since the last export on this device (or since backup tracking started). **Not now** hides it for 30 days. Signing out clears this per-device state.

## Data schema and sync model

Supabase tables (all with RLS enabled and owner-only policies): `exercises`, `workouts`, `templates`, `bodyweight_entries`, `user_settings`. Rows carry `user_id`, `updated_at` (set by a server trigger) and, for soft-deleted rows, `deleted_at`.

- **Local cache:** Dexie (IndexedDB) mirrors the server rows for the signed-in user. Dexie never stores deleted rows; a pulled tombstone deletes the local row.
- **Outbox:** every local write is saved first and appends an outbox entry in the same transaction. The outbox is append-only and ordered (FIFO).
- **Coalescing:** at push time, several pending entries for the same record collapse into one upsert with the latest state. Only the entry ids that were sent are removed after a successful push.
- **Last-write-wins:** the server accepts the latest push per row. Pulls overwrite local rows unless a local change for that row is still pending or failed.
- **Pull:** keyset cursor on `(updated_at, id)`, kept as the server ISO string.
- **Tombstones:** deletes are soft on the server (`deleted_at`) so other devices learn about them. Delete all tombstones rows directly, not through the outbox.
- **Deterministic ids:** seeded exercises use UUID v5 of the name in a per-user namespace, so each account's seed is idempotent and two devices converge. Bodyweight entries use a UUID v5 of the date, so one weigh-in per day converges across devices. Starter templates use UUID v5 of their key in the same per-user namespace.
- **Seeded exercises:** each account gets its own copy of the library on first sync. Built-in exercises can be edited but not hard-deleted.
- **Bodyweight:** stored in kg with 3 decimal places, one entry per date. Future dates are blocked. Delete has a 5-second Undo.
- **Starter templates:** Push Day, Pull Day and Leg Day, added from the welcome sheet or the empty Templates state. Existing templates with the same id are skipped.
- **Settings:** stored as one `user_settings` row (`data` jsonb). Settings writes are last-write-wins as a whole document.
- **Onboarding flag:** `onboardedAt` in the settings document, so the welcome sheet shows once per account across devices.

## Versioning

- `package.json` `version` is the app version. Bump the patch number (for example `1.0.0` to `1.0.1`) on every deploy to `main`.
- `vite.config.ts` injects it as `VITE_APP_VERSION`, and Settings → About shows it.
- The e2e About spec checks that the displayed version equals `package.json`.

## Architecture notes

- All weights are stored in kg. Conversion to lb happens only at the display boundary (`src/lib/units.ts`).
- Components never call Dexie or Supabase directly. They use repos in `src/db/repos/` and the sync engine in `src/sync/`.
- Only `src/sync/**` and `src/lib/supabase.ts` import `@supabase/supabase-js`. Only `src/db/**` and `src/hooks/useLiveQuery.ts` import `dexie`. ESLint enforces both.
- All math lives in `src/lib/calc/` as pure functions with unit tests.
- The active workout autosaves to IndexedDB on every change (debounced to 300 ms).
- The service worker never reloads the app while a workout is in progress. Updates are offered by a toast the user accepts.
- The app shows an error screen with Copy details, Export backup and Reload if rendering fails.
- No analytics and no third-party CDN assets. Network calls go only to Supabase.
- Light and dark themes both pass WCAG 4.5:1 for text. Inputs use at least 16 px font size.

## Deviations from the PRD

The decisions behind these are recorded in [docs/PROGRESS.md](docs/PROGRESS.md) under Decisions.

- **Light accent `#1D4ED8`** (PRD: same accent in both themes). The spec's first choice, `#2563EB`, measured 4.47:1 on `surface-2`, below the 4.5:1 target. Dark theme is unchanged.
- **Lighthouse:** Lighthouse 12 has no PWA category. Installability is checked in DevTools (Manifest, no errors), by the offline e2e spec, and by a manual Lighthouse mobile run on the deployed URL.
- **Open multi-user sign-up** (PRD §19.2 overrides §5.6). Every account is private through RLS.
- **Starter templates are checked by default** in the welcome sheet.
- **Manual sign-in after password reset.** The reset does not sign the user in. This keeps the reset from touching a cached session on the device.
- **Seeded exercise and bodyweight ids** are deterministic UUID v5 values, namespaced per user (D8, D9, Q1, Q3).
- **Deleting all data tombstones rows** rather than hard-deleting them (Q2).
- **Local Dexie never stores deleted rows** (D1). The outbox is append-only (D2). Pull uses a keyset cursor (D4).
- **Settings defaults are not written on first run** (D11).
- **Signing in as a different user wipes the cache.** Signing back in as the same user resumes (D12).
- **Deferred to after v1:** multi-tab active-workout warning, the prompt for workouts open longer than 6 hours, History search and filter, merge import, changing the password while signed in, and deleting the account.

## Manual device checklist

Run before sign-off on an iPhone (iOS 16.4+, installed app) and an Android phone (Chrome).

1. Installs from the Pages URL (iOS Share; Android Install app in About or the browser menu). Icon, name, standalone mode, status bar, and safe areas at the top and above the tab bar are correct.
2. A new account shows the welcome sheet once. Templates and the weigh-in land. A second device does not show it.
3. Forgot password from the installed app. The email link opens in the browser, set a new password, return to the installed app, sign in.
4. Keyboard: a set row near the bottom stays visible; the tab bar does not ride over the keyboard; the same for the bodyweight field.
5. Airplane mode: log a full workout and a weigh-in, force-quit mid-workout, reopen. The Resume banner shows the right elapsed time. Reconnect: data appears on a second device with no duplicates.
6. The rest timer is accurate after 60 s locked. Wake lock works on Android. The chime plays after a tap.
7. Both themes are legible, including charts. Larger system text (Android) does not break the layout.
8. Export (iOS Save to Files), delete all, import: the data is identical afterwards.
9. Swipe delete works on a set and on a weigh-in (iOS).
10. During an active workout, a deployed update shows no reload. After finishing, the update toast appears.
