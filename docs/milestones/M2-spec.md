# Milestone 2 Implementation Spec: Exercise Library (branch m2-exercises)

Written by `architect` and binding for M2 builders. M1-spec §0 (D1–D12) still applies.

## 0. Decisions

- **E1. No schema change.** No migration and no Dexie version bump. `archived` stays unindexed (R6), so filtering happens in memory.
- **E2. Name normalization.**
  - Stored names are trimmed, with runs of whitespace collapsed to one space.
  - `nameKey = normalized.toLowerCase()` decides uniqueness. It does not fold diacritics, so it matches the server's `lower(name)`.
  - Search folds diacritics (NFD, strip `\p{M}`), lowercases, and collapses whitespace and `-` to one space. It then matches a substring, so "cafe" finds "Café" and "pull up" finds "Pull-Up".
- **E3. Sort order:** `Intl.Collator(undefined, { sensitivity: 'base', numeric: true })` on the name, with id as the tie-break.
- **E4. Seeded exercises** (`isCustom: false`): the name and type are locked. Notes, muscleGroup and equipment can be edited. They are never hard-deleted.
- **E5. Custom exercises:** the type locks once `isExerciseUsed` is true.
- **E6. No-op writes are skipped:** no Dexie write and no outbox entry.
- **E7. Seeding skips names the user already has.** If any local exercise (archived included) has the same nameKey, that seed entry is not inserted.
- **User answers, 2026-11-13** (the main session chose under the user's blanket authorization; the user can reverse them):
  - Q1: yes to E4.
  - Q2: yes to E5.
  - Q3: the seed grows to 98 (PRD §10's 69 plus the 29 additions in §3).

## 1. Repo contract (data-engineer)

**Pure helpers in `src/lib/exercises.ts`** (no React, no Dexie):
- `MUSCLE_GROUPS: readonly { value: MuscleGroup; label: string }[]`, in PRD order.
- `EQUIPMENT`, with the same shape.
- `EXERCISE_TYPES`, with the labels "Weight & reps", "Reps only", "Added weight & reps" and "Time".
- `normalizeName(s)`, `nameKey(s)`, `searchKey(s)`, and `matchesQuery(name, query): boolean`.
- `groupByInitial(list: Exercise[]): { letter: string; items: Exercise[] }[]`. Non-letters go under `#`. Input order is kept.
- `NAME_MAX = 60`, `NOTES_MAX = 500`.

**Repo types and functions in `src/db/repos/exercises.ts`:**

```ts
export interface ExerciseInput { name: string; muscleGroup: MuscleGroup; equipment: Equipment; type: ExerciseType; notes?: string }
export type ExercisePatch = Partial<ExerciseInput>;
export interface ExerciseQuery { includeArchived?: boolean; query?: string; muscleGroup?: MuscleGroup }
export type ExerciseFieldError =
  | { field: 'name'; code: 'required' | 'too_long' | 'duplicate' | 'locked' }
  | { field: 'muscleGroup' | 'equipment'; code: 'required' }
  | { field: 'type'; code: 'locked' }
  | { field: 'notes'; code: 'too_long' };
export type ExerciseWriteResult = { ok: true; exercise: Exercise } | { ok: false; error: ExerciseFieldError };
export function listExercises(q?: ExerciseQuery): Promise<Exercise[]>;
export function getExercise(id: string): Promise<Exercise | undefined>;
export function isNameTaken(name: string, excludeId?: string): Promise<boolean>;
export function isExerciseUsed(id: string): Promise<boolean>;
export function createExercise(input: ExerciseInput): Promise<ExerciseWriteResult>;
export function updateExercise(id: string, patch: ExercisePatch): Promise<ExerciseWriteResult>;
export function deleteOrArchiveExercise(id: string): Promise<'deleted' | 'archived'>;
export function restoreExercise(id: string): Promise<{ ok: true } | { ok: false; reason: 'name_taken' }>;
```

**`listExercises`**
- Reads with `db.exercises.toArray()`, then filters in memory.
- Archived rows are excluded unless `includeArchived` is set.
- `muscleGroup` must match exactly.
- The query is trimmed. An empty query matches everything.
- Results are sorted per E3.

**`isNameTaken`**
- True if any row exists with `!archived`, `id !== excludeId` and an equal nameKey.

**`isExerciseUsed`**
- True if any workout (any status) or any template has an entry whose `exerciseId` equals the id.
- Uses `db.workouts.filter(...).first()`, and the same on `db.templates`.

**`createExercise`**
- Validation:
  - The normalized name must be non-empty and at most 60 characters.
  - muscleGroup and equipment are required, and type must be a valid enum value.
  - Notes are trimmed. An empty note becomes undefined. The maximum is 500 characters.
- Inside `runWrite(['exercises'])`, re-run the duplicate check (it is authoritative), then put the row and enqueue one upsert.
- The new record gets:
  - `id: newId()` and `userId: requireUserId()`
  - `isCustom: true` and `archived: false`
  - `createdAt` and `updatedAt` both set to now

**`updateExercise`**
- Throws `Error('Exercise not found')` if the row doesn't exist.
- Fields that are absent or unchanged are ignored. If the merged record equals the current one, it returns ok without writing (E6).
- Locked fields return a `locked` error: name or type on a seeded row, and type on a used custom row.
- The duplicate check (excluding the row itself) runs only when the row isn't archived and the nameKey changed. Changing only the case of the row's own name is allowed.
- Runs inside `runWrite(['exercises','workouts','templates'])`, and bumps `updatedAt`.

**`deleteOrArchiveExercise`**
- Runs as one `runWrite(['exercises','workouts','templates'])`. Throws if the row isn't found.
- A seeded or used row becomes `archived: true` (put plus an upsert enqueue) and the function returns `'archived'`. If it is already archived, it returns `'archived'` without writing.
- An unused custom row (archived or not) is deleted: `db.exercises.delete(id)` plus `enqueue('exercises', id, 'delete')`, which becomes a server tombstone. Returns `'deleted'`.

**`restoreExercise`**
- A row that isn't archived is a no-op and returns ok.
- If `isNameTaken(row.name, id)`, it returns `{ ok: false, reason: 'name_taken' }`.
- Otherwise it sets `archived: false`, puts the row, and enqueues an upsert.

**General rules**
- Every write calls `requireUserId()`.
- FIFO outbox order means an archive or rename pushes before a later create that reuses the name.
- If a batched upsert hits a 23505 unique violation, the per-op fallback and retry fix it. M9's classifier must keep 23505 retryable.

## 2. Seeding (data-engineer `src/db/seed.ts`; supabase-engineer engine hook)

```ts
export interface SeedSource { version: number; exercises: readonly SeedExercise[] }
export function ensureSeeded(userId: string, source?: SeedSource /* default { version: SEED_VERSION, exercises: SEED_EXERCISES } */): Promise<number>; // rows inserted
```

`src/db/repos/meta.ts` gains `getSeedVersion(): Promise<number>` (0 if absent) and `setSeedVersion(v: number): Promise<void>`.

**Algorithm.** One `db.transaction('rw', ['exercises','syncQueue','meta'])`, not `runWrite`, because it needs `meta`. Enqueue must work inside it, because the transaction includes `syncQueue`.
1. `assertOwner(userId)`. An `OwnerChangedError` aborts the transaction.
2. Read `v = getSeedVersion()`, `all = exercises.toArray()`, and `hasSeeded = all.some(e => !e.isCustom)`.
3. If `v >= source.version && hasSeeded`, return 0. This is the steady state: no writes and no outbox entries.
4. Build sets of the existing ids and nameKeys, archived rows included.
5. For each seed entry:
   - `id = seededExerciseId(userId, s.name)`.
   - Skip it if the id or nameKey is already present (E7).
   - Otherwise put `{ ...s, id, userId, isCustom: false, archived: false, createdAt: now, updatedAt: now }`, enqueue an upsert, and add the nameKey to the set.
6. Call `setSeedVersion(source.version)` and return the count.

Existing rows are never updated.

**Engine hook (`src/sync/engine.ts` `runOnce`).** It runs under the `lift-sync` lock, only on a fully successful run, in this order:
1. `pushOutbox`
2. `pullAll`
3. `seeded = await deps.seed(owner.userId)`
4. `setInitialPullDone(true)`, if it isn't already set
5. If `seeded > 0`, run `pushOutbox` again and add its failures to the failed count

`EngineDeps` gains a required `seed: (userId: string) => Promise<number>`. `getSyncEngine` passes `ensureSeeded`, and existing tests pass `seed: async () => 0`.

**Consequences**
- Seeding finishes before the AuthGate lets the UI in.
- It never runs offline, after a failed pull, or after an owner change.
- "The server has no seeded rows" is judged from the local cache right after a full pull.
- A reseed after M9's Delete All reuses the same v5 ids, and `deleted_at: null` revives the server rows.
- An account switch wipes `seedVersion`. The next run pulls the existing seeded rows and inserts 0.
- Two devices converge, because their per-user v5 ids are identical.

## 3. Seed data (`src/db/seedData.ts`)

- Add `export const SEED_VERSION = 1;`.
- Keep the 69 PRD §10 entries that are already committed. Ab Wheel Rollout is `bodyweight_reps`.
- Add these 29 entries:

  | Name | Muscle group | Equipment | Type |
  |---|---|---|---|
  | Decline Bench Press | chest | barbell | weight_reps |
  | Pec Deck | chest | machine | weight_reps |
  | Incline Cable Fly | chest | cable | weight_reps |
  | Pendlay Row | back | barbell | weight_reps |
  | Rack Pull | back | barbell | weight_reps |
  | Barbell Shrug | back | barbell | weight_reps |
  | Chest-Supported Row | back | machine | weight_reps |
  | Inverted Row | back | bodyweight | bodyweight_reps |
  | Back Extension | back | bodyweight | weighted_bodyweight |
  | Front Raise | shoulders | dumbbell | weight_reps |
  | Reverse Pec Deck | shoulders | machine | weight_reps |
  | EZ-Bar Curl | biceps | barbell | weight_reps |
  | Concentration Curl | biceps | dumbbell | weight_reps |
  | Cable Overhead Tricep Extension | triceps | cable | weight_reps |
  | Bench Dip | triceps | bodyweight | bodyweight_reps |
  | Smith Machine Squat | quads | machine | weight_reps |
  | Step-Up | quads | dumbbell | weight_reps |
  | Reverse Lunge | quads | dumbbell | weight_reps |
  | Nordic Hamstring Curl | hamstrings | bodyweight | bodyweight_reps |
  | Hip Abduction Machine | glutes | machine | weight_reps |
  | Cable Pull-Through | glutes | cable | weight_reps |
  | Leg Press Calf Raise | calves | machine | weight_reps |
  | Crunch | core | bodyweight | bodyweight_reps |
  | Dead Bug | core | bodyweight | bodyweight_reps |
  | Side Plank | core | bodyweight | duration |
  | Power Clean | full_body | barbell | weight_reps |
  | Kettlebell Swing | full_body | kettlebell | weight_reps |
  | Jump Rope | cardio | other | duration |
  | Stair Climber | cardio | machine | duration |

- Integrity test requirements:
  - The count is between 80 and 100 (98 expected).
  - Every name equals `normalizeName(name)`.
  - nameKeys are unique.
  - Every enum value is valid.
  - The PRD-annotated types are asserted.

## 4. UI

**Routes (HashRouter, in `App.tsx`)**

| Path | Screen |
|---|---|
| `exercises` | ExerciseList |
| `exercises/new` | ExerciseFormPage |
| `exercises/:id` | ExerciseDetail |
| `exercises/:id/edit` | ExerciseFormPage |

- Delete `src/routes/ExercisesTab.tsx` and create the `src/routes/ExercisesTab/` directory instead.
- The TabBar is hidden on `/settings`, `/exercises/new` and `/exercises/*/edit`.

**New UI kit pieces (`src/components/ui/`).** All inputs are 16px, all tap targets are 44px, and everything must work in both themes.
- **`SearchInput`** `{ value; onChange(v); label; placeholder? }`
  - `type="search"`, `enterKeyHint="search"`, with autocomplete, autocorrect and autocapitalize off.
  - A clear IconButton shows when there is a value.
  - No autofocus.
- **`Chip`** `{ selected; onClick; children }` with `aria-pressed`.
- **`ChipGroup<T extends string>`** `{ label; options: { value: T | 'all'; label }[]; value; onChange }`
  - Single-select, with `role="radiogroup"` and `role="radio"` plus `aria-checked`.
  - A horizontal row that scrolls rather than wrapping.
- **`ListRow`** `{ title; subtitle?; trailing?; to?; onClick?; checked?: boolean; dimmed?: boolean }`
  - Renders a Link when `to` is set, otherwise a button.
  - When `checked` is defined, it gets `role="checkbox"`, `aria-checked`, and a check indicator.
  - Minimum height 56px.
- **`BottomSheet`** `{ open; title; onClose; children; footer? }`
  - Fixed to the bottom with `max-h-[90dvh]`, a scrolling body, and a sticky footer with `pb-safe`.
  - Tapping the backdrop or pressing Escape closes it.
  - Body scroll is locked while open, focus moves to the title, and focus returns on close.
  - Extract Dialog's focus trap into `src/hooks/useFocusTrap.ts` and use it in both. Dialog's tests must stay green.
- **`Select`**: a labelled native select with an optional `error`.
- **`TextArea`**: a labelled textarea with `maxLength` and an optional `error`.

**Shared exercise components (`src/components/exercises/`)**
- **`ExerciseFilterBar`** `{ query; onQuery; muscle: MuscleGroup | 'all'; onMuscle }` combines a SearchInput with a ChipGroup (All plus the 14 groups).
- **`ExerciseForm`** `{ initial?: Partial<ExerciseInput>; locked?: { name?: boolean; type?: boolean }; lockReason?: string; submitLabel: string; onSubmit(input): Promise<ExerciseWriteResult>; onCancel(): void }`
  - Fields:
    - Name: TextInput, maxLength 60, `autoCapitalize="words"`.
    - Muscle group: Select with a "Choose…" placeholder.
    - Equipment: Select with a "Choose…" placeholder.
    - Type: Select, default "Weight & reps".
    - Notes: TextArea, up to 500 characters.
  - Errors show on blur or submit. The live duplicate check uses `useLiveQuery(() => isNameTaken(name, id))`, but the repo's result is final.
  - Error messages:
    - "Enter a name."
    - "Name must be 60 characters or fewer."
    - "You already have an exercise named “{name}”."
    - "Choose a muscle group."
    - "Choose equipment."
  - Lock hints:
    - "Built-in exercises can’t be renamed or change type."
    - "Type can’t change after the exercise has been logged."

**`ExerciseList` (`src/routes/ExercisesTab/ExerciseList.tsx`)**
- Header "Exercises" with a "+ New" link to `/exercises/new`.
- Below it: the ExerciseFilterBar, then a "Show archived" switch (`role="switch"`).
- The list is grouped with `groupByInitial` and uses sticky letter headers. The headers disappear while a query is active.
- Each row is a ListRow showing the name and a "Chest · Barbell" subtitle. Archived rows get an "Archived" badge and are dimmed.
- Empty states:
  - When a search finds nothing: "No exercises match", with a "Create “{query}”" button linking to `/exercises/new?name=…`.
  - When there are no exercises: "No exercises yet".
- The muscle chip that is active prefills the muscle group on the new-exercise form (`?muscle=`).

**`ExerciseDetail` (`src/routes/ExercisesTab/ExerciseDetail.tsx`)**
- Header: back to `/exercises`, the title, and Edit.
- Body: muscle · equipment, the type label, a "Built-in" or "Custom" tag, and the notes.
- When archived, a banner reads "Archived. Hidden from the library and picker." with a Restore button.
- A SegmentedControl with History, Records and Chart. Each tab is an EmptyState placeholder for M6/M7.
- The destructive button at the bottom:

  | Exercise | Button |
  |---|---|
  | Unused custom | "Delete exercise" |
  | Seeded, or used | "Archive exercise" |
  | Archived seeded, or archived used | Hidden |
  | Archived unused custom | Delete and Restore |

- A missing id shows "Exercise not found" with a back link.

**Confirmation dialogs**

| Case | Title | Message | Button |
|---|---|---|---|
| Delete | "Delete exercise?" | "“{name}” has never been used. It will be permanently deleted on all your devices." | Delete |
| Archive (used) | "Archive exercise?" | "“{name}” is used in your workouts or templates, so it can’t be deleted. Archiving hides it from the library and picker. Your history is kept, and you can restore it with Show archived." | Archive |
| Archive (built-in) | "Archive exercise?" | Same as above, but with "is part of the built-in library" as the reason. | Archive |

**After each action**
- `'deleted'`: navigate to `/exercises` and toast "Exercise deleted".
- `'archived'`: stay on the page and toast "Exercise archived".
- Restore blocked: toast "Can’t restore: another exercise is named “{name}”. Rename or archive it first."

**`ExerciseFormPage`**
- Works in "New exercise" or "Edit exercise" mode. It reads `?name=` and `?muscle=` for prefill.
- Header: Cancel on the left, Save on the right.
- On success: a new exercise replaces the route with `/exercises/:id`; an edit goes back.
- Any unexpected error shows the toast "Couldn’t save. Storage may be full."

**`ExercisePicker` (`src/components/workout/ExercisePicker.tsx`)**

```ts
interface ExercisePickerProps { open: boolean; onClose(): void; onAdd(ids: string[]): void; title?: string /* default "Add exercises" */ }
```

- A BottomSheet containing, from top to bottom: the ExerciseFilterBar, a "+ Create new exercise" row, and a flat sorted list without archived rows.
- Each row is a ListRow with `checked`. Selection keeps the order the rows were tapped in.
- The footer button reads "Add (N)". It is disabled at 0, and it calls `onAdd(ids)` then `onClose`.
- "Create new" swaps the sheet body to an ExerciseForm, with the query prefilled as the name. On success the new id is appended to the selection and the list comes back. Cancel just returns to the list.
- The selection and query reset each time the picker opens.
- In M3, ActiveWorkout passes the ids to `addExercises(ids)`. Duplicate exercises are allowed.
- In M2 the picker is used only by its tests, which is acceptable until M3.

## 5. Order and tests

| Step | Task | Agent | Files |
|---|---|---|---|
| A | 2.1 Repo, lib helpers, meta seedVersion, and tests | data-engineer | `src/db/repos/exercises.ts`, `src/lib/exercises.ts`, `src/db/repos/meta.ts`, tests |
| A | 2.4 UI kit and tests | ui-builder | `src/components/ui/*` (new), `src/hooks/useFocusTrap.ts`, `Dialog.tsx` |
| B | 2.3a `ensureSeeded`, the seed additions, the integrity test, and seed tests | data-engineer | `src/db/seed.ts`, `src/db/seedData.ts`, tests |
| B | 2.5a Shared exercise components | ui-builder | `src/components/exercises/` |
| C | 2.3b Engine hook and two-device tests | supabase-engineer | `src/sync/engine.ts`, `src/sync/__tests__/*`, `fakeClient.ts` |
| C | 2.5b Routes and App | ui-builder | `src/routes/ExercisesTab/`, `src/App.tsx` |
| C | 2.6 Picker | ui-builder | `src/components/workout/` |
| D | 2.7 RTL and e2e tests | qa-engineer | route, component and picker tests; `e2e/auth/exercises.spec.ts`; `helpers.ts` |
| E | PROGRESS update | scribe | `docs/PROGRESS.md` |

**Repo unit tests**
- Create normalizes the name and enqueues one upsert.
- Duplicate handling:
  - `"  bench PRESS "` collides with an existing "Bench Press".
  - An archived row with the same name does not collide.
  - Renaming a row to a different case of its own name is allowed.
- Seeded and used locks are enforced.
- A no-op update leaves the outbox unchanged.
- `deleteOrArchiveExercise` covers four cases: unused custom, used in a workout, used in a template, and seeded.
- Delete leaves no local row and enqueues one delete entry.
- Restore is blocked on a name collision and works otherwise.
- List filtering covers diacritic folding, the muscle filter, archived rows excluded by default, and collator order.
- Every write throws when there is no owner.

**Seed tests**
- The first run inserts N rows and N outbox entries. A second run inserts 0.
- A custom "Deadlift", archived or not, blocks only that one seed entry.
- A version bump that adds one entry inserts exactly 1.
- Wiping the seeded rows reseeds them with the same ids.
- An owner mismatch writes nothing.

**Sync tests (`seedSync.test.ts`)**
- A run against an empty FakeServer leaves N rows on the server. A second run makes no new upsert calls.
- Offline, seeding is never called.
- Two devices:
  - Use `vi.resetModules()`, a new `IDBFactory` on `globalThis.indexedDB`, and dynamic imports for each device. If that proves flaky, fall back to running device A, then `wipeLocalData` plus `setOwner`, then device B.
  - Both seed against the empty server, then both push. The server ends with N unique ids and no duplicate names.
  - If B syncs after A has pushed, B's outbox stays empty.
- FakeServer gains an opt-in `enforceExerciseNameUnique` that returns a 23505-style error. With it on, archiving X and then creating a new X pushes in FIFO order with no failure.

**RTL tests**
- List: search folding, the muscle chip filter, Show archived, and the no-results button.
- Form: the duplicate error, required-field messages, and locks on seeded rows.
- Detail: Delete vs Archive copy and outcomes, and the toast when restore is blocked.
- Picker: the count and disabled state, tap order, deselecting, archived rows hidden, a newly created exercise being auto-selected, and the reset on reopen.
- UI kit: BottomSheet Escape and focus return, ChipGroup radio semantics, and the SearchInput clear button.

**e2e (`e2e/auth/exercises.spec.ts`)**
1. Sign in. "Barbell Bench Press" is visible.
2. The remote count of `is_custom = false` rows equals `SEED_EXERCISES.length`.
3. Create "Zercher Squat". The remote row appears.
4. Delete it. The remote row's `deleted_at` is set.
5. A second browser context signs in as the same user. The remote seeded count is unchanged and there are no duplicate names.

`helpers.ts` gains `readRemoteExercises(user)`.

## 6. Risks

- **Concurrent first seeds.** If two devices seed for the first time within seconds of each other, one device's edit to a seeded row can be overwritten (last write wins). Accepted.
- **Deleted exercises in other devices' workouts.** A hard-deleted exercise may still be referenced by another device's workout. From M3 on, render an unknown `exerciseId` as "Deleted exercise".
- **Case-folding mismatch.** JS `toLowerCase` and Postgres `lower()` disagree on a few characters, so a rare 23505 can happen. The entry retries and is never lost.
- **`isExerciseUsed` cost.** It scans every workout (O(n)), which is fine for v1. If it gets slow, add a multiEntry index later.
