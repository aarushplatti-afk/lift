# Milestone 5 Implementation Spec: Templates (branch m5-templates)

Written by `architect`. This spec is binding for M5 builders. M1 §0, M2 §0, M3 §0 (W1–W8, U1–U5) and M4 §0 (T1–T8) still apply.

## 0. Decisions

All decisions were accepted on 2026-11-14 under the owner's blanket authorization. They are reversible.

- **M1. No migration, no Dexie version bump.** The templates table, mappers and pull already exist.
- **M2. Sort order.**
  - Sort by `(lastUsedAt ?? createdAt)` descending, then name (locale collator), then id.
  - A new template therefore appears first.
- **M3. Validation.**
  - The name is normalized with `normalizeName`. It is required and at most 60 characters. Duplicate names are allowed.
  - A template needs at least one exercise.
  - Exercises with 0 sets are allowed. Starting a workout gives such an exercise one blank normal set.
  - Targets must be finite numbers ≥ 0. Reps must be integers. A bad value throws `RangeError` (programmer error).
- **M4. Edits go to a local draft.** The editor writes to an in-memory Zustand store (`templateDraft`) and only persists on Save.
  - This keeps Cancel meaningful and keeps half-finished edits out of the outbox.
  - The draft is lost if the OS kills the app. Accepted.
- **M5. The draft is workout-shaped.**
  - It holds `WorkoutExercise[]`. Each set's `weightKg`, `reps` and `durationSec` hold the targets, and `completed` is always false.
  - The editor reuses `workoutOps`, ExerciseCard and SetRow.
  - The draft converts to and from `TemplateExercise[]` only on load and save.
- **M6. Unknown and archived exercise ids are kept.**
  - Archived exercises keep their real name.
  - Unknown ids show "Deleted exercise".
  - Nothing is ever dropped.
- **M7. `templateFromWorkout` copies completed sets only.**
  - Exercises with no completed sets are dropped.
  - Kept: set type, `restSeconds`, `weightKg`, `reps` and `durationSec`, copied exactly.
  - Stripped: ids, `isPR`, `completedAt` and exercise notes.
- **M8. Starting from a template is blocked while a local workout is active.**
  - A dialog offers Resume.
  - A workout in progress on another device does not block.
- **M9. Delete is a hard delete in Dexie plus an outbox `delete`, which leaves a tombstone on the server.**
  - Workouts keep their `templateId` (PRD §11).
  - Saving a template whose id was deleted on another device re-creates it under the same id.
- **M10. `TemplateSet` gains `targetDurationSec?: number`.** It is stored in jsonb, so no migration is needed.
- **Owner answers (Q1–Q7):**
  - Q1, M10: yes.
  - Q2, "Update template": deferred to M6/P1.
  - Q3, starter PPL templates: deferred to the onboarding milestone.
  - Q4, M6: yes.
  - Q5, M2: yes.
  - Q6: keep the preview (Start, Edit) separate from the overflow menu (Duplicate, Delete), per the PRD.
  - Q7, M8: yes.

## 1. Pure layer (data-engineer, 5.1a)

**`src/lib/workoutOps.ts`** (refactor only, no behaviour change)
- Add `export interface ExerciseContainer { exercises: WorkoutExercise[]; updatedAt: number }`.
- Make these ops generic, `<W extends ExerciseContainer>(w: W, …): W`:
  - `addExercises`, `removeExercise`, `restoreExercise`, `moveExercise`
  - `setExerciseNotes`
  - `addSet`, `updateSet`, `removeSet`, `restoreSet`
  - `setSetType`, `setRestSeconds`
- These stay typed to `Workout`: `setCompleted`, `rename`, `setNotes`, `defaultWorkoutName`.
- Move `WorkoutInit` here from `src/db/repos/workouts.ts`. Update the imports in the repo and in `src/store/activeWorkout.ts`.

**`src/types/domain.ts`**
- `TemplateSet` gains `targetDurationSec?: number`.

**`src/lib/templates.ts`** (new; no React, no Dexie)

```ts
export interface TemplateInput { name: string; exercises: TemplateExercise[] }
export interface TemplateDraft extends ExerciseContainer { id: string | null; name: string }
export type TemplateFieldError =
  | { field: 'name'; code: 'required' | 'too_long' } | { field: 'exercises'; code: 'required' };
export function validateTemplateInput(i: TemplateInput): TemplateFieldError | undefined;
export function normalizeTemplateExercises(list: readonly TemplateExercise[]): TemplateExercise[];
export function templateExercisesFromDraft(list: readonly WorkoutExercise[]): TemplateExercise[];
export function templateFromWorkout(w: Workout): TemplateInput; // M7; name = w.name
export function workoutExercisesFromTemplate(list: readonly TemplateExercise[], ctx: OpsCtx): WorkoutExercise[];
export function workoutInitFromTemplate(t: Template, ctx: OpsCtx): WorkoutInit; // { name: t.name, templateId: t.id, exercises }
export function draftFromTemplate(t: Template, ctx: OpsCtx): TemplateDraft;
export function emptyDraft(now: number): TemplateDraft; // id null, name ''
export function draftToInput(d: TemplateDraft): TemplateInput;
export function draftKey(d: TemplateDraft): string; // JSON of draftToInput with trimmed name, used for the dirty check
export function templateSummary(t: Template, names: ReadonlyMap<string, Exercise>): string;
export function compareTemplates(a: Template, b: Template): number; // M2
export function duplicateName(name: string): string; // `Copy of ${name}` sliced to NAME_MAX, then trimEnd
```

- **`normalizeTemplateExercises`:** renumbers `order` from 0, applies `clampRestSeconds`, omits undefined keys, and throws `RangeError` on bad numbers.
- **`workoutExercisesFromTemplate`:**
  - Assigns new ids and keeps `order`.
  - Maps targets onto sets: `weightKg = targetWeightKg`, `reps = targetReps`, `durationSec = targetDurationSec`.
  - Sets start with `completed: false`, and `restSeconds` is carried over.
  - An exercise with no sets gets one blank normal set.
- **`templateSummary`:**
  - Exercises are taken in `.order`.
  - It shows the first 2 names joined with ", ". When there are more, it appends ", +N".
  - Unknown ids show "Deleted exercise". A template with no exercises shows "No exercises".

**`src/lib/format.ts`**
- Add `formatLastUsed(at: number | undefined, now: number): string`, which compares local calendar days:

| Time since last use | Text |
|---|---|
| never used | "Never used" |
| same day | "Used today" |
| previous day | "Used yesterday" |
| 2–6 days | "Used N days ago" |
| 7–34 days | "Used N weeks ago" (N = floor(days / 7)) |
| older | "Used Nov 2", plus ", 2025" when the year differs |

**Tests**
- Draft → input → draft round-trip keeps kg exact, including 45.359237, values like 0.1 + 0.2, and 0.
- All set types are preserved.
- `restSeconds` is kept and clamped; when absent, it stays absent.
- `templateFromWorkout` drops incomplete sets and empty exercises, strips `isPR`, `completedAt` and ids, and keeps unknown ids.
- `workoutInitFromTemplate` produces fresh, unique ids, uncompleted sets, and a blank set for exercises with 0 sets. Duration targets carry over.
- `templateSummary` with 0, 1, 2, 3 and 5 exercises, and with an unknown id.
- `compareTemplates` tie-breaking.
- `duplicateName` truncates at 60 characters.
- `formatLastUsed` across a DST change and across a year boundary.

## 2. Repo (data-engineer, 5.1b): `src/db/repos/templates.ts`

```ts
export type TemplateWriteResult = { ok: true; template: Template } | { ok: false; error: TemplateFieldError };
export async function listTemplates(): Promise<Template[]>; // sorted by compareTemplates
export function observeTemplates(): Observable<Template[]>;
export function getTemplate(id: string): Promise<Template | undefined>;
export async function saveTemplate(input: TemplateInput & { id?: string }): Promise<TemplateWriteResult>;
export async function duplicateTemplate(id: string): Promise<Template>; // throws 'Template not found'
export async function deleteTemplate(id: string): Promise<void>; // missing → no-op, no enqueue
export async function markTemplateUsed(id: string, at: number): Promise<void>;
```

**`saveTemplate`**
1. Calls `requireUserId`, normalizes the input, then validates it. A validation error returns `ok: false` before any transaction opens.
2. Then, inside `runWrite(['templates'])`:
   - **No id:** creates the template with a new id and `createdAt = updatedAt = now`.
   - **Id exists:**
     - Keeps the existing `createdAt` and `lastUsedAt`.
     - If the name and `JSON.stringify(exercises)` are unchanged, it returns the row without writing or enqueueing.
   - **Id given but not found:** creates the template under that id (M9).
   - Each actual write is a put plus an upsert enqueue.

**`duplicateTemplate`**
- Creates a new id, names it with `duplicateName`, deep-copies the exercises, and sets `createdAt = updatedAt = now` with no `lastUsedAt`.
- Puts the new row and enqueues it.

**`deleteTemplate`**
- Inside `runWrite(['templates'])`: deletes the row, then enqueues a `delete`.
- Never opens the `workouts` table.

**`markTemplateUsed`**
- Asserts that the current transaction includes `templates` and `syncQueue`.
- If the template is missing, it does nothing.
- Otherwise it sets `lastUsedAt` and `updatedAt` to `at`, puts the row and enqueues it.

**`startWorkout` in `src/db/repos/workouts.ts`**
- Its transaction now covers `[workouts, meta, templates, syncQueue]`.
- When it creates a new workout and `init.templateId` is set, it calls `markTemplateUsed(init.templateId, now)`.
- If it returns an already-active workout instead, it does not bump `lastUsedAt`.

**Tests**
- Outbox row counts for create, update and a no-op update (the no-op adds 0).
- A validation error writes nothing.
- The resurrect path (M9).
- Duplicate naming, and the copy is independent of the original.
- Delete enqueues a `delete` and leaves every workout row byte-identical.
- Sort order.
- `startWorkout`:
  - bumps the template exactly once and enqueues it;
  - does not bump when a workout is already active;
  - does not throw when the template is missing.
- A push through `fakeClient` sends a templates row with the jsonb exercises and `last_used_at`.

## 3. Components (ui-builder, 5.2a)

**`src/store/templateDraft.ts`** (new; memory only)

```ts
interface TemplateDraftState {
  draft: TemplateDraft | null; baselineKey: string;
  load(d: TemplateDraft): void; clear(): void; isDirty(): boolean;
  setName(name: string): void; addExercises(ids: string[]): void;
  removeExercise(weId: string, name?: string): void; moveExercise(weId: string, dir: -1 | 1): void;
  addSet(weId: string): void; updateSet(weId: string, setId: string, patch: SetPatch): void;
  removeSet(weId: string, setId: string): void; setSetType(weId: string, setId: string, t: SetType): void;
  setRestSeconds(weId: string, sec: number | null): void;
  save(): Promise<TemplateWriteResult>; // on ok, re-baselines
}
```

- Every action uses the generic `workoutOps`.
- Undo toasts use the same copy as the workout store.
- Each `load` increments a generation counter, and Undo is scoped to that generation, so an old Undo can't touch a newly loaded draft.

**`SetRow.tsx`**
- Props become a discriminated union:
  - Workout mode: `{ mode?: 'workout'; onToggle; previousText; onFillPrevious? }`.
  - Template mode: `{ mode: 'template' }`, with no previous cell, no ✓ and no completed styling.
- Template-mode aria-labels:
  - "Target weight (lb) set 1", or "Target added weight (lb) set 1"
  - "Target reps set 1"
  - "Target time set 1"
- Soft warnings stay in template mode.
- A `flex-1` spacer fills the space where the previous column was.

**`WorkoutSetTable.tsx`**
- Takes `mode?: 'workout' | 'template'`.
- Template headers: Set | spacer | LB (or +LB) | Reps or Time. There is no Previous column and no ✓.

**`ExerciseCard.tsx`**
- Takes `mode?: 'workout' | 'template'`, default `'workout'`. In template mode it ignores `previous`.
- An internal `useCardActions(mode)` selects from both stores unconditionally and returns the active one.
- Template mode has no toggle, no haptics and no rest-timer start.
- The template-mode menu has no note items. It keeps "Move up", "Move down", "Rest timer: …" and "Remove exercise".
- The set-type sheet and SwipeRow behave the same in both modes.

**Tests**
- SetRow in template mode: no ✓, no previous, and the target labels above.
- The `templateDraft` store: dirty tracking, Undo scoping, and re-baselining after save.
- ExerciseCard in template mode: the menu items, and Add Set copies the last set's targets.

## 4. Screens (ui-builder)

### 5.2b: Workout home

Files: `src/routes/WorkoutTab/Templates/{TemplateList,TemplatePreviewSheet,TemplateOptionsSheet}.tsx`, plus edits to `WorkoutHome.tsx`.

**Templates section** (below the start button and remote rows)
- Heading: h2 "Templates".
- Ghost button "+ New Template" → `/templates/new`.

**Template rows**
- Each row is a button with `aria-label="{name}"`.
- Line 1: the name, semibold.
- Line 2: `templateSummary`, secondary text.
- Line 3: `formatLastUsed`, caption text.
- Trailing IconButton "{name} options" opens the options sheet.

**Empty state**
- Title: "No templates yet".
- Text: "Save a routine you repeat, like Push Day, and start it in one tap."
- Button: "Create template".

**Preview sheet**
- Title: the template name.
- List: one item per exercise, "{exercise name}" with "{n} sets" (singular: "1 set").
- Footer:
  - Primary large button "Start Workout". It is disabled while the active-workout store is `loading` or a start is in progress.
  - Secondary button "Edit" → `/templates/:id/edit`.

**Starting a workout**
- If a local workout is active, show the "Workout in progress" dialog:
  - Body: "Finish or discard your current workout before starting another."
  - Buttons: "Resume workout" (→ `/workout/active`) and "Cancel".
- Otherwise call `start(workoutInitFromTemplate(t, { now: Date.now(), newId }))`, then navigate to `/workout/active`.
- If starting fails, show the toast "Couldn’t start the workout. Try again."

**Options sheet**
- "Duplicate": calls `duplicateTemplate`, then toasts `Duplicated as “Copy of {name}”`.
- "Delete" (danger): opens a confirmation dialog.
  - Title: "Delete this template?"
  - Body: "Workouts you logged from it stay in your history."
  - Buttons: "Delete template" (danger) and "Cancel".
  - On success, toast "Template deleted".
- If either action fails, toast "Couldn’t save. Storage may be full."

### 5.2c: Editor

Files: `src/routes/WorkoutTab/Templates/TemplateEditor.tsx`. This task owns `src/App.tsx`.

**Routing**
- Routes: `templates/new` and `templates/:id/edit`.
- The Layout hides the tab bar and the mini-bar on `^/templates/`.

**Loading**
- `new` loads `emptyDraft(now)`.
- `:id` loads `draftFromTemplate(await getTemplate(id))`.
- If the template doesn't exist, show the EmptyState "Template not found" / "It may have been deleted." with an action "Done" → `/`.
- Unmounting the editor calls `clear()`.

**Header**
- Left: ghost button "Cancel".
- Title: "New Template" or "Edit Template".
- Right: "Save". It is always enabled; validation errors show inline.

**Body**
- TextInput labelled "Template name", placeholder "e.g. Push Day", maxLength 60, font size 16px.
  - Errors: "Enter a name" and "Use 60 characters or fewer".
- The template's ExerciseCards, using `mode="template"`.
- "+ Add Exercise" opens the ExercisePicker titled "Add exercises".
- With no exercises, show the EmptyState "No exercises yet" / "Add the exercises you do in this routine." Saving shows the error "Add at least one exercise".
- Edit mode only: a danger button "Delete Template". It uses the same confirmation dialog as the options sheet, then navigates replace to `/`.

**Save**
- On success: toast "Template saved", then navigate replace to `/`.
- If it throws: toast "Couldn’t save. Storage may be full."

**Cancel**
- If `isDirty()`, show a dialog:
  - Title: "Discard changes?"
  - Body: "Your changes to this template won’t be saved."
  - Buttons: "Discard changes" (danger) and "Keep editing".
- Otherwise go straight to `/`.
- Browser back is not guarded (risk R2).

### 5.2d: Save as Template from the summary

Files: `src/components/workout/SaveAsTemplateDialog.tsx` (M6 History will reuse it), plus edits to `Summary.tsx`.

**Summary screen**
- A secondary large button "Save as Template" sits under Done.
- After a successful save it becomes disabled and reads "Saved as template".

**Dialog**
- Props: `{ open; workout: Workout; onClose; onSaved(t: Template) }`.
- Title: "Save as template".
- TextInput "Template name", prefilled with the workout name.
- Buttons: "Save" and "Cancel".
- Saving calls `saveTemplate(templateFromWorkout({ ...workout, name }))`.
- Errors show inline, using the editor's copy.
- If the workout has no completed sets, toast "Nothing to save. Log at least one set first."
- On success, toast `Saved “{name}” as a template`.

### RTL tests (`src/routes/WorkoutTab/__tests__/templates.test.tsx`)

- **Template list**
  - The list renders, including the empty state and the summary text.
- **Starting from the preview**
  - Targets appear as input values, no sets are completed, `templateId` is set and `lastUsedAt` is bumped.
  - Starting is blocked while a workout is active, and Resume navigates to it.
- **Options sheet**
  - Duplicate works.
  - Delete works and leaves workouts intact.
- **Editor**
  - Creating a template, then editing it.
  - The Cancel guard: no dialog when clean, the dialog when dirty.
  - Validation messages.
  - The not-found screen.
  - A weight typed in lb is stored as exact kg.
- **Summary**
  - Save as Template uses the default name, and the button is disabled after saving.
- Check every screen at 390px in both themes.

## 5. E2E (qa-engineer, 5.3): `e2e/auth/flow-a.spec.ts`

1. Sign in, tap "+ New Template", name it "Push Day", add Bench Press and one other exercise with 3 sets, set the set 1 targets, and save.
2. Check the template row shows the summary and "Never used".
3. Open the preview and tap Start Workout. Check that set 1's inputs show the targets and PREVIOUS shows "—".
4. Complete the sets, finish, then Save as Template with the name "Push Day 2".
5. Back on home, both templates are listed and "Push Day" shows "Used today".
6. Check the remote data:
   - `readRemoteWorkouts`: one completed row whose `template_id` is the template's id.
   - `readRemoteTemplates`, a new helper in `helpers.ts`: 2 rows, `exercises[0].sets[0].targetWeightKg` exact, and `last_used_at` set on "Push Day".
7. Delete "Push Day 2". Its remote row is tombstoned (`deleted_at` set) and the workout row is unchanged.

## 6. Order

1. **5.1a** (data-engineer): `workoutOps.ts`, `domain.ts`, `lib/templates.ts`, `format.ts`, plus the `workouts.ts` and `activeWorkout.ts` import moves.
2. In parallel:
   - **5.1b** (data-engineer): `repos/templates.ts`, `startWorkout`.
   - **5.2a** (ui-builder): SetRow, WorkoutSetTable, ExerciseCard, `templateDraft.ts`. The repo signature above is fixed, so this can start now.
3. In parallel, with disjoint files:
   - **5.2b**: the home templates section.
   - **5.2c**: the editor and `App.tsx`.
   - **5.2d**: SaveAsTemplateDialog and `Summary.tsx`.
4. **5.3**: e2e.
5. Review, PROGRESS, PR.

## 7. Risks

- **R1. A stale copy can overwrite another device's edits.** Starting from a template upserts the whole row to bump `lastUsedAt`. Last writer wins per row. Accepted for v1.
- **R2. Browser back skips the Cancel guard.** HashRouter has no blocker, so an unsaved draft is lost on back.
- **R3. The generic `workoutOps` refactor.** All existing tests must stay green with no behaviour change.
