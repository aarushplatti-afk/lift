# Lift — Progress Log

Last updated: 2026-11-14. Branch: `m4-timer-polish`.

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

- M1 review fixes and 1.13 docs; code-reviewer blockers all resolved; CI green (141 unit, 52 RLS + 1 skipped, 8 e2e).
- M1 merged to `main` (PR #1) and deployed to https://aarushplatti-afk.github.io/lift/.
- Branch protection on `main`: required `ci` check, no force-push, no deletion (P7).
- GitHub Pages source = Actions; secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set (P6).
- 2026-11-13: remote migration `0001_init` applied with owner approval (P8, version `20261114022326`; local file renamed to match). Security advisor: only "leaked password protection disabled" (dashboard toggle). `src/types/database.ts` now generated from the remote schema.
- `.env.local` created (P3). Owner created their account in the dashboard and set Auth URLs (P4, P5 part 1).
- Setup screen now shows the sync error instead of silently retrying (the first sign-in hung on "Setting up…" because the tables did not exist yet; logs showed 404 on `/rest/v1/exercises`).

- M1 device check passed on the owner's phone (install, settings persistence, offline relaunch, resync).
- M2 Exercise library (branch `m2-exercises`, PR #3, spec docs/milestones/M2-spec.md):
  - 2.1 exercises repo + helpers: normalized names, folded search, dedupe inside the write tx, archive vs delete, restore (`6656219`).
  - 2.2/2.3a seed data (98 exercises, `SEED_VERSION` 1) and idempotent per-user `ensureSeeded` (`4abf90a`, `6ad892b`).
  - 2.3b engine seeds after a successful push+pull, before `initialPullDone`; two-device convergence tests (`045ef4a`).
  - 2.4 UI kit: SearchInput, Chip/ChipGroup, ListRow, BottomSheet, Select, TextArea, useFocusTrap (`a8c17e6`).
  - 2.5 ExerciseForm + filter bar (`1b89279`); Exercises tab list/detail/form screens (`5e349c9`).
  - 2.6 ExercisePicker sheet (`c43b12d`). 2.7 e2e: seed count, create/delete sync, second device (CI).
  - Review fixes: clearing notes saves; archived rows editable despite a live same-name row; a seed failure no longer blocks setup.

- M2 merged (PR #3) and deployed. The owner moved on to M3 ("good to go").
- 2026-11-13: WSL2 + Docker working locally. `npx supabase start` applies `0001_init`. `npm run test:rls` (52 passed + 1 skipped) and `npm run e2e:local-supabase` now run on the dev machine.
- M3 Active workout core (branch `m3-active-workout`, spec docs/milestones/M3-spec.md):
  - 3.1 calc: set validation, Epley e1RM, volume, PR flags (Q5/Q6/U1/U2), finish cleanup, workoutOps transforms, duration and format helpers (`677f916`).
  - 3.2 workouts repo (meta `activeWorkoutId`, pull skips the active workout) and active-workout store: 300 ms Dexie save, 5 s non-resetting enqueue, flush on hidden/pagehide/unmount (`d302858`).
  - 3.3 SetRow, NumberInput, set table (`cc26380`). 3.4/3.5 workout home, active screen, exercise cards, mini-bar, finish flow, summary (`df5617e`).
  - Review fixes: finish/discard persist pending edits; name and notes saved per keystroke; Undo scoped to its workout; 44 px set inputs (`e60cb73`, `5f0183b`).
  - 3.6 e2e: reload/resume, offline round trip, second-device passive row; 12/12 auth e2e green locally (`fafacbd`).

- M3 merged (PR #4), deployed, and confirmed on the owner's phone (2026-11-14).
- M4 Rest timer + polish (branch `m4-timer-polish`, spec docs/milestones/M4-spec.md):
  - 4.1 previous-set lookup (T6), badge labels (T5), formatPreviousSet, setSetType/setRestSeconds, batch previous-workout query, rest-timer meta snapshot (`119e884`).
  - 4.3 platform helpers: wake lock, haptics, generated WebAudio chime (`a03d7b4`). 4.4a Toggle, Stepper, SwipeRow (`efaa4c3`).
  - 4.2 timestamp-based rest timer store with reload restore and silent late completion (T2/T3); M3 follow-ups: updatePrompt `hydratedOnce` reset, hydrate generation counter (`d529d10`).
  - 4.4b previous column with tap-fill, set-type sheet, swipe delete, RestTimerBar, per-exercise rest, wake lock on the workout screen, Workout settings section (`2d60ce6`).
  - Review fix: the timer re-arms if its timeout fires before the wall clock reaches `endsAt` (`a8c861d`).

## In progress
- M4 merge + deploy, then owner device check. E2E found that the store could report "ready" before the workout loaded (reload redirected home and dropped the rest timer); fixed by waiting for the latest hydrate. 14/14 e2e and 585 unit tests green locally.
- Known exception to "no unused exports": `pickPreviousWorkout`, `setGroup`, `SetGroup` and `RestPhase` are spec contracts used only in tests or inside their own module.

## Blocked
- Turn off "Allow new users to sign up" in Supabase Auth (owner, dashboard).

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
- 2026-11-13, M2 decisions (chosen under the owner's blanket authorization; reversible):
  - Built-in exercises: muscle group, equipment and notes editable; name and type locked; never hard-deleted.
  - A custom exercise's type locks once it has been logged.
  - The seed library is 98 exercises (PRD §10's 69 plus 29 common additions).
  - E1–E7 in M2-spec §0 (no schema change; name normalization; collator sort; seeding skips names the user already has).
- 2026-11-13, M3 decisions (accepted architect defaults under the owner's blanket authorization; reversible):
  - U1: bodyweight-reps exercises earn a max-reps PR, and duration exercises a longest-set PR.
  - U2: the first-ever logging of an exercise gets no trophy.
  - U3: finishing with nothing incomplete saves without a confirmation.
  - U4: default workout name depends on time of day ("Morning Workout" etc.).
  - U5: the device that owns an in-progress workout wins over a remote discard.
  - W1–W8 in M3-spec §0. The >6 h end-time prompt (P1, 3.5b) is deferred. The multi-tab active-workout warning (P1) is deferred to M10.
- 2026-11-14, M4 decisions (accepted architect defaults; reversible):
  - The rest timer survives a reload (Dexie meta snapshot).
  - Badge numbers count normal sets only (1, 2, D, 3).
  - A timer that ends while the phone is locked, or more than 5 s late, completes silently.
  - Tap-to-fill is off for completed rows.
  - PREVIOUS matches warm-ups with warm-ups and working sets with working sets, per block.
  - Haptics toggle is hidden when unsupported; keep-awake is disabled when unsupported.
  - No manual timer start; the weight-increment setting is deferred; sound is on by default.
- Defaults per PRD §16: lb, blue accent `#4F8CFF`, name "Lift".
