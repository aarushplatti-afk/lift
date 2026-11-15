# Lift — Progress Log

Last updated: 2026-11-15. Branch: `m8-bodyweight`.

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

  - E2E found that the store could report "ready" before the workout loaded; fixed by waiting for the latest hydrate.
- M4 merged (PR #5), deployed, and confirmed on the owner's phone (2026-11-14).
- M5 Templates (branch `m5-templates`, spec docs/milestones/M5-spec.md):
  - 5.1 generic workoutOps over `ExerciseContainer`, template transforms (`src/lib/templates.ts`), `formatLastUsed`, templates repo; `startWorkout` bumps `lastUsedAt` atomically (`7748549`).
  - 5.2a template draft store and template mode for SetRow, set table and ExerciseCard (`428c6d4`).
  - 5.2b templates section on Workout home with preview, start, duplicate, delete (`bed54ef`). 5.2c template editor and routes (`2569b6c`). 5.2d Save as Template from the summary (`ec918cb`).
  - Review fixes: editing keeps 0-set exercises empty; key-order-safe no-op check after pulls; danger delete button; name maxLength (`cac4f78`).
  - 5.3 e2e Flow A: template → start → finish → save as template → delete, with remote checks (`4badc42`). 15/15 e2e and 662 unit tests green locally.
- M5 confirmed by owner on phone.
- M6 History (branch `m6-history`, spec docs/milestones/M6-spec.md):
  - History list grouped by month, with PR badges, volume and duration per row; in-progress workouts hidden.
  - Workout Detail (read-only) with Repeat Workout, Save as Template and Delete Workout.
  - Workout editor: name, date, start time, duration, notes, exercises, sets, completion; Save and Cancel with dialogs.
  - PR recompute on edit, delete and finish (`recomputePRsForExercises`): chronological, same-timestamp workouts are peers.
  - Exercise Detail History tab lists past sessions newest first.
  - Tests: 790 unit; e2e 16/16 locally (new `e2e/auth/history.spec.ts`).
- M6 confirmed by owner on phone.
- Post-M6 fix merged (PR #8): finishing a workout whose sets were filled but none ticked showed "Nothing to save". It now offers "Mark complete & finish"; the discard option is hidden when it would leave nothing. Same in the History editor.
- M7 Progress — exercises (branch `m7-progress-exercises`, spec docs/milestones/M7-spec.md):
  - Progress tab with segmented control Exercises | Bodyweight (placeholder) | PRs (placeholder).
  - Exercises view: exercise selector (trained exercises first), metric chips per type (Weight / Added weight, Est. 1RM, Volume / Total reps, Reps; duration shows Longest set), ranges 1M / 3M / 6M / 1Y / All (default 3M, falls back to All when a range has fewer than 2 points), line chart with touch tooltip (Recharts), stat cards (Current best, Change over range, Workouts, Last performed), recent sessions.
  - Exercise Detail: Records tab and compact Chart tab with "View progress" link.
  - Calc layer: series, range, axis and records (`src/lib/calc/`), with unit tests. Deterministic 2000-workout fixture.
  - Dependencies: `recharts` 3.10.1 and `react-is` 18.3.1 (exact). recharts is in the PRD stack; react-is is its peer dependency. ESLint restricts recharts imports to `src/components/charts`.
  - Bundle: entry chunk 189.41 kB gz (main was 187.70 kB gz, +1.7 kB, within the 5 kB budget). ExerciseChart (recharts) chunk 105.77 kB gz. ProgressTab chunk 3.03 kB gz. Lazy chunks are precached by the service worker.
  - Tests: 931 unit. E2E 19 pass, plus 1 opt-in perf spec (`PERF=1`): first dot 102 ms, range switch 45 ms, ≤ 500 dots, no long tasks. Flow C also passed on WebKit iPhone 13 emulation, including touch tap tooltip.
- M7 confirmed; the owner moved on to M8.
- M8 Bodyweight + PRs (branch `m8-bodyweight`, spec docs/milestones/M8-spec.md):
  - Bodyweight view: log card with prefill and Update, date picker that blocks future dates, note. Chart with raw dots, EWMA trend line (`TREND_ALPHA` 0.1, gap-scaled) and a dashed goal line that is always in the domain. Ranges with fallback to All. Stats: Current, Change (neutral arrows), Min, Max, Average. Entries list paged at 30 with tap-to-edit sheet, swipe delete and 5 s Undo. Empty state.
  - Settings → Bodyweight goal field (saves on blur or Enter; "Clear goal").
  - PRs view grouped by exercise, with search and muscle chips (single-pass `recordsByExercise`).
  - Bodyweight repo with a deterministic per-date id; delete then re-log revives the same server row. No migration, no Dexie bump, no new deps.
  - Local-Supabase constraint tests (`tests/rls/bodyweight.test.ts`).
  - Tests: 1073 unit; e2e 21 pass + 1 opt-in perf; RLS suite includes bodyweight constraints. Flow D passes on WebKit iPhone emulation with sheet delete (touch swipe is not emulatable).

### Post-M8 phone feedback (branch fix-m8-feedback-signup)
- Log weight: changing the date no longer clears a typed weight or note. Picking a date that already has an entry still preloads it, as long as the weight field hasn't been typed in.
- iOS tab bar: the installed app sometimes launched with the viewport short by the status-bar height, so the bar floated above the bottom edge. `src/lib/viewportFix.ts` detects a short viewport in iOS standalone mode only (at launch, on resume, after rotation, after the keyboard closes; never while a field is focused; gives up after 3 nudges that change nothing) and forces a re-layout, restoring focus and window scroll. Unverified on a real device by automation.
- Open sign-up: "Create an account" on the sign-in screen (`signUp` in src/sync/auth.ts). Handles both email-confirmation settings and strips Supabase auth tokens from the URL hash. Each account gets its own seeded exercises; RLS already isolates data. PRD §1, §8 and §19 updated.

## In progress
- M8 device check passed on the owner's phone (2026-11-15) apart from the two fixes above. M9 next.
- Known exception to "no unused exports": `pickPreviousWorkout`, `setGroup`, `SetGroup` and `RestPhase` are spec contracts used only in tests or inside their own module.

## Blocked
- None. (Sign-ups stay ON now. Optional for the owner in Supabase Auth: turn off "Confirm email", and set minimum password length to 8 to match the app and supabase/config.toml.)

## Decisions
- 2026-11-15: Sign-up opened to anyone at the owner's request (app is now multi-user with private per-account data). Recommended: turn off "Confirm email" in Supabase Auth.
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
- 2026-11-14, M5 decisions (accepted architect defaults; reversible):
  - `TemplateSet.targetDurationSec` added (jsonb, no migration) so timed exercises carry targets.
  - New, unused templates sort first.
  - The template editor edits a local draft and saves on Save (Cancel discards; browser back is not guarded).
  - Starting from a template is blocked while a local workout is active; a workout on another device doesn't block.
  - Deleting a template never touches workouts.
  - "Update template from this workout" is deferred to M6/P1; starter PPL templates are deferred to onboarding.
- 2026-11-14, M6 decisions (accepted architect defaults; reversible; full list H1–H24 in docs/milestones/M6-spec.md §0):
  - H1: no migration and no Dexie version bump.
  - H2/H5: `computePRFlags` replaced by `recomputePRsForExercises`. Finishing a workout re-flags later completed workouts whose flags change (e.g. a workout that started earlier but finished later).
  - H3: same-timestamp workouts are peers; both can be flagged.
  - H6: each write (update, delete, finish) runs in one Dexie transaction with one outbox entry per changed row.
  - H7/H11: the editor works on a local draft with explicit Save and Cancel; no autosave to the record. Cancel with changes asks "Discard changes?".
  - H8: per-exercise rest is not editable in edit mode.
  - H13: delete is a hard delete locally plus a server tombstone; no undo.
  - H15: Repeat carries no `templateId`.
  - H22: no recompute after pull; the writing device recomputes and pushes changed rows.
  - H23: all completed workouts are kept in memory; no virtualisation (revisit in M10).
  - H24: vitest is pinned to `TZ=America/New_York`.
  - History search and filter deferred to M10.
  - Delete failure toast: "Couldn’t delete. Try again."
  - Duration validation copy: "Enter a valid duration".
- 2026-11-14, M7 decisions (accepted architect defaults; reversible; full list P1–P24 in docs/milestones/M7-spec.md §0):
  - P1: Bodyweight and PRs views are placeholders until M8.
  - P1 (chips): Reps chip shipped.
  - P3/P4: top set = heaviest weight.
  - P11/P10: rangeStats has no change field. Change is computed from the displayed rounded values (deviation from PLAN). Change is shown in neutral colour.
  - P14: selection is memory-only. URL deep link `?exercise=` is applied once, then cleared.
  - P19: reps records only for bodyweight and weighted_bodyweight types.
  - P20: compact chart uses the All range.
  - P17: volume change is shown grouped, like volume values.
  - P8: "No sessions yet" title copy.
  - Spec e2e corrections: third workout at 40 days ago; best set volume "510 kg".
- 2026-11-15, M8 decisions (accepted architect defaults; reversible; full list B1–B21 in docs/milestones/M8-spec.md §0):
  - B1/B3: the bodyweight id is `bodyweightId(userId, date)`. Delete is a local hard delete plus a server tombstone. Re-logging the same date revives the same row.
  - B4: bodyweight delete has a 5 s Undo (workouts do not). `restoreEntry` keeps the snapshot `updatedAt`, because the server trigger sets `updated_at`. Undo conflict toast: "Couldn’t undo — this day was logged again."
  - B5: future dates are blocked (`max` plus repo check). Dates are strict local calendar dates, min 1900-01-01.
  - B6/B7: weight is valid when `0 < kg < 700` after rounding. Note max 200 characters.
  - B8: the log card shows typed values until saved; changing the date resets them.
  - B9: the edit sheet cannot change the date.
  - B10/B13: trend is computed over all entries before range filtering. Change uses raw entries. `getLatest` is dropped (deviation from PLAN).
  - B14: the entries list shows all entries, paged at 30.
  - B16: a blank goal that is blurred reverts; only "Clear goal" clears it.
  - B19: PRs are sorted alphabetically, and archived exercises are included.
  - Delete and restore check the owner.
  - B20: the same date on two devices gives one row; the last push wins by server `updated_at`.
  - B21: tests run with `TZ=America/New_York`.
- Defaults per PRD §16: lb, blue accent `#4F8CFF`, name "Lift".

## Known limitations (M6)
- R-a: concurrent offline edits of the same workout on two devices can leave PR flags inconsistent. Last writer wins per row. A recompute can re-upsert a stale local row and overwrite an unpulled remote edit of that row. Heals on the next local write touching the exercise.
- Unsaved editor edits are lost on browser back or OS kill.
- The minutes field silently clamps values above 59 until blur.
- History row `aria-label` omits PR and volume.
- E2E has a fixed 3 s wait after sign-in.

## Known limitations (M7)
- Touch tooltip persistence on iOS standalone is to be verified on the owner's device.
- `yAxis` could in principle produce 3 ticks (spec asks for 4–5).
- Vite warns that the entry chunk is over 500 kB raw. Pre-existing; bundle splitting is M10.

## Known limitations (M8)
- Swipe delete on real iOS is not verified by automation. Manual check on the owner's phone.
- One toast slot: a second quick delete loses the first Undo.
- A log card opened before midnight keeps its typed values after midnight.
- A goal far from the data flattens the chart (the goal is always in the domain).
- Pre-existing `syncApply` deletes a different-id local row for the same date without checking pending upserts (legacy data only).
- ExercisesView still nests Link inside Button for its CTA.
- Settings is reachable only from the Workout home header.
