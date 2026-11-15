# M6 Spec — History (branch m6-history)

Author: architect. Binding for M6 builders. M1 §0, M2 E1–E7, M3 W1–W8/U1–U5, M4 T1–T8, M5 M1–M10 still apply.

## Scope
In: History list grouped by month (PRD §5.2); Workout Detail (read-only) with Edit / Delete / Save as Template / Repeat Workout; editing a completed workout incl. date, start time, duration; PR recompute on edit/delete/finish (§6.3.3); Exercise Detail → History tab (§5.4.1).

Out: History search/filter (P1 → M10); Exercise Detail Records/Chart tabs (M7); "replace exercise"; "update template from this workout" (P1); PR recompute after pull; "rebuild all PRs"; list virtualisation.

## 0. Decisions (reversible defaults)

- **H1** No migration, no Dexie version bump.
- **H2 Recompute = one pure sweep.** `recomputePRsForExercises(exerciseIds, workouts, types)` in `src/lib/calc/prs.ts`.
  - Only `status === 'completed'` workouts participate; active / remote in-progress rows are never read or returned.
  - M3 category rules unchanged: eligible = completed, not warmup, passes `canCompleteSet`; categories per `categoriesFor` (weight+e1rm for weight exercises, reps for bodyweight, duration for timed); compare after `round4`; strictly greater; first-ever logging gets no flag (U2); only the best set per category per exercise per workout flagged, in-workout tie → first by block `order` then set `order` (Q6); duplicate blocks compete together.
  - `weighted_bodyweight` uses added weight only; 0 added → no weight/e1rm value (Q5).
  - Only sets of exercises in `exerciseIds` are touched; others keep stored `isPR`. Ids missing from `types` in the affected set → flags cleared (W8).
  - `isPR` stored only as `true`, otherwise key deleted (W1).
  - Returns `Map<workoutId, Workout>` of only workouts whose flags changed (`Boolean(isPR)` differs). Inputs never mutated.
- **H3 Chronology.** Sort by `startedAt` asc, then `id` asc (determinism only). Same-`startedAt` workouts are peers: each compared only with strictly earlier workouts; the group's values merge into the running best after the whole group is evaluated (both peers can be flagged). Matches M3 `prior.startedAt < workout.startedAt`.
- **H4 Affected exercises.** Edit: union of exerciseIds in stored and new row. Delete: deleted row's ids. Finish: finished workout's ids.
- **H5 `finishWorkout` uses the recompute**, replacing `computePRFlags` (deleted; tests ported). Finished workout flags = `changed.get(id) ?? cleaned`. Any other completed workout whose flags change is also written (covers a workout that started earlier but finished later, e.g. two devices). With consistent history results equal M3.
- **H6 One transaction per write.** `updateCompletedWorkout`, `deleteWorkout`, `finishWorkout`: one `db.transaction('rw', [workouts, exercises, syncQueue, meta])` — load type map + all completed rows, apply change, recompute, put target row and every changed row with `updatedAt = now`, one enqueue (upsert or delete) per row. Unchanged workouts never written.
- **H7 Edit uses a local draft, explicit Save/Cancel, no autosave to the record.** `src/store/workoutEditDraft.ts`, memory only, modelled on `templateDraft`. Draft is a full `Workout` (`structuredClone`) so `workoutOps` apply unchanged. Losing a draft on OS kill is accepted (as M5 M4).
- **H8 Editable:** name (required, `NAME_MAX`), workout notes, start date + start time (local, minute precision), duration h/m; exercises add/remove (Undo)/move/notes; sets weight/reps/time, type, add, delete (Undo), completion toggle. **Not editable:** per-exercise rest (⋯ menu hides "Rest timer" in edit mode). Changing start keeps duration (`endedAt` moves). Changing duration sets `endedAt = startedAt + min*60000`. Untouched fields keep original ms values.
- **H9 Validation** (`validateWorkoutEdit`, run by repo at Save): normalised name non-empty; `startedAt` finite integer and `≤ now`; `endedAt` defined, finite, `≥ startedAt`. No duration cap; `endedAt` may exceed now. DST-gap times normalised forward by `Date` (accepted).
- **H10 Completion toggles in edit mode.** Tick runs `canCompleteSet`, shakes on failure. Save runs `prepareFinish`: incomplete sets → "Save changes?" dialog with "Mark complete & save" / "Discard incomplete sets & save" / "Cancel"; empty sets / exercises without done sets dropped silently; nothing left → "Nothing left to save" with "Delete workout" (danger) / "Keep editing". In edit mode a tick never starts the rest timer, never vibrates, never chimes.
- **H11 Dirty / no-op key.** `workoutEditKey(w)` serialises in explicit field order: name (trimmed), `notes ?? ''`, `startedAt`, `endedAt`; exercises by order as `{exerciseId, notes ?? '', restSeconds ?? null, sets}`; sets as `{type, weightKg ?? null, reps ?? null, durationSec ?? null, completed}`. Excludes ids, `isPR`, `completedAt`, `updatedAt`. Cancel clean → leave; dirty → "Discard changes?" with "Discard changes" (danger) / "Keep editing". Browser back not guarded.
- **H12 Identity preserved.** `id`, `userId`, `createdAt`, `templateId` (kept or kept absent), `status: 'completed'` come from the stored row. Missing / not completed stored row → `not_found`, nothing written; UI toasts "This workout was deleted on another device." and navigates replace to `/history`. No resurrection.
- **H13 Delete.** `deleteWorkout(id)` hard-deletes the Dexie row, enqueues `delete` (server tombstone, D1), recomputes (H4). Missing row → no-op, no enqueue. `in_progress` row → throws `Error('Use discardWorkout for in-progress workouts')`. Confirm dialog: title "Delete this workout?", body "It will be removed from your history on all your devices. Personal records will be recalculated.", buttons "Delete workout" (danger) / "Cancel". Success → toast "Workout deleted", navigate replace `/history`. No undo.
- **H14** Editing history while a workout is active is allowed. The active workout is excluded from recompute; its flags are computed at finish (H5) against edited history.
- **H15 Repeat Workout.** `workoutInitFromWorkout(w, ctx) = { name: w.name, exercises: workoutExercisesFromTemplate(templateFromWorkout(w).exercises, ctx) }` → completed sets only, values/type/restSeconds prefilled, uncompleted, fresh ids; notes/isPR/completedAt stripped. **No `templateId`.** Starts via `useActiveWorkoutStore.getState().start(init)`, then navigates to `/workout/active`. Blocked while a local workout is active using the shared "Workout in progress" dialog (extracted). Button disabled while the store is `loading` or a start is in flight. Failure toast "Couldn’t start the workout. Try again."
- **H16 Save as Template** from detail reuses `SaveAsTemplateDialog` unchanged; button then disabled, reads "Saved as template" until leaving the detail.
- **H17 Sort + grouping.** `startedAt` desc, then `id` desc. Group by local year+month of `startedAt`. Label `toLocaleDateString('en-US', { month: 'long', year: 'numeric' })` ("November 2026"). `listCompletedWorkouts` uses the same sort.
- **H18 Row.** Line 1: name (semibold, truncated) + trophy "PR" badge when `prCount > 0`, `aria-label="{n} personal record(s)"`. Line 2: `formatWorkoutDate(startedAt)` ("Thu, Nov 12") · `formatDurationShort(duration)` ("—" if no `endedAt`). Line 3: `formatVolume(volumeKg, unit)` ("12,346 lb") · "{n} exercise(s)"; volume omitted when 0. `exerciseCount = w.exercises.length`. Row is a Link to `/history/:id`, `aria-label="{name}, {date}"`, min height 72 px.
- **H19** History and Exercise Detail read `listCompletedWorkouts()` only. `/history/:id` and `/history/:id/edit` for a missing or non-completed id → EmptyState "Workout not found" / "It may have been deleted." with action "Back to history".
- **H20 Exercise Detail → History tab.** One card per completed workout containing the exercise, newest first. Header: `formatWorkoutDate(startedAt, now)` (", 2025" when year differs) · workout name, + trophy if any set `isPR`. Body: one line per completed set across that exercise's blocks (block then set order): badge label (`setBadgeLabels`), `formatPreviousSet(set, type, unit)`, trophy if `isPR`. Tap → `/history/:workoutId`. Empty: "No history yet" / "Logged sets will appear here."
- **H21 Routes.** `history`, `history/:id`, `history/:id/edit`. Tab bar shown on list + detail, hidden on `^/history/[^/]+/edit$`. Mini-bar follows the existing rule (hidden on edit).
- **H22 No recompute after pull.** The writing device recomputes and pushes all changed rows. Inconsistent flags after concurrent offline edits heal on the next local write touching the exercise.
- **H23 Performance.** All completed workouts in memory is fine for v1; no virtualisation; grouping memoised on the liveQuery result. Revisit in M10.
- **H24 Test TZ.** `vitest.config.ts` sets `process.env.TZ = 'America/New_York'` at module top. If an existing test breaks, fix the test, not the pin.

## 1. Pure layer (data-engineer)

### `src/lib/calc/prs.ts` (6.1a)
```ts
export function recomputePRsForExercises(
  exerciseIds: ReadonlySet<string>,
  workouts: readonly Workout[],
  types: ExerciseTypes,
): Map<string, Workout>; // changed workouts only (H2, H3)
```
Remove `computePRFlags`; keep `round4`, `categoriesFor`, `isEligible`, `valueOf` as private helpers. Algorithm: filter completed, sort (startedAt, id); `best: Map<'exId|cat', number>`; per startedAt group, per workout, per affected exercise find per-category winner (tie → first by block order then set order), flag if `> best`; after group, merge maxima into best; rebuild affected sets (delete isPR, set true on flagged); emit if any `Boolean(isPR)` changed.

Tests (`src/lib/calc/__tests__/prs.test.ts`, rewrite): port every `computePRFlags` case as "priors + current, recompute over current's ids, read current's flags (`out.get(id) ?? input`)". Add:
- Edit lowers PR: W1 100, W2 110 (PR), W3 105; W2 → 95 ⇒ W2 loses flag, W3 gains, map is exactly {W2, W3}.
- Delete PR workout: drop W2 ⇒ W3 flagged.
- Date reorder: W3 before W2 ⇒ W3 PR (105>100), W2 keeps PR (110>105); W2 before W1 ⇒ W2 first-ever (no flag), W1 and W3 not flagged.
- Ties: equal to earlier best → no flag; in-workout tie → first set.
- Same timestamp: two peers both 110 vs earlier 100 → both flagged, regardless of input order.
- Isolation: stale isPR on exercise B untouched when only A recomputed; unknown ids in the affected set cleared.
- In-progress workouts neither counted nor returned.
- Idempotence: second run on first run's output → empty map.
- No mutation; a false flag is a missing key, never `false`.
- Per type: weighted_bodyweight (0 added → no weight PR; 20 after 10 → PR); bodyweight_reps reps PR; duration longest-set PR; heavy warmup ignored; reps > 12 count for weight not e1rm.

### `src/lib/calc/history.ts` (6.1a, new)
```ts
export interface MonthGroup { key: string; label: string; workouts: Workout[] } // key 'YYYY-MM' local
export interface WorkoutStats {
  durationMs: number | undefined; volumeKg: number; exerciseCount: number; setCount: number; prCount: number;
}
export interface ExerciseSession {
  workoutId: string; workoutName: string; startedAt: number; sets: WorkoutSet[]; hasPR: boolean;
}
export function compareWorkoutsDesc(a: Workout, b: Workout): number;       // startedAt desc, id desc
export function groupByMonth(workouts: readonly Workout[]): MonthGroup[]; // completed only, H17
export function workoutStats(w: Workout, types: ExerciseTypes): WorkoutStats;
export function exerciseHistory(exerciseId: string, workouts: readonly Workout[]): ExerciseSession[];
```
- `workoutStats`: `durationMs = endedAt === undefined ? undefined : Math.max(0, endedAt - startedAt)`; `volumeKg = workoutVolume`; `setCount = completedSetCount(w, types)`; `prCount` = sets with isPR.
- `exerciseHistory`: completed workouts only; completed sets of every block of that exercise in block then set order; skip sessions with 0 completed sets; sorted by `compareWorkoutsDesc`.

Tests (`src/lib/calc/__tests__/history.test.ts`):
- groupByMonth: empty; in-progress filtered; desc within and across groups; 2026-10-31 23:30 local stays October, 2026-11-01 00:30 November; DST end 2026-11-01 01:30 (ambiguous) → "November 2026"; DST start 2026-03-08 03:30 → March; year boundary (Dec 31 23:59 vs Jan 1 00:01); same timestamp → deterministic id-desc regardless of input order.
- workoutStats: warmups excluded from volume; bodyweight-only volume 0; missing endedAt → undefined; prCount; exerciseCount counts duplicate blocks.
- exerciseHistory: two blocks merged in order; incomplete sets excluded; workouts without the exercise skipped; hasPR.

### `vitest.config.ts` (6.1a)
Apply H24.

### `src/lib/workoutEdit.ts` (6.1b, new; no React, no Dexie)
```ts
export type WorkoutEditError =
  | { field: 'name'; code: 'required' }
  | { field: 'startedAt'; code: 'invalid' | 'future' }
  | { field: 'duration'; code: 'invalid' };
export function validateWorkoutEdit(w: Workout, now: number): WorkoutEditError | undefined; // H9
export function workoutEditKey(w: Workout): string;                                          // H11
export function toDateInputValue(ms: number): string;  // 'YYYY-MM-DD' local
export function toTimeInputValue(ms: number): string;  // 'HH:mm' local, 24 h
export function fromDateTimeInputs(date: string, time: string): number | undefined; // local; undefined if malformed
export function durationParts(startedAt: number, endedAt: number): { hours: number; minutes: number }; // floored to minutes
```
Tests: key unchanged by key order / ids / isPR / completedAt / updatedAt, changed by weight +0.0001, set type, reorder, notes, time; every validation code + boundaries (`startedAt === now` valid, `endedAt === startedAt` valid); date/time round trip equals x floored to the minute; malformed → undefined; DST gap 2026-03-08 02:30 normalises forward (record value); durationParts 0, 59 s, 61 min, 25 h.

### `src/lib/templates.ts` (6.1b)
```ts
export function workoutInitFromWorkout(w: Workout, ctx: OpsCtx): WorkoutInit; // H15
```
Tests: only completed sets; exact values/types (incl. kg like 45.359237); none completed; fresh unique ids; no templateId even if source had one; name copied; notes and isPR stripped; restSeconds kept; unknown exercise ids kept.

### `src/lib/format.ts` (6.1b)
```ts
export function formatWorkoutDate(ms: number, now?: number): string;    // "Thu, Nov 12"; ", 2025" only if now given and year differs
export function formatWorkoutDateTime(ms: number): string;              // "Thu, Nov 12, 2026 · 6:05 PM"
export function formatVolume(kg: number, unit: Unit): string;           // Math.round(toDisplay), en-US grouping + unit
export function formatSetDetail(set: WorkoutSet, type: ExerciseType, unit: Unit): string; // moved from Summary describeSet, same output
```
Tests: 2026-11-12 → "Thu, Nov 12"; year suffix rule; `formatVolume(lbToKg(12345.6), 'lb')` → "12,346 lb"; kg; formatSetDetail for all 4 types matching old Summary strings.

## 2. Repo (data-engineer, 6.2) — `src/db/repos/workouts.ts`
```ts
export type EditOutcome =
  | { status: 'saved'; workout: Workout }
  | { status: 'empty' }
  | { status: 'not_found' }
  | { status: 'invalid'; error: WorkoutEditError };
export function updateCompletedWorkout(w: Workout, opts: { markIncomplete: boolean }): Promise<EditOutcome>;
export function deleteWorkout(id: string): Promise<void>;
// changed: finishWorkout (H5), listCompletedWorkouts (sort = compareWorkoutsDesc).
```
**updateCompletedWorkout:** normalise name, `validateWorkoutEdit(w, Date.now())` → `invalid` before any transaction. In the H6 tx: stored missing / not completed → `not_found`; `prepareFinish(w, types, { markIncomplete, now })` empty → `empty`, nothing written; build `next` (H12 + cleaned content, `updatedAt = now`); `workoutEditKey(next) === workoutEditKey(stored)` → `saved` with stored row, no write/enqueue; else `all` = completed rows with stored replaced by next, affected per H4, recompute; write `changed.get(next.id) ?? next` plus other changed rows (`updatedAt = now`), one upsert each; return `saved` with final row.

**deleteWorkout:** H13 inside the H6 tx. Never touches meta `activeWorkoutId`.

**finishWorkout:** replace `computePRFlags` with recompute over completed rows (excluding `w.id`) plus `{...plan.cleaned, status: 'completed'}`, for the cleaned workout's ids. Write finished + other changed rows, enqueue each. Rest unchanged.

Tests (`src/db/__tests__/workouts.test.ts`): update lowering PR writes 2 rows + 2 outbox entries, later row stored isPR true; no-op save 0 entries; not_found for missing and in_progress; invalid and empty write nothing; createdAt/userId/templateId preserved, draft can't drop templateId; markIncomplete true/false; removing an exercise from W2 gives W3 its PR back; date change reorders listCompletedWorkouts. Delete: row gone + one delete enqueued; later workout gains PR + upsert; missing id writes nothing; in_progress throws; active row and meta untouched. Finish: existing tests pass (adjust fixtures with stale flags); finishing a workout whose startedAt is earlier than an existing completed one re-flags the later one. Sort: same startedAt → id desc. Push (fakeClient): deleted workout pushes soft-delete; recompute pushes every changed row.

## 3. Store (data-engineer, 6.3) — `src/store/workoutEditDraft.ts`
```ts
export interface WorkoutEditState {
  draft: Workout | null; baselineKey: string;
  load(w: Workout): void; clear(): void; isDirty(): boolean;
  setName(name: string): void;
  setNotes(notes: string): void;
  setStartedAt(ms: number): void;           // keeps duration (H8)
  setDurationMinutes(min: number): void;    // endedAt = startedAt + min*60000
  addExercises(ids: string[]): void; removeExercise(weId: string, name?: string): void;
  moveExercise(weId: string, dir: -1 | 1): void; setExerciseNotes(weId: string, notes: string): void;
  addSet(weId: string): void; updateSet(weId: string, setId: string, patch: SetPatch): void;
  toggleComplete(weId: string, setId: string, type: ExerciseType): CompleteResult;
  removeSet(weId: string, setId: string): void;
  setSetType(weId: string, setId: string, t: SetType): void; setRestSeconds(weId: string, sec: number | null): void;
  save(opts: { markIncomplete: boolean }): Promise<EditOutcome>; // on 'saved': draft = outcome.workout, re-baseline
}
export const useWorkoutEditStore: UseBoundStore<StoreApi<WorkoutEditState>>;
```
`load` deep-clones, sets `baselineKey`, bumps a generation counter scoping Undo (as templateDraft). Undo toasts match the workout store ("Removed {name}", "Set deleted"). `toggleComplete` mirrors `useActiveWorkoutStore.toggleComplete`.
Tests (`src/store/__tests__/workoutEditDraft.test.ts`): change + revert is clean; stale Undo ignored after load; setStartedAt keeps duration, setDurationMinutes moves only endedAt; invalid toggle returns failing field, state unchanged; saved re-baselines, not_found leaves draft dirty; never touches rest timer or active workout stores.

## 4. UI (ui-builder)

### 6.4a Shared pieces (refactor, no behaviour change)
- `src/components/workout/TrophyIcon.tsx` (moved from Summary; optional `size`, default 20).
- `src/components/ui/StatTile.tsx` (moved `Stat`; props `{ label; value }`).
- `src/components/workout/WorkoutInProgressDialog.tsx` extracted from `TemplateList.tsx` (`{ open; onClose }`, same copy, "Resume workout" → `/workout/active`); TemplateList uses it.
- `Summary.tsx` uses TrophyIcon, StatTile, formatSetDetail.
- `ExerciseCard.tsx`: `mode?: 'workout' | 'template' | 'edit'`. `CardActions` gains `toggleComplete`, `setExerciseNotes` (no-ops in template mode). `useCardActions` selects from all three stores unconditionally and returns the one for the mode. Edit mode renders workout-mode SetRow (PREVIOUS from `previous` prop, tap-to-fill T7); tick calls edit store `toggleComplete` — no haptics, no `unlockChime`, no `startRest`; notes shown; menu has note items, Move up/down, Remove exercise, no Rest timer.
- Tests: edit-mode tick updates edit store and rest timer stays idle; edit-mode menu items; existing ExerciseCard/Summary/templates tests green.

### 6.4b History list, detail, routes (owns `src/App.tsx`)
- Move `src/routes/HistoryTab.tsx` → `src/routes/HistoryTab/HistoryList.tsx`.
- Routes `history/:id` → WorkoutDetail, `history/:id/edit` → WorkoutEditor; add `!/^\/history\/[^/]+\/edit$/.test(pathname)` to Layout `showTabs`. WorkoutEditor.tsx stub until 6.4c.
- HistoryList: Header "History"; `useLiveQuery(() => listCompletedWorkouts(), [], null)`, `useExerciseMap()`, settings unit; render nothing until loaded; `groupByMonth` with `h2` headers; rows per H18; empty "No workouts yet" / "Your finished workouts will show up here."
- WorkoutDetail: Header with BackLink to `/history`, title = name, right = "Edit" link. Body: `formatWorkoutDateTime(startedAt)`; StatTiles Duration, Total volume (`formatWeight(..., { withUnit: true })` like Summary), Sets; notes; per block: name links `/exercises/:exerciseId` ("Deleted exercise" unlinked if unknown), exercise note, set lines (badge label, formatSetDetail, TrophyIcon `aria-label="Personal record"`). Actions: "Repeat Workout" primary large (H15), "Save as Template" secondary (H16), "Delete Workout" danger (H13). Not found per H19.
- Reuse `src/routes/ExercisesTab/BackLink.tsx` (import, don't duplicate).

### 6.4c Editor (`src/routes/HistoryTab/WorkoutEditor.tsx`)
- Load `getWorkout(id)`; not completed → not found; else `load(row)`; unmount → `clear()`.
- Header: "Cancel" (ghost), "Edit Workout", "Save".
- Fields: TextInput "Workout name" (maxLength NAME_MAX, error "Enter a name"); `type="date"` "Date" and `type="time"` "Start time" (16 px) → `fromDateTimeInputs` → `setStartedAt`, malformed keeps local state and shows "Enter a valid date and time"; Duration NumberInputs integer mode aria "Duration hours" / "Duration minutes" (0–59) → `setDurationMinutes`; TextArea "Workout notes"; ExerciseCards `mode="edit"` with `previous` from `getLastCompletedWithExercises(ids, draft.startedAt)`; "+ Add Exercise" → ExercisePicker "Add exercises".
- Save: not dirty → navigate replace `/history/:id`. Else `prepareFinish(draft, types, { markIncomplete: false, now })` → H10 dialogs → `save`. Outcomes: saved → toast "Workout updated", replace `/history/:id`; invalid → inline "Enter a name" / "Start time can’t be in the future" / "Enter a valid date and time"; empty → "Nothing left to save" (Delete → `deleteWorkout`, H13 nav); not_found → H12; throw → toast "Couldn’t save. Storage may be full."
- Cancel per H11 → `/history/:id`.

### 6.4d Exercise Detail History tab (`src/routes/ExercisesTab/ExerciseDetail.tsx`)
When `tab === 'history'`, render H20 from `exerciseHistory(exercise.id, completed)` using `useLiveQuery(() => listCompletedWorkouts(), [], null)` and `useNow()`. EmptyState only when empty. Parallel with 6.4c.

## 5. Order
| # | Task | Agent | Depends on |
|---|---|---|---|
| 6.1a | prs recompute, history.ts, TZ pin + tests | data-engineer | — |
| 6.1b | workoutEdit.ts, workoutInitFromWorkout, format additions + tests | data-engineer | — |
| 6.2 | Repo update/delete/finish/sort + tests | data-engineer | 6.1a, 6.1b |
| 6.3 | Edit draft store + tests | data-engineer | 6.2 |
| 6.4a | Shared extractions, ExerciseCard edit mode | ui-builder | 6.3 |
| 6.4b | History list, detail, routes | ui-builder | 6.4a |
| 6.4c | Editor | ui-builder | 6.4b |
| 6.4d | Exercise Detail History tab | ui-builder | 6.4b |
| 6.5 | RTL + e2e | qa-engineer | 6.4c, 6.4d |
| 6.6 | Review, PROGRESS, PR | code-reviewer, scribe | 6.5 |

## 6. Acceptance (qa-engineer, 6.5)

RTL (`src/routes/HistoryTab/__tests__/history.test.tsx`): list empty copy; month headers in order; row text ("Thu, Nov 12", duration, "12,346 lb", "3 exercises", PR badge only with PRs); in-progress rows hidden. Detail sets + trophies, not found, exercise link. Edit W2 110 → 95 (W1 100, W3 105): W2 detail no trophy, list badge on W3. Date edit moves W1 into previous month header, badges follow H3. Validation: future start error; incomplete-sets dialog both branches; nothing-left → delete. Cancel guard clean/dirty. Delete: confirm → toast → row gone; deleting PR workout moves badge. Repeat: blocked while active (dialog, Resume navigates); otherwise active has past values, uncompleted, no templateId. Save as Template from detail: default name, disabled after. Exercise Detail History tab lists sessions newest first with set lines/trophies; tap opens detail. Tab bar visible on list/detail, hidden on edit. 390 px both themes.

E2E (`e2e/auth/history.spec.ts`):
1. Sign in. Log and finish 3 Bench Press workouts: 135×5, 145×5, 140×5.
2. History: 3 rows under the current month; only 145 has the PR badge.
3. Edit 145 → 130, Save. Detail has no trophy; list badge now on 140. Remote (`readRemoteWorkouts`): 140 row `isPR === true`; 130 row no isPR.
4. Delete the 140 workout. List has 2 rows, no PR badges (130 < 135). Remote 140 row has `deleted_at`; remote 130 row still has no isPR.
5. Open 135, Save as Template "Bench Day"; it appears on Workout home.
6. Repeat Workout: active screen has Bench 135 × 5 prefilled, uncompleted. Discard.
7. Second browser context, same user: History shows the same rows and badges after pull.

## 7. Risks / open questions
- R-a Concurrent offline edits on two devices can leave flags inconsistent (last writer wins per row); heal on next local write (H22).
- R-b Unsaved edits lost on browser back / OS kill / accepted SW update. Accepted.
- R-c H5 may require fixing finish-test fixtures with stale flags; reviewer confirms no behaviour regression.
- R-d H24 TZ pin affects the whole unit suite.
- R-e iOS native date/time inputs: 16 px, pickers, cleared values.
- Q1 Repeat carries templateId? Default no. Q2 finish re-flags later workouts? Default yes. Q3 detail volume Summary-style, rows grouped. Q4 History search → M10.
