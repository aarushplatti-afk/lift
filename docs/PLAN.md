# Lift: Master Build Plan

Source of truth is `docs/PRD.md`. Where they differ, §19 (Supabase) overrides earlier "local only" wording. Progress is tracked in `docs/PROGRESS.md`. This plan maps PRD §13 milestones 1–10 to tasks and agents. Each milestone gets a detailed per-milestone plan from `architect` at its start.

**Status:** DRAFT, awaiting user approval. §5 open questions Q1–Q7 were resolved by the user on 2026-11-13; every proposal was accepted.

---

## 1. Overview and global conventions

**Architecture.** Components talk to Zustand stores and to repos in `src/db/repos/`. Repos write to Dexie (the cache) and add an outbox entry in the same transaction. `src/sync/` pushes and pulls between Dexie and Supabase. Dexie live queries drive the UI. All math lives in `src/lib/calc/` and is pure. Weights are stored in kg, and conversion happens only in `src/lib/units.ts`.

**Branching.** Each milestone gets one branch, `m<N>-<slug>`, cut from the latest `main`. Every completed task gets a conventional commit (`feat:`, `fix:`, `test:`, `chore:`, `docs:`). At the end of the milestone, open a PR to protected `main`. Merge only after `code-reviewer` gives PASS and CI is green. Never force-push.

**Milestone loop (§18.5).**
1. `architect` writes the milestone plan. It confirms the contracts and lists any new questions.
2. The main session delegates the builder tasks in dependency order, naming the agent, the PRD sections and the files.
3. After each agent finishes, the main session runs `npm run typecheck && npm run lint && npm run test` itself.
4. `qa-engineer` writes and runs the RTL and e2e tests for the milestone.
5. `code-reviewer` (opus, read-only) reviews `git diff main...HEAD`.
6. Builders fix blockers, and review repeats until PASS.
7. `scribe` updates `docs/PROGRESS.md`.
8. Commit, PR, merge, deploy, then the deploy check on a phone.

**Two-strikes rule.** If a task fails verification twice, re-plan it with `architect` or move it to Opus. Do not try a third time on the same model.

**Verification gate (every task).** typecheck, lint and tests pass. New logic has tests. UI works at 390px in dark and light themes. No `any`, no unused exports, no commented-out code. `PROGRESS.md` is updated.

**Migration rule.** Schema changes go only through `supabase/migrations/*.sql`, created with `npx supabase migration new`. Run them locally first (`npx supabase db reset`, then the RLS tests). `supabase db push` or MCP `apply_migration` against the remote project needs the user's explicit approval every time, and the reviewer must re-verify RLS on every schema change.

**Parallelism.** Two agents may run at once only if they edit strictly disjoint directories, and only after the contract files for that milestone have merged into the branch. Never run two agents on `src/types/`, `src/db/schema.ts` or `tailwind.config.ts` at the same time.

**User check-ins.** Stop and report after milestones 1, 3, 6, 8 and 10. Each report gives a short summary, the deployed URL (`https://<user>.github.io/lift/`) and a phone test checklist. Every other milestone still ends deployable and needs the user's on-device confirmation before the next one starts (§18.7 Step 1).

---

## 2. Prerequisites (rest of Step 0, user actions)

| # | Action | Status | Blocks |
|---|---|---|---|
| P1 | Install Docker Desktop (WSL2 backend) and confirm `docker info` works. | Todo | M1 tasks 1.6 to 1.9 (local stack, migrations, RLS tests) |
| P2 | Create the Supabase project. | **Done**: `lift`, ref `pcxohnsjxfbsugajvvpd`, us-east-2, free plan | M1 remote deploy |
| P3 | Put the project URL and publishable key into `.env.local`. Never use the service-role key. | Todo (user; Claude is denied `.env*`) | M1 task 1.10 |
| P4 | Auth settings: enable email+password, set Site URL and redirect allow-list to the Pages origin and `http://localhost:5173`. | Todo | M1 sign-in |
| P5 | Create the single owner account (dashboard → Auth → Add user), then turn off "Allow new users to sign up". | Todo | M1 deploy check |
| P6 | GitHub: Settings → Pages → Source = GitHub Actions. Add Actions secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. | Todo | M1 deploy |
| P7 | After the first CI run exists, protect `main`: require the PR, require the `ci` status check, block force-push. | Todo | M1 merge |
| P8 | Approve the first remote migration push (`0001_init.sql`). | Todo | M1 deploy check |

---

## 3. Milestones

### M1: Foundation and Supabase. Branch `m1-foundation`

**Goal.** An installable, offline-capable app shell on GitHub Pages at `/lift/`. It has email/password sign-in with a persistent session, a Dexie cache with an outbox, a working sync skeleton (push, pull and status) and a deployed `0001_init.sql` with RLS. Settings sync end to end as the first real record type.

**Contracts that must land first (tasks 1.2 and 1.3, before any parallel work):**
- `src/types/domain.ts` defines `Exercise`, `Workout`, `WorkoutExercise`, `WorkoutSet`, `SetType`, `Template`, `TemplateExercise`, `BodyweightEntry` and `Settings` as in §4. Each synced type adds `userId: string; updatedAt: number; deletedAt?: number`. Add `createdAt` to `Workout` to match the SQL. Settings get a local `id: 'singleton'`.
- `src/types/sync.ts` defines:
  - `SyncTable = 'exercises'|'workouts'|'templates'|'bodyweight_entries'|'user_settings'`
  - `OutboxEntry { id; table: SyncTable; recordId; op: 'upsert'|'delete'; payload; createdAt; attempts; lastError?; state: 'pending'|'failed'; nextAttemptAt }`
  - `SyncState { table; lastPulledAt: string /* ISO server time */ }`
  - `SyncStatus { state: 'synced'|'syncing'|'offline'|'error'; pendingCount; failedCount; lastSyncedAt? }`
- `src/db/repos/outbox.ts` provides `enqueue(tx, table, recordId, op, payload): Promise<void>`. This is the only way repos record changes.
- `src/sync/mappers.ts` provides `toRow<T>(table, record)` and `fromRow<T>(table, row)` for camelCase to snake_case and epoch ms to ISO. Nested jsonb (exercises and sets) keeps epoch ms unchanged.

**Tasks**

| # | Task | Agent | PRD | Key files |
|---|---|---|---|---|
| 1.1 | Scaffold Vite, React 18, TS strict, Tailwind 3.4, ESLint/Prettier, Vitest+RTL, Playwright. npm scripts per CLAUDE.md. `base: '/lift/'`. | pwa-engineer | §2, §14 | `package.json`, `vite.config.ts`, `tsconfig*.json`, `.eslintrc.cjs`, `vitest.config.ts`, `playwright.config.ts` |
| 1.2 | Domain and sync types (the contracts above), plus `src/lib/units.ts` (`lbToKg`, `kgToLb`, `toDisplay`, `fromDisplayInput` with `,` to `.` normalisation and 4-dp kg rounding) and `src/lib/format.ts` (`formatWeight`). Unit tests for round trips (135 lb shows as 135). | data-engineer | §4, §6.7, §11 | `src/types/`, `src/lib/units.ts`, `src/lib/format.ts` |
| 1.3 | Dexie `version(1)`: `exercises`, `workouts`, `templates`, `bodyweight` (`&date`), `settings`, `syncQueue` (`id, [table+recordId], state, nextAttemptAt`), `syncState`, `meta` (owner userId, seed flags). Add a migration test stub with fixture data. Do not index booleans (see R6). | data-engineer | §4.6, §9.2, §19.5 | `src/db/schema.ts`, `src/db/repos/outbox.ts`, `src/db/__tests__/` |
| 1.4 | Settings repo (`getSettings`, `updateSettings(patch)`, defaults per §4.5/§16) and Zustand `useSettingsStore` (hydrated from a Dexie liveQuery). Theme application for dark, light and system. | data-engineer | §4.5, §5.5 | `src/db/repos/settings.ts`, `src/store/settings.ts` |
| 1.5 | Design tokens (§8.2) as CSS variables plus Tailwind theme. Base UI: Button, IconButton, Card, Header, TabBar, Toast, Dialog. HashRouter with 4 tab routes plus a Settings stub. Safe-area insets, `touch-action: manipulation`, 16px inputs, tabular numerals. Sign-in screen UI. | ui-builder | §3, §8, §5.7 | `tailwind.config.ts`, `src/styles/`, `src/components/ui/`, `src/routes/*`, `src/App.tsx` |
| 1.6 | `npx supabase init`, plus `0001_init.sql` per §19.3. Additions: `revoke all ... from anon` on every table, a `check (weight_kg ...)` review, and Q1/Q3 decisions applied. Generate types into `src/types/database.ts`. Run advisors. | supabase-engineer | §19.3, §19.6 | `supabase/config.toml`, `supabase/migrations/`, `src/types/database.ts` |
| 1.7 | RLS isolation tests: two users plus anon, select/insert/update/delete on all 5 tables, against the local stack. | supabase-engineer | §19.7 | `tests/rls/rls.test.ts`, `vitest.rls.config.ts` (`npm run test:rls`) |
| 1.8 | Auth module. `src/lib/supabase.ts` is the client (`persistSession`, `autoRefreshToken`). `src/sync/auth.ts` provides `signIn`, `signOut({discardUnsynced})`, `getCachedSession` and `onAuthChange`. The app opens offline when a cached session exists. Switching account wipes the cache. Auth gate in `App.tsx`. | supabase-engineer | §19.2 | `src/lib/supabase.ts`, `src/sync/auth.ts`, `src/store/auth.ts` |
| 1.9 | Sync engine skeleton: `push()` (coalesce, then idempotent upsert or soft delete), `pull()` (per-table cursor, 500/page, tombstones, local-pending-wins), `syncNow()`, triggers (start, visible, online, 2 s after write) and `useSyncStatus`. Full backoff and failure UI come in M9, but entries are already never dropped. Unit tests for coalescing, the cursor, tombstones and pending-wins. | supabase-engineer | §19.4 | `src/sync/engine.ts`, `src/sync/push.ts`, `src/sync/pull.ts`, `src/sync/triggers.ts`, `src/store/sync.ts` |
| 1.10 | PWA: vite-plugin-pwa with `registerType: 'prompt'`, the manifest (`start_url`/`scope` `/lift/`), iOS meta, icons via `@vite-pwa/assets-generator`, and an update toast gated by an `isWorkoutActive()` stub. | pwa-engineer (icons by scribe) | §5.7, §9.5 | `vite.config.ts`, `index.html`, `public/icons/`, `src/pwa/updatePrompt.ts` |
| 1.11 | CI (`ci.yml`: typecheck, lint, test, build) and deploy (`deploy.yml`: build with secrets, upload-pages-artifact, deploy-pages). | pwa-engineer | §14 | `.github/workflows/` |
| 1.12 | Integration tests: sign-in gate, offline reopen with a cached session, settings round trip to the local Supabase, SW offline load (Playwright, 390x844). | qa-engineer | §12, §19.7 | `e2e/`, `src/**/__tests__/` |
| 1.13 | Update README (dev, env, Docker, migrations) and PROGRESS.md. | scribe | §14 | `README.md`, `docs/PROGRESS.md` |

**Order and parallelism.**
1. Task 1.1 first, then 1.2 and 1.3 (contracts).
2. Then run in parallel: 1.4 (`src/db/repos`, `src/store/settings`), 1.5 (`src/components`, `src/routes`, `src/styles`, tailwind) and 1.6/1.7 (`supabase/`, `tests/rls`).
3. Then 1.8, then 1.9.
4. 1.10 and 1.11 can run alongside 1.8 and 1.9 (they touch `vite.config.ts` and `.github`, not `src/sync`).
5. Last: 1.12, then 1.13.

**Exit and deploy check.**
- On iPhone and Android: installs from the Pages URL, opens standalone, signs in, survives airplane-mode relaunch, theme switch works.
- A settings change appears in `user_settings` on the remote project.
- The RLS suite is green locally.
- **User check-in.**

### M2: Exercise library. Branch `m2-exercises`

**Goal.** A seeded, idempotent library with list, search and filter, create/edit, archive or delete, and a multi-select picker. Every write goes through the outbox.

**Contracts first (2.1).** `src/db/repos/exercises.ts`:
- `listExercises({ includeArchived?, query?, muscleGroup? })` (live)
- `getExercise(id)`
- `createExercise(input)`
- `updateExercise(id, patch)`
- `isExerciseUsed(id)`
- `deleteOrArchiveExercise(id): 'deleted'|'archived'`
- `restoreExercise(id)`
- `isNameTaken(name, excludeId?)`

**Tasks**

| # | Task | Agent | PRD | Key files |
|---|---|---|---|---|
| 2.1 | Exercises repo plus tests. Duplicate checks are case-insensitive and cover non-archived only. Hard delete means a local delete plus an outbox `delete` (server tombstone). Restore is blocked if the name now collides. Seeded exercises can never be hard-deleted. | data-engineer | §4.1, §5.4.3–4, §11 | `src/db/repos/exercises.ts` |
| 2.2 | Seed list (~90 exercises from §10) as data. | scribe | §10 | `src/db/seedData.ts` |
| 2.3 | `seedExercises(userId)`: UUID v5 IDs (per Q1), idempotent by ID and by lower(name), runs after first sign-in and when the server has no seeded rows. Two-device convergence test. | data-engineer, then supabase-engineer for the sync hook | §10, §19.4 | `src/db/seed.ts`, `src/sync/engine.ts` |
| 2.4 | UI pieces: SearchInput, Chip/ChipGroup, ListRow, EmptyState, BottomSheet. | ui-builder | §8.4 | `src/components/ui/` |
| 2.5 | Exercises tab: list, search, muscle chips, "Show archived", Exercise Detail shell (history and records placeholders), create/edit form with inline duplicate error, delete/archive confirm. | ui-builder | §5.4.1–4 | `src/routes/ExercisesTab/` |
| 2.6 | ExercisePicker sheet: search, chips, multi-select, "Add (N)", create-new shortcut. Returns `string[]`. | ui-builder | §5.4.2 | `src/components/workout/ExercisePicker.tsx` |
| 2.7 | RTL tests for list filtering, the duplicate name error, archive vs delete, and picker multi-select. | qa-engineer | §12 | `src/routes/ExercisesTab/__tests__/` |

**Order and parallelism.** Run 2.1 and 2.2 in parallel (disjoint files), along with 2.4. Then 2.3. Then run 2.5 and 2.6 in parallel (disjoint dirs). Then 2.7.

**Exit.** The library seeds once on two browsers with no duplicates on the server. CRUD works offline and syncs.

### M3: Active workout core. Branch `m3-active-workout`

**Goal.** Start an empty workout, add exercises, log sets, complete them, autosave and resume, run the finish flow and see the summary.

**Contracts first (3.1 and 3.2).**
- `src/db/repos/workouts.ts`:
  - `startWorkout(init?): Workout`
  - `getActiveWorkout()` (live)
  - `saveActiveWorkout(w)`
  - `finishWorkout(w): Workout`
  - `discardWorkout(id)`
  - `listCompletedWorkouts()`
  - `getWorkout(id)`
- `src/store/activeWorkout.ts` (Zustand) holds the in-memory workout. Actions: `addExercises`, `removeExercise`, `moveExercise`, `addSet`, `updateSet`, `toggleComplete`, `removeSet`, `rename`. It persists through a debounced (300 ms) `saveActiveWorkout`, with `flush()` on `visibilitychange:hidden` and `pagehide`. Server push of in-progress workouts is debounced to about 5 s (§19.4).
- Calc: `src/lib/calc/volume.ts` (`setVolume`, `exerciseVolume`, `workoutVolume`, `EXCLUDED_SET_TYPES`), `src/lib/calc/e1rm.ts` (`epley`), `src/lib/calc/prs.ts` (`computePRFlags(workout, priorWorkouts, exerciseTypes)`), `src/lib/calc/finish.ts` (`prepareFinish(w) → { incompleteCount, cleaned, isEmpty }`), `src/lib/calc/validation.ts` (`canCompleteSet(set, type)`, soft caps of 2000 for weight and 999 for reps).

**Tasks**

| # | Task | Agent | PRD | Key files |
|---|---|---|---|---|
| 3.1 | Calc functions above, plus exhaustive tests: ties, warmups, reps > 12, reps = 1, invalid input, and §11 blank/zero rules per type. | data-engineer | §6.1–6.3, §11 | `src/lib/calc/` |
| 3.2 | Workouts repo plus the active workout store, autosave, flush and the elapsed timer (`Math.max(0, now - startedAt)`). Wire `isWorkoutActive()` into the PWA update gate. | data-engineer | §2.1, §4.2, §9.2, §19.4 | `src/db/repos/workouts.ts`, `src/store/activeWorkout.ts`, `src/pwa/updatePrompt.ts` |
| 3.3 | NumberInput (decimal or numeric inputmode, select on focus, `,` normalisation) and the SetRow (§8.5) adapting columns to ExerciseType. Completing a blank set shakes the row. | ui-builder | §5.1.3, §8.5, §11 | `src/components/ui/NumberInput.tsx`, `src/components/workout/SetRow.tsx` |
| 3.4 | ActiveWorkout screen: sticky header, ExerciseCard with an overflow menu (remove, move, note), add set with prefill from the previous set, add exercise through the picker, cancel confirm, tab bar hidden. Resume banner and mini-bar. | ui-builder | §5.1.1–5.1.3 | `src/routes/WorkoutTab/`, `src/components/workout/` |
| 3.5 | Finish flow dialogs (incomplete sets, empty workout) and the Summary screen (duration, volume, sets, PRs). Over-6h end-time prompt (P1, optional). | ui-builder | §5.1.3 | `src/routes/WorkoutTab/Summary.tsx` |
| 3.6 | RTL tests for SetRow, add-set prefill and the finish flow. Playwright: force-close mid-workout (reload), then the resume banner shows the correct elapsed time. Offline workout ends synced. | qa-engineer | §7 A/B, §12 | `e2e/active-workout.spec.ts` |

**Order and parallelism.** Run 3.1 and 3.3 in parallel (`src/lib/calc` vs `src/components`). Then 3.2. Then 3.4. Then 3.5. Then 3.6.

**Exit.** Flow B (without Save as Template) works on the phone, including a kill-and-relaunch mid-workout. The workout row reaches Supabase with correct jsonb. **User check-in.**

### M4: Rest timer and polish. Branch `m4-timer-polish`

**Contracts first.**
- `src/lib/calc/previous.ts`: `previousSetFor(exerciseId, setIndex, setType, completedWorkouts)`.
- `src/store/restTimer.ts`: `{ endsAt?, durationSec, start(sec), adjust(±15), skip() }`. The timer is timestamp-based (§5.1.3).
- `src/lib/platform/`: `wakeLock.ts`, `haptics.ts` (feature-detected, hidden on iOS) and `chime.ts`.

| # | Task | Agent | PRD | Key files |
|---|---|---|---|---|
| 4.1 | `previousSetFor` plus tests (warmup lookup, fewer sets gives "—", non-warmup ordering). Repo selector `getLastCompletedWithExercise(exerciseId)`. | data-engineer | §6.5 | `src/lib/calc/previous.ts`, `src/db/repos/workouts.ts` |
| 4.2 | Rest timer store, recompute on visibilitychange, and tests with fake timers, including a simulated lock. | data-engineer | §5.1.3 | `src/store/restTimer.ts` |
| 4.3 | Platform helpers: wake lock re-acquired on visible, vibration, chime after a user gesture. | pwa-engineer | §5.1.3, §9.4–9.5 | `src/lib/platform/` |
| 4.4 | RestTimerBar, PREVIOUS column with tap-to-fill, set type badge menu, SwipeRow with undo toast, per-exercise rest override. | ui-builder | §5.1.3, §8.4 | `src/components/workout/`, `src/components/ui/SwipeRow.tsx` |
| 4.5 | RTL tests for swipe delete and undo, previous fill, and the timer starting on completion. | qa-engineer | §12 | tests |

**Parallelism.** 4.1 and 4.2 (data-engineer, in sequence) can run alongside 4.3 (`src/lib/platform`). Then 4.4. Then 4.5.

**Exit.** The timer stays accurate after 60 s with the screen locked on iPhone. Wake lock works on Android.

### M5: Templates. Branch `m5-templates`

**Contracts first.** `src/db/repos/templates.ts`:
- `listTemplates()`, `getTemplate(id)`
- `saveTemplate(t)`, `duplicateTemplate(id)`, `deleteTemplate(id)`
- `templateFromWorkout(w): Template`
- `workoutInitFromTemplate(t): WorkoutInit`, which also bumps `lastUsedAt`

| # | Task | Agent | PRD | Key files |
|---|---|---|---|---|
| 5.1 | Templates repo and transforms plus tests. Deleting a template does not touch workouts. Targets prefill weight and reps but stay uncompleted. | data-engineer | §4.3, §5.1.4, §11 | `src/db/repos/templates.ts`, `src/lib/templates.ts` |
| 5.2 | Template list on Workout home (summary "Bench, Incline DB, +3"), preview sheet, duplicate and delete, template editor reusing ExerciseCard and SetRow in `mode="template"`, Save as Template from the Summary. | ui-builder | §5.1.1, §5.1.4 | `src/routes/WorkoutTab/Templates/`, `src/components/workout/` |
| 5.3 | Playwright Flow A: template, start, log, finish, history entry (the history list stub is fine). | qa-engineer | §7 A | `e2e/flow-a.spec.ts` |

**Exit.** Flow A works on the phone.

### M6: History. Branch `m6-history`

**Contracts first.**
- `src/lib/calc/prs.ts`: `recomputePRsForExercise(exerciseId, workouts): Map<workoutId, Workout>`, which processes chronologically by `startedAt` and returns only the changed workouts.
- Repo: `updateCompletedWorkout(w)` and `deleteWorkout(id)`. Both call recompute for the affected exercises and write every changed workout in one Dexie transaction plus outbox entries.

| # | Task | Agent | PRD | Key files |
|---|---|---|---|---|
| 6.1 | Recompute plus tests: an edit that lowers a PR, deletion of the PR workout, a date change that reorders workouts, ties. | data-engineer | §6.3.3, §11 | `src/lib/calc/prs.ts`, `src/db/repos/workouts.ts` |
| 6.2 | `src/lib/calc/history.ts`: `groupByMonth` (local timezone) and `workoutStats`. Tests include a DST boundary. | data-engineer | §5.2, §11 | `src/lib/calc/history.ts` |
| 6.3 | History list, Workout Detail (read-only), Edit (reuses the editor including date and time), Delete confirm, Save as Template, Repeat Workout. Fill in the Exercise Detail History tab. | ui-builder | §5.2, §5.4.1 | `src/routes/HistoryTab/` |
| 6.4 | RTL and e2e tests: editing a past workout updates PR badges, and delete removes the workout from the list and syncs a tombstone. | qa-engineer | §12 | tests |

**Exit.** History is correct across 2 devices after sync. **User check-in.**

### M7: Progress, exercises. Branch `m7-progress-exercises`

**Contracts first.** `src/lib/calc/series.ts`:
- `exerciseSeries(exerciseId, workouts, metric: 'weight'|'e1rm'|'volume'|'reps', exerciseType) → Point[] { t, valueKg, workoutId, set }`
- `filterRange(points, range, now)`
- `rangeStats(points)` returning best, change in absolute and %, count and last
- `downsample(points, max = 500)`

| # | Task | Agent | PRD | Key files |
|---|---|---|---|---|
| 7.1 | Series, range and stats functions plus tests (0, 1 and many points, fallback when fewer than 2, warmups excluded). | data-engineer | §5.3.1, §6.6 | `src/lib/calc/series.ts`, `src/lib/calc/range.ts` |
| 7.2 | Progress tab shell with SegmentedControl, ExerciseSelector (trained exercises first, default most recent), MetricChips, RangeSelector, LineChart wrapper with touch tooltip showing "225 lb × 5", StatCards, recent sessions linking to the detail, empty and single-point states. Lazy-load the route and code-split Recharts. Compact chart in Exercise Detail plus the Records tab. | chart-builder | §5.3.1, §8.6, §9.1 | `src/routes/ProgressTab/`, `src/components/charts/` |
| 7.3 | Playwright Flow C. | qa-engineer | §7 C | `e2e/flow-c.spec.ts` |

**Parallelism.** `scribe` can generate a large fixture dataset (`src/test/fixtures/`, 2000 sets) while 7.1 runs.

**Exit.** Flow C works on the phone in both themes. The 2000-point chart has no lag.

### M8: Progress, bodyweight. Branch `m8-bodyweight`

**Contracts first.**
- `src/db/repos/bodyweight.ts`: `listEntries()`, `upsertForDate(date, weightKg, note?)`, `deleteEntry(id)`, `getLatest()`.
- `src/lib/calc/trend.ts`: `ewma(entries, alpha = TREND_ALPHA)` with gap-scaled alpha.
- `src/lib/dates.ts`: `todayLocal()` returns `'YYYY-MM-DD'`.

| # | Task | Agent | PRD | Key files |
|---|---|---|---|---|
| 8.1 | Repo (upsert by date per Q3, a soft delete then re-log on the same date works) plus EWMA tests (gaps, first point) plus stats (min, max, average, change). Client validation is 0 < kg < 700 to match the SQL check. | data-engineer | §4.4, §6.4, §11 | `src/db/repos/bodyweight.ts`, `src/lib/calc/trend.ts` |
| 8.2 | Bodyweight view: log card (prefilled, date picker), chart with dots, bold trend line and dashed goal, neutral-colour stats, entries list with swipe delete and tap edit. Goal setting in Settings. | chart-builder (UI pieces reuse ui components) | §5.3.2, §8.6 | `src/routes/ProgressTab/Bodyweight/` |
| 8.3 | PRs view (P1), grouped by exercise with a muscle filter. | chart-builder | §5.3.3 | `src/routes/ProgressTab/PRs/` |
| 8.4 | Playwright Flow D (same-day upsert). | qa-engineer | §7 D | `e2e/flow-d.spec.ts` |

**Exit.** Flow D works on the phone. A same-date entry from 2 devices converges to one row. **User check-in.**

### M9: Sync hardening and data tools. Branch `m9-sync-data`

**Contracts first.**
- `src/lib/export.ts`: `exportAll(): LiftBackup`, `backupSchema` (zod), `parseBackup(json): Result<LiftBackup>`, `toCsv(workouts, exercises, unit)`.
- `src/sync/dataOps.ts`: `importReplace(backup)`, `deleteAllData()`.
- `src/sync/retry.ts`: `classifyError(e): 'retryable'|'permanent'` and `nextDelay(attempts)` (2 s, 5 s, 15 s, 60 s, capped at 300 s).

| # | Task | Agent | PRD | Key files |
|---|---|---|---|---|
| 9.1 | Backoff, error classification, failed state with Retry/Discard, 401 refresh, a stale-outbox warning (over 24 h), status indicator. Tests: idempotent replay, backoff, permanent vs retryable. | supabase-engineer | §19.4, §19.7, §19.8 | `src/sync/` |
| 9.2 | Two-device simulation (two Dexie instances via fake-indexeddb against the local stack). Converging edits, seeds without duplicates, local-pending-wins. | supabase-engineer | §19.7 | `tests/sync/two-device.test.ts` |
| 9.3 | Export JSON and CSV, zod import validation (validate fully before touching data), import summary. Tests use malformed fixtures. | data-engineer | §5.5, §9.2 | `src/lib/export.ts`, `src/lib/csv.ts` |
| 9.4 | Import Replace (online only, tombstone then insert through the repos) and Delete All (online only, per Q2). Sign-out with an unsynced-changes block. | supabase-engineer | §19.5, §19.2 | `src/sync/dataOps.ts`, `src/sync/auth.ts` |
| 9.5 | Settings: Account & Sync detail, Data section with typed "DELETE" double confirm, storage estimate, `navigator.storage.persist()` request after the first workout plus a gentle note, quota-exceeded blocking dialog with Export. | ui-builder (persist helper by pwa-engineer) | §5.5, §11 | `src/routes/SettingsPage/`, `src/lib/platform/storage.ts` |
| 9.6 | Playwright: Flow E roundtrip, the offline e2e from §19.7 (verify rows in local Supabase), expired token offline, account switch wipes the cache. | qa-engineer | §7 E/F, §19.7 | `e2e/` |

**Parallelism.** 9.1 and 9.2 (`src/sync`, `tests/sync`) can run alongside 9.3 (`src/lib/export.ts`, `src/lib/csv.ts`). Then 9.4. Then 9.5. Then 9.6.

**Exit.** Flow E is exact, including settings and isPR flags. Airplane-mode workout syncs with no duplicates. `code-reviewer` focuses on data-loss paths.

### M10: Hardening. Branch `m10-hardening`

| # | Task | Agent | PRD | Key files |
|---|---|---|---|---|
| 10.1 | Onboarding sheet (units, bodyweight, install instructions), starter PPL templates (P1), Android install button, backup nudge after 30 days (P1). | ui-builder, then pwa-engineer for the install prompt | §5.6, §5.7, §9.5 | `src/routes/Onboarding/` |
| 10.2 | Accessibility pass: labels, focus, contrast at 4.5:1 in both themes, 130% text, reduced motion. | ui-builder | §8.8 | across `src/components` |
| 10.3 | Performance: bundle under 250 KB gzipped (`rollup-plugin-visualizer` only if approved), Lighthouse PWA and Performance of 90 or more, keyboard and viewport handling on iOS. | pwa-engineer | §9.1, §9.5 | `vite.config.ts` |
| 10.4 | Full e2e suite (A, C, D, E, F, offline, force-close) green in CI. Manual device checklist (§12) handed to the user. | qa-engineer | §12, §17 | `e2e/` |
| 10.5 | README (setup, deploy, install, backup, schema and migrations, deviations). Version bump shown in About. | scribe | §14, §17 | `README.md` |
| 10.6 | Final whole-codebase audit against §17 (optional `fable` escalation). | code-reviewer | §17 | n/a |

**Exit.** Every item in §17 is checked off. **User check-in (v1 sign-off).**

---

## 4. Cross-cutting risks and mitigations

| ID | Risk | Mitigation |
|---|---|---|
| R1 | A service worker update reloads the app mid-workout. | `registerType: 'prompt'`. The update toast is suppressed while `getActiveWorkout()` exists, and `updateSW(true)` is only called by user action. Covered by an e2e test in M3. |
| R2 | Sync loses or duplicates data (replays, coalescing, the pending-wins race when a pull lands mid-push). | Push holds the outbox entry until the server acknowledges. Pull checks for pending entries inside the same Dexie transaction. Upserts are idempotent on `id`. The M1 and M9 test suites cover this. The reviewer checks priority 1 every milestone. |
| R3 | Outbox ordering versus unique indexes. Archiving exercise X and then creating a new X with the same name can push out of order and hit a unique violation. | Drain the outbox in FIFO `createdAt` order across records, and coalesce only within a record. Classify 23505 as permanent, but retry it once after the next pull. |
| R4 | iOS PWA quirks: no Vibration, wake lock needs 16.4+, keyboard resizing the viewport, audio needs a gesture, the timer is frozen while backgrounded. | Feature-detect everything. Use a timestamp-based timer. Use `scrollIntoView` on focus. Test the manual device checklist every check-in. |
| R5 | The free-tier project pauses after about a week idle. | The app stays fully usable from cache, the stale-outbox warning shows after 24 h, and the README covers restoring the project and taking JSON backups. |
| R6 | IndexedDB cannot index booleans (`archived` in §4.6). | Drop `archived` from the Dexie index and filter in memory (fine at around 100 rows). Record this as a decision in PROGRESS. |
| R7 | Token expiry while offline forces sign-in. | Gate on the cached session, not on refresh success. Swallow refresh errors offline. Covered by an e2e test (§19.7). |
| R8 | Precision drift: `numeric(7,3)` against client 4-dp rounding for bodyweight. | Round bodyweight to 3 dp before writing. Pulled values match local ones, so no spurious diffs. Display is unaffected (§6.7). |
| R9 | PR recompute fans out into many outbox writes. | Write only the changed workouts, in one transaction. Coalescing absorbs repeat edits. |
| R10 | The first CI run needs branch protection, which needs an existing check. | Merge M1 CI before enabling protection (P7), or bootstrap with the PR itself. |
| R11 | Docker is not installed, which blocks the local stack. | M1 tasks 1.1 to 1.5 and 1.10 to 1.11 proceed without it. RLS and sync tests wait for P1. Never test against the remote project instead. |
| R12 | Exposure of the anon key or service-role key. | Only the anon key, via env and secrets. `Read(./.env*)` is denied. The reviewer greps for `service_role` every milestone. |

---

## 5. Open questions (resolved 2026-11-13: user accepted every proposal below)

**Q1. Seeded exercise IDs collide across users. Needed before M1 task 1.6 and M2.**
- §19.4 (line 1200) says to use "UUID v5 from the exercise name" in a fixed namespace.
- §19.3 (line 1072) makes `exercises.id` a global `primary key`.
- So user B's seed upserts the same IDs as user A's rows. RLS then rejects the update (permanent error), and this also breaks the two-user RLS test (§19.7, line 1220).
- Proposal: derive the namespace per user, as `uuidv5(name, uuidv5(userId, LIFT_NS))`. That keeps two-device convergence for one user.
- The alternative is a composite PK `(user_id, id)` in all tables, which is a bigger change.

**Q2. Should "Delete all data" hard-delete or tombstone? Needed before M9.**
- §19.5 (line 1210) says "Deletes the user's rows server-side".
- §19.4 (line 1188) says deletes are soft so other devices learn about them.
- With a hard delete, a second device never receives tombstones. It keeps the stale data, and its outbox re-uploads it.
- Proposal: tombstone every row (`deleted_at = now()`), then clear the local cache. Settings rows (no `deleted_at`) get reset to defaults.

**Q3. Same-date bodyweight logged on two devices. Needed before M1 task 1.6 and M8.**
- §4.4 (line 204) says one entry per date, as an upsert.
- But IDs are client-side v4, and `bodyweight_user_date_uniq` (lines 1129–1131) makes the second device's push fail with a unique violation. §19.4 (line 1189) treats that as a permanent error.
- Proposal: a deterministic `id = uuidv5(entry_date, userNamespace)`, so upserts converge. Re-logging after a delete then clears `deleted_at`.

**Q4. `weightIncrement` is stored in display units. Needed before M1 task 1.4.**
- §4.5 (line 220) stores "display unit step… default 5 (lb) / 2.5 (kg)". That conflicts with the kg-only rule (line 65 and CLAUDE.md).
- It also leaves unclear what happens on a unit switch.
- Proposal: store `weightIncrementLb` and `weightIncrementKg` separately (defaults 5 and 2.5), and show the one for the active unit.

**Q5. What weight counts for `weighted_bodyweight` in volume, e1RM, PRs and the Weight graph? Needed before M3 task 3.1.**
- §4.2 (line 172) stores the added weight only. §6.2 (line 402) only addresses `bodyweight_reps`.
- Proposal: use the added weight only, matching Strong. Sets with 0 added weight count as reps-only (no kg volume and no weight or e1RM PR).
- The alternative is added weight plus the latest bodyweight entry.

**Q6. How are PRs flagged inside a single workout? Needed before M3 task 3.1.**
- §6.3.1 (line 413) compares against "all prior completed workouts" only. If 225 and then 235 both beat a prior best of 220, both sets get a trophy.
- Proposal: flag only the best set per category (weight, e1RM) per exercise per workout, and only if it strictly beats every earlier workout.

**Q7. An in-progress workout pulled onto a second device. Needed before M3.**
- §5.1.2 (line 252) shows the Resume banner whenever an `in_progress` workout exists.
- §19.4 (line 1198) says a second device "should not auto-open it".
- Proposal: device B shows a passive "In progress on another device" row in the banner slot, with Discard but no Resume. B may still start its own workout.

Smaller decisions applied unless the user says otherwise:
- §5.6's "No signup" (line 378) is overridden by §19.2.
- Add `soundEnabled` (default true) to Settings for the P1 chime (line 282).
- Local `updatedAt` is client time and gets replaced by the server `updated_at` on pull.
- Timestamps inside jsonb stay epoch ms.
