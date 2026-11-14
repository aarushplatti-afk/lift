# Milestone 4 Implementation Spec: Rest Timer and Polish (branch m4-timer-polish)

Written by `architect` and binding for M4 builders. M1 §0, M2 §0 and M3 §0 (W1–W8, U1–U5) still apply.

## 0. Decisions

**Accepted 2026-11-14.** These are the architect's defaults, accepted under the owner's blanket authorization. All are reversible.

- **T1. No migration and no Dexie version bump.** The only schema change is type-level: add `| { key: 'restTimer'; value: RestTimerSnapshot }` to `MetaRow` in `src/db/schema.ts`.
- **T2. The rest timer survives a reload.**
  - The snapshot `{ workoutId, endsAt, durationSec }` is stored in Dexie meta. Wipe clears it.
  - On load, it is restored only if `workoutId` is the active workout and `endsAt > now`.
- **T3. Late completion is silent.** The chime and vibration play only when the page is visible and the timer is no more than `LATE_GRACE_MS = 5000` past `endsAt`. Otherwise the UI just shows "Rest complete".
- **T4. Where the timer shows.**
  - The RestTimerBar appears only on `/workout/active`.
  - When the workout is minimized, the mini-bar adds "Rest 1:12".
  - The store handles completion effects, so they still happen while minimized.
- **T5. Badge numbers count only `normal` sets**, so a block reads 1, 2, D, 3. Warm-ups show "W", drop sets "D", failure sets "F". Accessible names keep the raw position: "Set {index+1} options".
- **T6. Matching the PREVIOUS column.**
  - Warm-ups match warm-ups. Working sets (normal, drop and failure) match working sets.
  - Prior sets are all blocks of that exercise joined in order, completed sets only.
  - Each block in the current workout counts from 1.
- **T7. Tap-to-fill is disabled on completed rows.**
- **T8. Unsupported features.**
  - The Haptics toggle is hidden when `navigator.vibrate` is missing.
  - The Keep screen awake toggle is disabled with "Not supported in this browser." when the Wake Lock API is missing.
- **Also accepted.**
  - There is no manual timer start when auto-start is off.
  - The PRD weight-increment setting is deferred until +/- buttons exist.
  - `soundEnabled` stays true by default.
- **Platform helpers** live in `src/lib/platform/`. They may use browser APIs but must not use React. `src/lib/calc` stays pure.

## 1. Pure layer (data-engineer, 4.1)

**`src/lib/calc/rest.ts`.** Move these constants here from `src/db/repos/settings.ts` and import them back there.

```ts
export const REST_MIN_SEC = 15, REST_MAX_SEC = 600, REST_STEP_SEC = 15;
export function clampRestSeconds(sec: number): number; // round to 15, clamp 15..600; non-finite → 90
```

**`src/lib/calc/previous.ts`**

```ts
export type SetGroup = 'warmup' | 'working';
export function setGroup(t: SetType): SetGroup;
export function groupOrdinals(sets: readonly WorkoutSet[]): number[]; // 0-based ordinal within its group
export function setBadgeLabels(sets: readonly WorkoutSet[]): string[]; // T5
export function pickPreviousWorkout(exerciseId: string, beforeStartedAt: number, workouts: readonly Workout[]): Workout | undefined;
export function previousSetFor(exerciseId: string, ordinal: number, setType: SetType, previous: Workout | undefined): WorkoutSet | undefined;
```

- **`pickPreviousWorkout`**
  - Candidates are workouts that are `completed`, have `startedAt < beforeStartedAt`, and contain the exercise.
  - It returns the candidate with the highest `startedAt`. Ties go to the higher `id`.
- **`previousSetFor`**
  - Joins the completed sets of every matching block, in block order and then set order.
  - Keeps only sets in the same group as `setType`, then returns the one at `[ordinal]`, or `undefined`.

**`src/lib/format.ts`.** Add `formatPreviousSet(set: WorkoutSet | undefined, type: ExerciseType, unit: Unit): string`.

| Exercise type | Output |
|---|---|
| `weight_reps` | "135 × 5" ("—" if a field is missing) |
| `bodyweight_reps` | "BW × 10" |
| `weighted_bodyweight` | "+20 × 8" when the added weight is above 0, otherwise "BW × 8" |
| `duration` | `formatDurationInput`, e.g. "1:30" |
| no set | "—" |

The weight has no unit suffix.

**`src/lib/workoutOps.ts`**

- `setSetType(w, weId, setId, type, ctx)`: returns `w` unchanged when the type is already set.
- `setRestSeconds(w, weId, sec: number | null, ctx)`: `null` deletes the override; any other value is clamped with `clampRestSeconds`. Returns `w` when nothing changes.

**`src/db/repos/workouts.ts`**

```ts
export function getLastCompletedWithExercises(exerciseIds: readonly string[], beforeStartedAt: number): Promise<Map<string, Workout>>;
```

- One pass over `where('startedAt').below(beforeStartedAt).reverse()`.
- Skips workouts that aren't completed.
- Stops once every id has a match.

**`src/db/repos/meta.ts`**

```ts
export interface RestTimerSnapshot { workoutId: string; endsAt: number; durationSec: number }
export function getRestTimer(): Promise<RestTimerSnapshot | undefined>;
export function setRestTimer(s: RestTimerSnapshot | null): Promise<void>; // null deletes
```

**Tests**

- `previous.test.ts`
  - The most recent completed workout wins.
  - In-progress workouts, the same start time, and later workouts are ignored.
  - A tie on `startedAt` resolves deterministically.
  - Warm-ups match only warm-ups.
  - Working sets skip prior warm-ups: a prior W,1,2 against a current 1 matches prior 1.
  - Drop and failure sets count as working sets.
  - When the prior workout has fewer sets, the result is `undefined`.
  - Incomplete prior sets are skipped.
  - Duplicate prior blocks are joined.
  - An unknown exercise gives `undefined`.
  - `setBadgeLabels` turns W,W,1,2,D,3,F into the expected labels.
- `formatPreviousSet`: all four exercise types, in both lb and kg, plus missing fields.
- `workoutOps`: no-ops, clamping, `null` deleting the override, and renumbering.
- Repo: a batch lookup over three exercises; `beforeStartedAt` excludes the active workout; the meta rest-timer snapshot round-trips.

## 2. Rest timer store (data-engineer, 4.2): `src/store/restTimer.ts`

```ts
export type RestPhase = 'idle' | 'running' | 'done';
interface RestTimerState {
  phase: RestPhase; endsAt: number | null; durationSec: number; workoutId: string | null;
  start(sec: number, workoutId: string): void; // restarts if running
  adjust(deltaSec: 15 | -15): void;
  skip(): void;
  tick(now?: number): void; // completes once if now >= endsAt
}
export const useRestTimerStore: UseBoundStore<StoreApi<RestTimerState>>;
export function remainingMs(s: Pick<RestTimerState, 'endsAt' | 'durationSec'>, now: number): number; // clamp 0..durationSec*1000
export function initRestTimer(): () => void;
export const DONE_DISPLAY_MS = 3000, LATE_GRACE_MS = 5000, REST_ADJUST_CAP_SEC = 3600;
```

- **`start`**
  - Sets `endsAt = now + sec * 1000` and the phase to `running`.
  - Arms a single `setTimeout(tick, endsAt - now)`. `endsAt` is the source of truth; ticks are not counted.
  - Persists the snapshot without waiting for it. A failed write is ignored.
- **`adjust`**
  - Shifts both `endsAt` and `durationSec`. The remaining time is capped at 3600 s.
  - A −15 that brings the remaining time to 0 or below acts like `skip`: it stops silently.
  - Re-arms the timeout and persists.
- **`skip`**: clears the timeout, sets the phase to `idle`, and deletes the snapshot.
- **Completion**
  - Sets the phase to `done` and deletes the snapshot.
  - Plays the T3 effects: `playChime()` if `soundEnabled`, and `vibrate(HAPTIC_REST_DONE)` if `hapticsEnabled`. Settings come from `useSettingsStore.getState()`.
  - Returns to `idle` after `DONE_DISPLAY_MS`.
- **`initRestTimer()`** is called in `App.tsx` next to `initActiveWorkoutStore`, only when the user is signed in. It:
  - Restores the snapshot once the active-workout store is `ready`. A snapshot that has already expired is dropped silently.
  - Calls `tick()` on `visibilitychange` to visible.
  - Subscribes to the active-workout store. When the store is `ready` and the workout id differs from the timer's `workoutId`, it calls `skip()`.
  - On cleanup: removes its listeners, clears the timeout, and resets to idle. It does not delete the meta snapshot.
- **Auto-start** happens in `ExerciseCard`. When `toggleComplete` returns `{ ok: true, completed: true }`, it calls:
  1. `unlockChime()`, synchronously.
  2. `vibrate(HAPTIC_TAP)`, if haptics are on.
  3. `start(we.restSeconds ?? settings.defaultRestSeconds, workout.id)`, if auto-start is on.

  Unchecking a set never cancels the timer.
- **Store tests** (fake timers, with the platform helpers and meta mocked)
  - Completion fires exactly once at `endsAt`.
  - Effects follow the sound and haptics settings.
  - +15 extends both the remaining time and the duration.
  - −15 past zero stops silently.
  - `skip` produces no effects.
  - Calling `start` again replaces the current timer.
  - A simulated lock: `setSystemTime(+120 s)`, then a visible event, leaves the phase `done` with no chime. The stale timeout that fires later does nothing.
  - Restore accepts a snapshot for the same workout that hasn't expired, and rejects one for a different workout or one that has expired.
  - The timer resets when the active workout becomes `null`.
  - The clock moving backwards is clamped.

## 3. Platform helpers (pwa-engineer, 4.3): `src/lib/platform/`

**`wakeLock.ts`**

```ts
export function isWakeLockSupported(): boolean;
export function keepAwake(): () => void;
```

- Requests the lock when the page is visible.
- Re-requests it on `visibilitychange` to visible if there is no sentinel or it was released.
- Swallows rejections.
- The returned cleanup releases the lock and removes the listener.

**`src/hooks/useWakeLock.ts`**

- `useWakeLock(enabled: boolean): void` is `useEffect(() => enabled ? keepAwake() : undefined, [enabled])`.

**`haptics.ts`**

```ts
export const HAPTIC_TAP = 10;
export const HAPTIC_REST_DONE: readonly number[] = [200, 100, 200];
export function isVibrationSupported(): boolean;
export function vibrate(pattern: number | readonly number[]): void; // no-op if unsupported; try/catch
```

**`chime.ts`**

```ts
export function unlockChime(): void; // lazily create AudioContext (webkitAudioContext typed locally, no any); resume() every call
export function playChime(): void;   // no-op unless state === 'running'
```

- The chime is two WebAudio sine tones, 880 Hz then 1320 Hz, about 150 ms each, with a gain envelope peaking at 0.2.
- No audio assets and no CDN.

**Tests**

- Wake lock:
  - acquires when the page is visible;
  - re-acquires on visible after a release;
  - cleanup releases the lock;
  - unsupported browsers don't throw;
  - a rejected request is swallowed.
- Haptics: no call when unsupported, the right arguments when supported, and exceptions swallowed.
- Chime: playing before unlock does nothing; unlock creates one context and resumes it; playing starts 2 oscillators.

## 4. UI kit (ui-builder, 4.4a)

**`Toggle.tsx`**

```ts
{ label: string; checked: boolean; onChange(v: boolean): void; description?: string; disabled?: boolean }
```

- Renders a `button` with `role="switch"` and `aria-checked`.
- The whole row is the tap target, at least 44 px tall.

**`Stepper.tsx`**

```ts
{ label: string; value: number; min: number; max: number; step: number; format(v: number): string; onChange(v: number): void }
```

- The − and + buttons are 44 px, labelled "Decrease {label}" and "Increase {label}", and disabled at the bounds.
- The value is in an `aria-live="polite"` region.

**`SwipeRow.tsx`**

```ts
{ children: ReactNode; onDelete(): void; deleteLabel: string; disabled?: boolean }
```

- **Gesture detection.** It uses pointer events with `touch-action: pan-y`.
  - The swipe locks horizontal only after 8 px of movement where `|dx| > 1.5·|dy|`.
  - Only after that lock does it call `setPointerCapture`, so a drag that starts on an input still lets the input take focus.
- **Releasing the swipe.**
  - At 80 px or more to the left, the row snaps open and shows an 80 px danger "Delete" button.
  - At 50% of the row width or more, the row is deleted immediately.
  - Less than 80 px snaps the row back.
- **Closing.**
  - A tap anywhere else closes the open row.
  - Only one row can be open at a time; a module-level closer enforces this.
  - While the row is closed, the Delete button has `tabIndex={-1}` and is `aria-hidden`.
- **Reduced motion** uses `motion-safe:transition-transform`.
- **Accessibility.** The badge menu's "Delete set" is the keyboard and screen-reader alternative to swiping.
- **Tests:**
  - a swipe past the threshold deletes;
  - a short swipe snaps back;
  - a vertical drag never locks horizontal;
  - the revealed Delete button works;
  - a disabled row ignores swipes.

## 5. Workout UI (ui-builder, 4.4b)

**`SetRow.tsx`.** New props: `badge: string`, `previousText: string`, and `onFillPrevious?: () => void`.

- `onFillPrevious` is `undefined` when there is nothing to fill, or when the row is completed.
- **PREVIOUS cell.** A button with aria-label "Use previous: 135 × 5" when fill is available, otherwise a span.
- **Badge.** Its aria-label is "Set N options". Non-normal sets add the type: ", warm-up", ", drop set" or ", failure".
- **Filling.** Calls `onChange` with only the fields that apply to the exercise type, copying the prior values in kg exactly.

**`ExerciseCard.tsx`.** New prop: `previous: Workout | undefined`.

- **Per set**, it calls `groupOrdinals`, `setBadgeLabels` and `previousSetFor`, then `formatPreviousSet`.
- **Swipe to delete.** Each row is wrapped in a SwipeRow with `deleteLabel` "Delete set N", whose delete calls `removeSet`. The existing "Set deleted" toast with Undo still applies.
- **Badge sheet**, titled "Set N":
  - A radiogroup labelled "Set type" with options "Normal", "Warm-up", "Drop set" and "Failure". Picking one calls `setSetType` and closes the sheet.
  - The existing danger "Delete set" button.
- **⋯ menu.** Adds "Rest timer: 1:30", or "Rest timer: Default (1:30)" when there's no override, just before "Remove exercise".
- **Rest timer sheet:**
  - A Stepper labelled "Rest time": 15–600 s in 15 s steps, shown in m:ss.
  - "Use default" calls `setRestSeconds(null)`.
  - "Done" saves the stepper value.

**Store (`src/store/activeWorkout.ts`).** Add `setSetType(weId, setId, type)` and `setRestSeconds(weId, sec | null)`, both routed through `mutate`.

**`RestTimerBar.tsx`**

- **Layout.**
  - Fixed to `bottom-0` with `z-30`. Its height is 64 px plus `env(safe-area-inset-bottom)`.
  - The toast sits at 72 px, above the bar.
  - While the bar shows, the ActiveWorkout `<main>` gets `pb-[calc(88px+env(safe-area-inset-bottom))]`.
- **Contents.**
  - "Rest" and an m:ss countdown in tabular figures. It updates with `useNow(250)` and uses `Math.ceil` of the remaining seconds.
  - A `role="progressbar"` with aria-label "Rest remaining" and `aria-valuemax={durationSec}`.
  - Three buttons:

    | Button | aria-label |
    |---|---|
    | "−15s" | "Subtract 15 seconds" |
    | "+15s" | "Add 15 seconds" |
    | "Skip" | "Skip rest" |

- **Done phase** shows "Rest complete".
- **Screen readers.** An sr-only `aria-live="polite"` region announces only "Rest started, 1:30" and "Rest complete".
- **Motion.** The bar slides up with `motion-safe:transition-transform`.

**`ActiveWorkout.tsx`**

- Calls `useWakeLock(settings.keepScreenAwakeDuringWorkout)`. Unmounting releases the lock.
- Fetches the previous workouts with:
  ```ts
  useLiveQuery(() => getLastCompletedWithExercises(ids, workout.startedAt), [idsKey, workout.startedAt], new Map())
  ```
  `idsKey` is the sorted, de-duplicated exercise ids joined with "|".
- Passes `previous={map.get(we.exerciseId)}` to each card.
- Renders `<RestTimerBar/>`.

**`WorkoutMiniBar.tsx`**

- While the timer runs, shows "· Rest 1:12" before "Resume".
- During the done phase, shows "· Rest complete".

**`SettingsPage.tsx`.** New "Workout" section between Appearance and Account & Sync:

| Control | Label | Description / behaviour |
|---|---|---|
| Stepper | "Default rest time" | 15–600 s, 15 s steps, m:ss |
| Toggle | "Auto-start rest timer" | — |
| Toggle | "Sound" | "Chime when rest ends. Muted by the silent switch on iPhone." |
| Toggle | "Haptics" | Hidden when vibration isn't supported |
| Toggle | "Keep screen awake" | "While the workout screen is open." When unsupported: disabled, with "Not supported in this browser." |

## 6. PROGRESS follow-ups (data-engineer, 4.2)

**`src/pwa/updatePrompt.ts`**

- Add a `useAuthStore.subscribe` that resets `hydratedOnce = false` whenever `status !== 'signedIn'`.
- Test: sign out, then sign back in while the store is `idle`. No toast should appear.

**`hydrate()` in `src/store/activeWorkout.ts`**

- Add a module-level `hydrateGen` counter.
- After `await flushNow()`:
  1. Read `getActiveWorkout()` again.
  2. Return early if the generation is stale or the ids now match.
  3. Call `resetPersistence()` before `setState`.
- Tests:
  - two meta id changes during a slow flush: the final id wins;
  - an edit made during the flush doesn't enqueue the incoming row.

## 7. Order, groups, tests

| # | Task | Agent | Files | Depends on |
|---|---|---|---|---|
| 4.1 | §1 pure layer, repo, meta, settings constants | data-engineer | `src/lib/calc/{rest,previous}.ts`, `src/lib/{format,workoutOps}.ts`, `src/db/schema.ts`, `src/db/repos/{workouts,meta,settings}.ts` | — |
| 4.3 | §3 platform helpers and `useWakeLock` | pwa-engineer | `src/lib/platform/*`, `src/hooks/useWakeLock.ts` | — |
| 4.4a | Toggle, Stepper, SwipeRow | ui-builder | `src/components/ui/{Toggle,Stepper,SwipeRow}.tsx` | — |
| 4.2 | Rest timer store, new store actions, §6, `App.tsx` init | data-engineer | `src/store/{restTimer,activeWorkout}.ts`, `src/pwa/updatePrompt.ts`, `src/App.tsx` | 4.1, 4.3 |
| 4.4b | §5 workout UI and settings | ui-builder | `src/components/workout/*`, `src/routes/WorkoutTab/ActiveWorkout.tsx`, `src/routes/SettingsPage.tsx` | 4.2, 4.4a |
| 4.5 | RTL and e2e tests | qa-engineer | `src/routes/**/__tests__/`, `e2e/auth/rest-timer.spec.ts` | 4.4b |

4.1, 4.3 and 4.4a can run in parallel.

**RTL tests (4.5)**

- **Previous column**
  - It shows the prior set, e.g. "135 × 5".
  - Tapping it fills the values and leaves the set incomplete.
  - In kg mode it shows converted values.
  - A completed row can't be filled.
  - A missing prior set shows "—".
- **Badge sheet**
  - Choosing W, D or F updates the badges to 1, 2, D, 3.
  - Delete works.
- **Swipe**: swipe to delete, then Undo restores the set at the same position.
- **Rest timer**
  - Completing a set starts the timer from the exercise override, or the default when there is none.
  - With auto-start off, no bar appears.
  - Unchecking a set keeps the timer running.
  - Skip, −15 and +15 work.
- **Settings**
  - Each toggle and the stepper send the right patch.
  - Haptics is hidden when vibration isn't supported.

**e2e (`e2e/auth/rest-timer.spec.ts`)**

1. Complete a set: the bar shows about 1:30. Reload: the bar is restored with less than 1:30 left.
2. Fast-forward 95 s with `page.clock`: "Rest complete" shows.
3. Set a 2:00 override, then complete the next set: the bar starts at 2:00.

## 8. Risks

- **R4-a.** Wake Lock in iOS home-screen PWAs was unreliable before iOS 18.4. Feature-detect it and swallow errors. The device checklist covers both iPhone and Android.
- **R4-b.** iOS WebAudio follows the silent switch, and the context can be interrupted. Call `resume()` on every set tap.
- **R4-c.** Nothing can fire while the screen is locked. The timer is correct once the page is visible again. Background notifications are P2.
- **R-d.** SwipeRow and inputs: lock horizontal only after 8 px of movement, never on pointerdown.
- **R-e.** The previous-workout live query re-runs on every active save. That is acceptable at about 100 workouts. Memoize on `idsKey` if profiling flags it.
