# Lift — Progress Log

Last updated: 2026-11-13. Branch: `m1-foundation`.

## Done
- Step 0: repo created, PRD moved to docs/PRD.md, Claude Code config (CLAUDE.md, agents, settings, commands).
- Step 0: remote Supabase project `lift` created (ref `pcxohnsjxfbsugajvvpd`, us-east-2, free plan). No migrations applied yet.
- Step 0: master plan approved (docs/PLAN.md, open questions resolved).
- M1 implementation spec (docs/milestones/M1-spec.md), with workbox-window added (`017f086`).
- M1 1.1 scaffold: Vite, React 18, TS strict, Tailwind 3.4, ESLint, Vitest, Playwright (`9058d06`).
- M1 1.2 domain and sync types, units, format, deterministic ids, with tests (`90115d8`).
- M1 1.3 Dexie v1 cache schema, append-only outbox, meta repo, server apply (`732b204`).
- M1 1.4 settings repo via outbox, Zustand store, theme, useLiveQuery (`178ffef`); settings page and sync indicator (`1197e87`).
- M1 1.5 design tokens, base UI components, tab shell, sign-in screen (`4500702`).
- M1 1.6 Supabase config and `0001_init` migration with owner-only RLS (`8e1396d`).
- M1 1.7 owner-only RLS isolation matrix for all tables against local Supabase (`0bcd3d3`).
- M1 1.8 email/password auth, offline cached session, account-switch wipe, app gate (`23746f1`).
- M1 1.9 Supabase client, outbox push with coalescing, keyset pull, sync engine, triggers (`eccb274`).
- M1 1.10 PWA: user-gated update prompt, offline-ready toast, offline e2e (`923ebc5`); manifest, icons, iOS meta (`1dc38ee`).
- M1 1.11 CI and deploy workflows (`1dc38ee`).
- M1 1.12 authenticated acceptance specs: gate, offline, settings sync, account switch (`b40a126`).

## In progress
- M1 review fixes (uncommitted on `m1-foundation`: CI and deploy workflow edits, dist secret guard script, App and AuthGate fixes, settings page changes).
- M1 1.13: README and PROGRESS update (uncommitted).
- M1 merge: PR to `main` after code-reviewer PASS and green `ci` check.
- M1 remote migration push of `0001_init.sql` (P8, needs explicit owner approval) and deploy check on iPhone and Android.
- Step 0 user actions: `.env.local` with the publishable key (P3, user only; Claude is denied `.env*`), Supabase Auth settings (P4), GitHub Pages source and Actions secrets (P6), branch protection on `main` after the first CI run (P7).
- Step 0: Docker Desktop install, see Blocked.

## Blocked
- Local Docker engine: WSL is not installed on the dev machine, so `supabase start` and `npm run test:rls` cannot run locally. RLS and e2e are verified in the CI `integration` job instead (not a required check in M1).
- Owner account creation (P5) and turning off public sign-up on the remote project. Needs the owner in the Supabase dashboard.

## Decisions
- Hosting: public GitHub repo + GitHub Pages (HashRouter, Vite base `/lift/`).
- Local dev DB: Docker Desktop + `npx supabase start`.
- Tailwind v3.4 (matches PRD `tailwind.config` token approach); React 18 per PRD.
- Extra deps: `zod` (import validation), `uuid` (v5 seed IDs), `@vite-pwa/assets-generator` (icons).
- Client key: modern publishable key (`sb_publishable_…`) in `VITE_SUPABASE_ANON_KEY`, not the legacy anon JWT.
- 2026-11-13, PLAN.md §5 decisions, all accepted by the user:
  - Q1: seeded exercise IDs are `uuidv5(name, uuidv5(userId, LIFT_NS))`, so each user has their own namespace.
  - Q2: Delete-all tombstones every row and resets settings, rather than hard-deleting.
  - Q3: the bodyweight ID is `uuidv5(entry_date, userNamespace)`, so a same-date entry from two devices converges.
  - Q4: settings store `weightIncrementLb` and `weightIncrementKg` separately (defaults 5 and 2.5).
  - Q5: `weighted_bodyweight` math uses the added weight only. Sets with 0 added weight count as reps-only.
  - Q6: PR trophy goes only to the best set per category per exercise per workout, and only if it strictly beats all earlier workouts.
  - Q7: an in-progress workout from another device shows as a passive row with Discard and no Resume.
  - Smaller items: §19.2 overrides §5.6 "no signup". Add `soundEnabled` to settings. Server `updated_at` replaces local `updatedAt` on pull. jsonb timestamps stay epoch ms. Booleans are not indexed in Dexie.
- 2026-11-13, M1 spec §0 global decisions:
  - D1: no local tombstones. Dexie never stores deleted rows; `fromRow` returns a `deleted` flag and pull deletes locally.
  - D2: the outbox is append-only; coalescing happens at push time; push deletes only the entry ids it sent.
  - D3: outbox primary key is Dexie auto-increment `++id` (strict FIFO).
  - D4: the pull cursor is a keyset `(updated_at, id)`, kept as the server ISO string, never parsed to a Date.
  - D5: the Supabase client is injected through `LiftClient`. Only `src/lib/supabase.ts` and `src/sync/**` import `@supabase/supabase-js`; only `src/db/**` and `src/hooks/useLiveQuery.ts` import `dexie` (enforced by ESLint).
  - D6: no `dexie-react-hooks`. A local `useLiveQuery` wraps Dexie's `liveQuery`; Zustand stores subscribe through `observeX()` repo functions.
  - D7: only the main session changes dependencies. Agents never edit `package.json` dependencies.
  - D8: deterministic ids live in `src/lib/ids.ts` (pure, uuid v5).
  - D9: global `uuid primary key` stays. A deliberate cross-user collision fails RLS with 42501, and the RLS suite asserts this.
  - D10: `user_settings` keeps the PRD shape (no id, created_at or deleted_at); its pull keyset is `(updated_at, user_id)`.
  - D11: settings defaults are not persisted on first run. `getSettings()` returns stored settings or defaults; only `updateSettings` writes and enqueues.
  - D12: an involuntary sign-out keeps the cache and outbox, and the same user resumes. Signing in as a different user wipes everything first, and the sign-in screen warns if the outbox is non-empty.
- 2026-11-13, M1 spec answers:
  - Q-A: `fake-indexeddb` (dev) and `workbox-window` approved and installed.
  - Q-B: the in-app password-reset flow is deferred to M9. Until then, use the Supabase dashboard.
  - Q-C: when a different account signs in, unsynced changes left by a revoked session are discarded after a warning (D12).
  - Q-D: the CI `integration` job (local Supabase in GitHub Actions) is accepted, but is not a required check in M1.
- 2026-11-13, implementation notes:
  - Settings validation throws `RangeError`; only `defaultRestSeconds` is clamped.
  - Light theme = absence of the `dark` class on `<html>`.
  - `SyncReason` includes `'offline'`.
- Defaults per PRD §16: lb, blue accent `#4F8CFF`, name "Lift".
