# Milestone 3 Implementation Spec: Active Workout Core (branch m3-active-workout)

Written by `architect` and binding for M3 builders. M1-spec §0 and M2-spec §0 still apply. Out of scope here: templates (M5), the PREVIOUS lookup, the rest timer, swipe-to-delete and set-type badges (M4).

## 0. Decisions

- **W1. No migration and no Dexie version bump.**
  - `isPR` is written only when true. On every other set the key is removed.
- **W2. Meta key `activeWorkoutId`.**
  - Add `| { key: 'activeWorkoutId'; value: string }` to `MetaRow` in `src/db/schema.ts`. This is a type-only change.
  - "My active workout" means all of:
    - meta `activeWorkoutId` is set;
    - that row exists;
    - the row is `in_progress`.
  - Any other `in_progress` row belongs to another device (Q7) and is never auto-opened.
- **W3. Pull never overwrites the active workout.**
  - In `src/db/repos/syncApply.ts`: for `table === 'workouts'` where `record.id === meta.activeWorkoutId`, count the record as skipped. This applies to both upserts and tombstones.
- **W4. Two-speed persistence.**
  - `saveActiveWorkout` writes Dexie only, with no outbox entry. It is debounced 300 ms.
  - `enqueueActiveWorkout` adds the outbox upsert. It runs 5 s after the first unsent change, and later edits do not reset that timer.
  - Both are flushed immediately on `visibilitychange:hidden`, `pagehide`, ActiveWorkout unmount, finish and discard.
- **W5. The store owns the workout once hydrated.**
  - It re-hydrates only when `observeActiveWorkoutId()` changes to a different id.
- **W6. Finishing uses the PRD's three-option dialog.**
  - Mark complete & finish / Discard incomplete sets & finish / Cancel.
- **W7. A completed set that becomes invalid stays checked.**
  - `prepareFinish` treats it as incomplete if it still has data, or as empty if it doesn't.
- **W8. Unknown `exerciseId`.**
  - It is shown as "Deleted exercise" with type `'weight_reps'`.
  - It never gets a PR, but it still counts toward volume.
- **User answers, 2026-11-13** (accepted defaults under the owner's blanket authorization; reversible):
  - **U1:** `bodyweight_reps` earns a max-reps PR and `duration` a longest-set PR.
  - **U2:** an exercise's first-ever logging gets no trophy.
  - **U3:** finishing with nothing incomplete saves immediately, with no confirm.
  - **U4:** the default name depends on the time of day.
  - **U5:** the device that owns the workout wins over a remote discard.

## 1. Calc layer (`src/lib/calc/`, pure; data-engineer)

`volume.ts` exports `type ExerciseTypes = ReadonlyMap<string, ExerciseType>`.

### `validation.ts`

```ts
export const WEIGHT_SOFT_CAP = 2000; // display unit
export const REPS_SOFT_CAP = 999;
export type InvalidField = 'weight' | 'reps' | 'duration';
export function canCompleteSet(set: WorkoutSet, type: ExerciseType): { ok: true } | { ok: false; field: InvalidField };
export function softWarnings(set: WorkoutSet, type: ExerciseType, unit: Unit): ('weight_high' | 'reps_high')[];
export function isEmptySet(set: WorkoutSet): boolean; // weightKg, reps and durationSec all undefined
```

`canCompleteSet` rules:

| Exercise type | Requirement | Error field |
|---|---|---|
| `weight_reps` | `weightKg > 0` (checked first) and reps valid | `weight`, then `reps` |
| `bodyweight_reps` | reps valid; weight is ignored | `reps` |
| `weighted_bodyweight` | reps valid; blank weight counts as 0 added | `reps` |
| `duration` | `durationSec` is an integer ≥ 1 | `duration` |

- Reps are valid when they are an integer ≥ 1.
- Non-finite or negative values always fail.

`softWarnings`:
- `weight_high` when `toDisplay(weightKg, unit) > 2000`.
- `reps_high` when `reps > 999`.
- Warnings never block completing a set.

### `e1rm.ts`

```ts
export const E1RM_MAX_REPS = 12;
export function epley(weightKg: number | undefined, reps: number | undefined): number | undefined;
export function setE1rm(set: WorkoutSet, type: ExerciseType): number | undefined;
```

- `epley` returns `undefined` when:
  - weight is non-finite or ≤ 0, or
  - reps is not an integer, or is < 1, or is > 12.
- `reps === 1` returns the weight unchanged.
- Otherwise it returns `w * (1 + reps / 30)`. For example, `225 × 5` gives 262.5.
- `setE1rm` returns `undefined` for:
  - sets that are not completed;
  - warmup sets;
  - `bodyweight_reps` and `duration` exercises;
  - `weighted_bodyweight` sets with added weight ≤ 0.

### `volume.ts`

```ts
export const EXCLUDED_SET_TYPES: readonly SetType[] = ['warmup'];
export function setVolume(set: WorkoutSet, type: ExerciseType): number; // kg
export function exerciseVolume(we: WorkoutExercise, type: ExerciseType): number;
export function workoutVolume(w: Workout, types: ExerciseTypes): number; // unknown id → 'weight_reps'
export function completedSetCount(w: Workout): number; // completed && canCompleteSet ok, all set types
```

`setVolume` returns `weightKg * reps` when all of these hold, and 0 otherwise:
- the set is completed;
- its type is not in `EXCLUDED_SET_TYPES`;
- the exercise is `weight_reps`, or `weighted_bodyweight` with weight > 0;
- `canCompleteSet` returns ok.

### `prs.ts`

```ts
export function computePRFlags(workout: Workout, priorWorkouts: readonly Workout[], types: ExerciseTypes): Workout;
```

- **Eligible set:** completed, not a warmup, and passes `canCompleteSet`.
- **Prior workouts:** `status === 'completed'`, `id !== workout.id`, and `startedAt < workout.startedAt`.
- **Categories:**

  | Exercise type | Categories |
  |---|---|
  | `weight_reps` | `weight` (max weightKg) and `e1rm` |
  | `weighted_bodyweight` | `weight` and `e1rm`, counting only sets with added weight > 0 |
  | `bodyweight_reps` | `reps` (max reps in one set) |
  | `duration` | `duration` (max durationSec) |
  | unknown | none |

- **Grouping:** by `exerciseId` across all blocks, so two blocks of the same exercise compete together.
- **Winner per category:** the set with the maximum value. A tie goes to the first set by exercise `order`, then set `order`.
- **Flagging:** the winner is flagged only if its value is strictly greater than the best prior value, comparing values rounded to 4 decimal places.
  - If there is no prior eligible set, nothing is flagged.
- **Output:** a new workout object.
  - Winners get `isPR: true`.
  - Every other set has its `isPR` key deleted.
  - The input is never mutated.

### `finish.ts`

```ts
export interface FinishPlan { incompleteCount: number; cleaned: Workout; isEmpty: boolean }
export function prepareFinish(w: Workout, types: ExerciseTypes, opts: { markIncomplete: boolean; now: number }): FinishPlan;
```

- A set is **done** when it is completed and passes `canCompleteSet`.
- A set is **incomplete** when it is not done and not `isEmptySet`. `incompleteCount` is counted before any cleaning.
- Cleaning steps, in order:
  1. Drop empty sets.
  2. Drop incomplete sets. With `markIncomplete: true`, an incomplete set that passes `canCompleteSet` is kept and set to `completed: true, completedAt: now` instead. One that still fails is dropped.
  3. Drop exercises that have no done sets left.
  4. Renumber `order` for exercises and sets.
- `isEmpty` is true when `cleaned.exercises.length === 0`.

### `duration.ts`

```ts
export function elapsedMs(startedAt: number, now: number): number; // Math.max(0, now - startedAt)
```

### Tests (`src/lib/calc/__tests__/`)

**Validation**
- For each exercise type: blank, 0, negative, NaN, and fractional reps.
- Weight 0 allowed or refused, depending on type.
- Soft caps: 2000 lb passes, 2000.1 lb warns. 999 reps passes, 1000 warns. The cap is measured in the display unit, so lb and kg behave differently.

**Epley**
- Reps of 0, 1, 2, 12 and 13.
- Weight of 0, negative and NaN.
- `225×5` returns 262.5.
- Warmup and incomplete sets return `undefined`.
- `weighted_bodyweight` with 0 added returns `undefined`.

**Volume**
- Warmup sets are excluded.
- Incomplete sets are excluded.
- Bodyweight sets give 0.
- `weighted_bodyweight` with 0 added and with 20 added.
- An unknown exercise id falls back to `weight_reps`.
- An empty workout gives 0.

**PRs**
- First-ever logging gets no flag.
- A tie with the prior best gets no flag.
- Beating the prior by 0.0001 kg is flagged.
- When two sets beat the prior, only the best one is flagged.
- A tie within the workout flags the first set.
- When the `weight` and `e1rm` winners are different sets, both are flagged.
- A heavy warmup set is ignored.
- A "prior" workout that started later is ignored.
- Prior workouts that are in progress or have the same id are ignored.
- Sets over 12 reps are excluded from `e1rm` but still count for `weight`.
- Duplicate blocks of one exercise share one best.
- `bodyweight_reps` reps PR.
- `duration` longest-set PR.
- `weighted_bodyweight` with 0 added gets no weight PR.
- Stale `isPR` keys are cleared.
- The input is not mutated.

**prepareFinish**
- Empty sets are dropped silently.
- Incomplete sets are counted, then dropped.
- `markIncomplete` with a set that is still invalid drops that set.
- An exercise with no sets left is removed.
- `isEmpty`.
- Renumbering.
- A completed set whose data was later cleared (W7).

**Elapsed time**
- A clock that has gone backwards gives 0.

### Other pure helpers

**`src/lib/duration.ts`**
- `parseDurationInput(raw): number | undefined`
  - Digits only: the last two digits are seconds and the rest are minutes. `"130"` is 90 s, and `"90"` is also 90 s.
  - It also accepts `m:ss` and `h:mm:ss`.
  - The maximum is 86399.
- `formatDurationInput(sec): string` returns `m:ss`.

**`src/lib/format.ts`** additions
- `formatElapsed(ms)`: `mm:ss` under one hour, `h:mm:ss` from one hour.
- `formatDurationShort(ms)`: `"1h 12m"`, `"42m"`, or `"<1m"`.

**`src/lib/workoutOps.ts`**
- Every transform is pure: `(w, ...args, ctx: { now: number; newId: () => string }) => Workout`.
- Transforms:
  - `addExercises(ids)`: each new block starts with one empty normal set.
  - `removeExercise(weId)`
  - `restoreExercise(w, we, index)`
  - `moveExercise(weId, -1 | 1)`: a no-op at either end.
  - `setExerciseNotes(weId, notes)`: trims, and limits to `NOTES_MAX`.
  - `addSet(weId)`: copies `weightKg`, `reps` and `durationSec` from the block's last set, with type `'normal'` and `completed: false`.
  - `updateSet(weId, setId, patch: SetPatch)`
  - `setCompleted(weId, setId, completed, now)`
  - `removeSet`
  - `restoreSet(w, weId, set, index)`
  - `rename(name)`: trims, and limits to `NAME_MAX`. An empty name keeps the old one.
  - `setNotes(notes)`
- `defaultWorkoutName(startedAt)`:

  | Local start hour | Name |
  |---|---|
  | 05–11 | "Morning Workout" |
  | 12–16 | "Afternoon Workout" |
  | 17–21 | "Evening Workout" |
  | otherwise | "Night Workout" |

- Every transform renumbers `order`.
- `export type SetPatch = { weightKg?: number | null; reps?: number | null; durationSec?: number | null }`. A `null` deletes the key.
- Test every transform.

## 2. Workouts repo (`src/db/repos/workouts.ts`; data-engineer)

```ts
export interface WorkoutInit { name?: string; templateId?: string; exercises?: WorkoutExercise[] }
export function startWorkout(init?: WorkoutInit): Promise<Workout>;
export function getActiveWorkout(): Promise<Workout | undefined>;
export function observeActiveWorkoutId(): Observable<string | undefined>;
export function observeOtherInProgress(): Observable<Workout[]>;
export function saveActiveWorkout(w: Workout): Promise<boolean>;
export function enqueueActiveWorkout(id: string): Promise<void>;
export type FinishOutcome = { status: 'finished'; workout: Workout } | { status: 'empty' };
export function finishWorkout(w: Workout, opts: { markIncomplete: boolean }): Promise<FinishOutcome>;
export function discardWorkout(id: string): Promise<void>;
export function listCompletedWorkouts(): Promise<Workout[]>; // startedAt desc
export function getWorkout(id: string): Promise<Workout | undefined>;
```

Writes use `db.transaction('rw', [workouts, syncQueue, meta (, exercises)])` directly.

**`startWorkout`**
- If an active workout already exists, it returns that one unchanged.
- Otherwise it creates a workout:
  - `newId()` and `requireUserId()`.
  - `startedAt`, `createdAt` and `updatedAt` all set to now.
  - `status: 'in_progress'`.
  - `name = init.name ?? defaultWorkoutName(now)`.
- It puts the workout and sets meta `activeWorkoutId` in one transaction. It does not enqueue.

**`getActiveWorkout`**
- If the meta id points to a missing row, or to a row that isn't `in_progress`, it clears the meta key and returns `undefined`.

**`observeOtherInProgress`**
- `in_progress` rows other than the active id, sorted by `startedAt` descending.

**`saveActiveWorkout`**
- Returns `false` without writing unless the meta id equals `w.id` and the row is still `in_progress`.
- Otherwise it puts the workout with `updatedAt: now`.
- Quota errors propagate.

**`enqueueActiveWorkout`**
- If the row is still the active workout, enqueues an upsert of the stored row.

**`finishWorkout`**
- All in one transaction:
  1. Load the exercise type map and the completed prior workouts.
  2. Run `prepareFinish`. If the result is empty, return `{ status: 'empty' }` without writing anything.
  3. Run `computePRFlags`.
  4. Set `endedAt = Math.max(now, startedAt)`, `status: 'completed'`, and `updatedAt`.
  5. Put the workout, enqueue an upsert, and delete the meta key.

**`discardWorkout`**
- Deletes the row locally and enqueues a delete.
- Clears meta if the id matches.
- Also used for the Q7 remote discard.

**`syncApply.ts`**
- Apply the W3 skip.
- Tests: the active workout's upsert and tombstone are both skipped, and other workout ids still apply.

**Repo tests**
- Starting is idempotent.
- Saving is refused after finish and after discard.
- Saving creates no outbox entry; enqueueing creates exactly one.
- Finishing flags a PR against seeded history, clears meta, and enqueues exactly once.
- Finishing an empty workout writes nothing.
- Discarding deletes the row, enqueues a tombstone, and clears meta.
- The active workout self-heals when its row is missing or not `in_progress`.
- `observeOtherInProgress` excludes this device's active workout.
- `listCompletedWorkouts` filters and sorts correctly.

## 3. Store (`src/store/activeWorkout.ts`; data-engineer)

```ts
type CompleteResult = { ok: true; completed: boolean } | { ok: false; field: InvalidField };
interface ActiveWorkoutState {
  status: 'idle' | 'loading' | 'ready';
  workout: Workout | null;
  saveError: boolean;
  start(init?: WorkoutInit): Promise<Workout>;
  addExercises(ids: string[]): void; removeExercise(weId: string): void;
  moveExercise(weId: string, dir: -1 | 1): void; setExerciseNotes(weId: string, notes: string): void;
  addSet(weId: string): void; updateSet(weId: string, setId: string, patch: SetPatch): void;
  toggleComplete(weId: string, setId: string, type: ExerciseType): CompleteResult;
  removeSet(weId: string, setId: string): void; // shows Undo toast
  rename(name: string): void; setNotes(notes: string): void;
  flush(): Promise<void>; // save now, then enqueue now
  finish(opts: { markIncomplete: boolean }): Promise<FinishOutcome>;
  discard(): Promise<void>;
}
export const useActiveWorkoutStore: UseBoundStore<StoreApi<ActiveWorkoutState>>;
export function initActiveWorkoutStore(): () => void;
export function isWorkoutActive(s: ActiveWorkoutState): boolean; // s.workout !== null || s.status === 'loading'
```

**Mutations**
- Each mutation applies a `workoutOps` transform and sets `workout`.
- It then resets the 300 ms save timer, and starts the 5 s enqueue timer if one isn't already pending.

**`flush`**
- Cancels both timers, awaits the save, then awaits the enqueue.

**`toggleComplete`**
- Checking a set runs `canCompleteSet`. If that fails, it returns `{ ok: false, field }` and changes nothing.
- Unchecking always succeeds and removes `completedAt`.

**`finish` / `discard`**
- Flush, clear the timers, call the repo, then set `workout: null`.

**`initActiveWorkoutStore()`**
- Called from `App.tsx` once the user is signed in.
- Sets `loading`, hydrates, then sets `ready`.
- Subscribes to `observeActiveWorkoutId`, and re-hydrates when the id differs from the current workout.
- Flushes on `visibilitychange` (hidden) and `pagehide`.
- Returns a cleanup function.

**Save failure**
- Sets `saveError = true` and shows the toast "Couldn’t save. Storage may be full."

**`src/pwa/updatePrompt.ts`**
- Remove the stub.
- `const active = useActiveWorkoutStore(isWorkoutActive)` and `visible = needRefresh && !dismissed && !active`.
- Update the tests:
  - no toast while a workout is active or loading;
  - the toast appears after finishing.

**`src/hooks/useNow.ts`**
- `useNow(intervalMs = 1000): number` reads `Date.now()` on each tick rather than counting ticks.

**Store tests** (fake timers)
- 10 updates within 300 ms produce 1 save.
- Edits spread over 6 s produce exactly 1 outbox entry, at 5 s, with no timer reset.
- A hidden event flushes immediately.
- Finishing cancels the timers, and no write happens afterwards.
- An invalid toggle returns the failing field and leaves state unchanged.
- `addSet` prefills from the previous set.
- Removing a set, then Undo, restores it at the same position.
- An external meta change triggers a re-hydrate.
- A save failure shows the error toast.

## 4. UI (ui-builder)

### Routes

- `workout/active` renders `ActiveWorkout`.
- `workout/summary/:id` renders `Summary`.
- Move `src/routes/WorkoutTab.tsx` to `src/routes/WorkoutTab/WorkoutHome.tsx`. The same folder also holds `ActiveWorkout.tsx`, `Summary.tsx` and `FinishFlow.tsx`. Fix imports and tests (grep first).
- `Layout` hides the tab bar on `/workout/*`.
- `Layout` renders `<WorkoutMiniBar/>` above the tab bar when a workout is active and the path isn't `/`. Add 48 px of extra bottom padding when it shows.

### `src/components/ui/NumberInput.tsx`

```ts
props: { value: number | undefined; onCommit(v: number | undefined): void; mode: 'decimal' | 'integer' | 'duration';
         format(v: number): string; parse(raw: string): number | undefined; 'aria-label': string;
         invalid?: boolean; maxLength?: number; className?: string }
```

- While focused, the input keeps a local draft. When not focused, it shows `format(value)`, so switching units re-renders the value from kg.
- `inputMode` is `decimal`, or `numeric` for the `integer` and `duration` modes.
- Text is 16 px. The text is selected on focus. `aria-invalid` reflects `invalid`. The background uses the surface-2 tint.
- On each change:
  - commit if `parse` succeeds or the field is empty;
  - otherwise keep the draft and don't commit.
- `integer` mode strips non-digits.
- For weight, `parse = (r) => fromDisplayInput(r, unit)` and `format = (kg) => formatWeight(kg, unit)`.

### `src/components/workout/SetRow.tsx`

About 48–52 px tall (§8.5).

```ts
props: { set: WorkoutSet; index: number; type: ExerciseType; unit: Unit;
         onChange(p: SetPatch): void; onToggle(): CompleteResult; onBadge(): void }
```

**Columns, left to right**
1. SET badge: 32 px, shows `index + 1`.
2. PREVIOUS: flexible width, shows "—" (inert until M4).
3. Input columns, by exercise type:

   | Exercise type | Inputs |
   |---|---|
   | `weight_reps` | weight (~72 px) and reps (~64 px) |
   | `bodyweight_reps` | reps only |
   | `weighted_bodyweight` | weight and reps |
   | `duration` | TIME (mm:ss) |

4. ✓ button: a 40 px circle.

**Completed sets**
- Row background `bg-accent-tint`, with dimmed inputs.
- The ✓ becomes a filled check icon, so the state isn't shown by colour alone.
- The ✓ button has `aria-pressed`. Its label is "Complete set N", or "Mark set N incomplete" once completed.

**Invalid toggle**
- Shake the row (`animate-shake`; keyframes go in `tailwind.config.ts`). Under reduced motion, show a danger outline instead.
- Focus the offending input.
- Announce through `aria-live`: "Enter a weight", "Enter reps" or "Enter a time".

**Soft warnings**
- Caption in `text-warning`: "Over 2000 lb. Check for a typo." or "Over 999 reps. Check for a typo."

**Badge tap**
- Opens a BottomSheet with "Delete set".
- After deleting, show the toast "Set deleted" with an "Undo" action.

### `src/components/workout/WorkoutSetTable.tsx`

- Column headers: SET | PREVIOUS | LB/KG (+LB/+KG for `weighted_bodyweight`) | REPS | TIME | ✓.

### `src/components/workout/ExerciseCard.tsx`

- The header shows the exercise name, or "Deleted exercise".
- The ⋯ menu opens a BottomSheet with:
  - Add note / Edit note
  - Move up / Move down (disabled at either end)
  - Remove exercise: shows the toast "Removed {name}" with an "Undo" action
- The note TextArea shows when a note exists or after "Add note". Placeholder: "Add a note".
- "+ Add Set" sits below the set rows.

### `ActiveWorkout.tsx`

**State handling**
- When the store is `ready` and there's no workout, render `<Navigate to="/" replace/>`.
- While loading, render nothing.

**Sticky header**
- Chevron button, aria-label "Minimize workout". It calls `flush()`, then navigates to `/`.
- Name field (aria-label "Workout name"). It commits on blur or Enter.
- `formatElapsed` timer.
- Primary **Finish** button.

**Body**
- Exercise names and types come from `useLiveQuery(() => listExercises({ includeArchived: true }))`, turned into a Map.
- "+ Add Exercise" opens `ExercisePicker` titled "Add exercises".
- A destructive "Cancel Workout" button opens a dialog:
  - title: "Discard this workout?"
  - body: "This can't be undone."
  - buttons: "Discard workout" / "Keep logging"
- Empty state: "No exercises yet" / "Add an exercise to start logging sets."
- Call `flush()` on unmount.

### `WorkoutHome.tsx`

- **No active workout:** a primary "Start Empty Workout" button. It calls `start()`, then navigates to `/workout/active`.
- **Active workout:** a banner button reading "Workout in progress · {elapsed} · Resume", which opens `/workout/active`.
- **Workouts in progress on another device** (`observeOtherInProgress`), one row each:
  - Title "In progress on another device", subtitle "{name} · started {h:mm a}", and a "Discard" button.
  - "Discard" opens a confirm dialog:
    - title: "Discard this workout?"
    - body: "It will be deleted on all your devices. If it's still open on the other device, it will come back the next time that device saves."
    - buttons: "Discard workout" / "Cancel"
  - Starting a workout stays available.
- Keep the existing header: sync indicator and settings gear.

### `FinishFlow.tsx`

Run `prepareFinish(w, types, { markIncomplete: false, now })` first, then:

- **No incomplete sets and not empty:** finish immediately, then `replace` to `/workout/summary/:id`.
- **Incomplete sets:** a dialog.
  - Title: "Finish workout?"
  - Body: "You have {N} incomplete set{s}. Finish anyway?"
  - Buttons:
    - "Mark complete & finish" (primary): `markIncomplete: true`
    - "Discard incomplete sets & finish"
    - "Cancel"
- **Empty, or the outcome comes back `empty`:** a dialog.
  - Title: "Nothing to save"
  - Body: "This workout has no completed sets. Discard it?"
  - Buttons: "Discard workout" (destructive) / "Keep logging"
- **Optional (3.5b):** if the workout has run for more than 6 h, first show a dialog:
  - Title: "Set end time?"
  - Body: "This workout has been running {N} h. Set end time?"
  - A `datetime-local` input, limited to between `startedAt` and now.
  - Buttons: "Use this time" / "Keep now"
  - This needs a `finishWorkout(..., { endedAt? })` option.

### `Summary.tsx`

- The title is the workout name.
- Stats:
  - Duration: `formatDurationShort(endedAt - startedAt)`.
  - "Total volume": `formatWeight(workoutVolume, unit, { withUnit: true })`.
  - "Sets": `completedSetCount`.
- "Personal records": one trophy row per PR, such as "{exercise} · 225 lb × 5". Duration PRs show the time, such as "1:30".
- With no PRs, show "No new records this time."
- "Done" navigates `replace` to `/`.
- An unknown workout id shows "Workout not found" with a "Done" button.

## 5. Order and tests

| # | Task | Agent | Files | Depends on |
|---|---|---|---|---|
| 3.1 | calc, `duration`, `format`, `workoutOps`, plus their tests | data-engineer | `src/lib/calc/*`, `src/lib/{duration,format,workoutOps}.ts` | none |
| 3.3 | NumberInput, SetRow, WorkoutSetTable, shake keyframes, plus RTL tests | ui-builder | `src/components/ui/NumberInput.tsx`, `src/components/workout/{SetRow,WorkoutSetTable}.tsx`, `tailwind.config.ts` | Only type imports from `validation.ts` and `workoutOps.ts`, which land first in 3.1. Can run in parallel with 3.1. |
| 3.2a | meta type, workouts repo, `syncApply` W3 skip, plus tests | data-engineer | `src/db/schema.ts`, `src/db/repos/{workouts,syncApply}.ts`, tests | 3.1 |
| 3.2b | store, `useNow`, `updatePrompt` wiring, `App.tsx` init line, plus tests | data-engineer | `src/store/activeWorkout.ts`, `src/hooks/useNow.ts`, `src/pwa/updatePrompt*`, `src/App.tsx` | 3.2a |
| 3.4 | routes and Layout, WorkoutHome, banner, mini-bar, remote row, ActiveWorkout, ExerciseCard | ui-builder | `src/routes/WorkoutTab/*`, `src/components/workout/*`, `src/App.tsx` | 3.2b, 3.3 |
| 3.5 | FinishFlow, Summary (3.5b optional) | ui-builder | `src/routes/WorkoutTab/{FinishFlow,Summary}.tsx` | 3.4 |
| 3.6 | RTL and Playwright | qa-engineer | `src/routes/WorkoutTab/__tests__/`, `e2e/auth/active-workout.spec.ts` | 3.5 |

### RTL tests

- **SetRow**
  - The columns are right for each of the 4 exercise types.
  - `weighted_bodyweight` shows the "+LB" header.
  - Switching between lb and kg re-renders the same stored kg value.
  - Typing "137,5" commits 137.5 lb, stored as kg.
  - Completing a set with a blank weight shakes the row and focuses the weight input.
  - A bodyweight set completes with no weight.
- **Workout screen**
  - Adding a set prefills it from the previous set.
  - An unknown exercise id shows "Deleted exercise".
- **Finish flow**
  - The three-option dialog, with both finish branches.
  - An empty workout leads to the discard dialog.
  - The summary values and the PR row.
- **Workout home**
  - The banner shows the elapsed time.
  - A row for another device's workout has no Resume button.

### Playwright (`e2e/auth/active-workout.spec.ts`; runs locally now that Docker works, and in CI)

1. **Reload mid-workout**
   - Start a workout, add an exercise, enter 135 × 5, wait 400 ms, then reload.
   - The banner should show and the values should still be there.
   - Advance `page.clock` by 2 minutes: the elapsed time should read at least 02:00.
2. **Offline round trip**
   - Go offline and complete a full workout.
   - Go back online and poll Supabase until the row arrives with:
     - `status = 'completed'` and `ended_at` set;
     - `exercises[0].sets[0].weightKg` ≈ 61.235, which is 135 lb;
     - `reps = 5` and `completed = true`.
3. **Second device**
   - Device A starts a workout and keeps it in progress for at least 7 s.
   - Device B shows "In progress on another device" and does not auto-open the workout.
4. **Update toast suppressed during a workout**
   - Covered by the `updatePrompt` unit tests. Add an e2e test only if the stub makes it easy.

## 6. Risks

- **R-a.** Without the W3 skip, a pull between enqueues can roll back up to 5 s of edits. The reviewer must verify the skip is in place.
- **R-b.** The unsynced count shown at sign-out doesn't include saves that haven't been enqueued yet. Flushing on unmount and on hidden covers this. Test that leaving the ActiveWorkout screen produces an outbox entry.
- **R-c.** Two tabs on one device share `activeWorkoutId`, and the last write wins. The PRD's multi-tab warning (§11, P1) is deferred to M10.
- **R-d.** `datetime-local` and the iOS keyboard. Keep 3.5b optional.
- **R-e.** Moving `WorkoutTab.tsx` can break imports and tests. Grep before deleting it.
