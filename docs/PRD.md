# PRD: Lift — Workout Tracker PWA

**Working name:** Lift (placeholder, easy to rename)
**Document purpose:** Handoff spec for Claude Code to build v1 end to end.
**Status:** Ready to build
**Platform:** Mobile-first Progressive Web App (installable from a URL, no App Store)
**For Claude Code:** Read **Section 18 first** (model selection, subagents, workflow), then build milestone by milestone per Section 13.
**Backend:** **Supabase** (Postgres + Auth + Row Level Security) is the system of record for all user data. Read **Section 19**. Where any earlier section says "local only", "IndexedDB is the source of truth", or "no network calls", Section 19 overrides it.

---

## 1. Overview

Lift is a clean, fast workout logger in the style of the Strong app. It lets a user log sets, reps, and weight during a workout, reuse templates, review history, and see progress through per-exercise weight graphs and a bodyweight tracker. It is built as a PWA so it can be added to a phone's home screen, runs full screen, works offline, and saves all data to the user's own Supabase database (with a local offline cache so it never depends on signal).

### 1.1 Problem
Existing apps (Strong, Hevy) either paywall core features like unlimited routines and charts, or are cluttered. The user wants a personal, free, clean tracker they fully own, with no ads, no subscription, and no App Store release, backed by their own Supabase database so data is safe if the phone is lost or replaced.

### 1.2 Goals
1. Logging a set takes as few taps as possible, and it must be usable one-handed between sets.
2. Per-exercise progress graphs that clearly show weight lifted over time.
3. A simple bodyweight tracker with a trend line.
4. Very clean, readable, low-clutter UI. Dark mode default.
5. Works offline in a gym with bad signal. No data loss.
6. Installable on iPhone and Android from a link.

### 1.3 Non-Goals (v1)
- Nutrition, calorie, or food tracking (explicitly out of scope).
- Team features, sharing between accounts, admin roles, or public profiles. Anyone can create their own account (changed 2026-11-15 at the owner's request), but each account sees only its own data; there is no social layer.
- Social features, sharing, leaderboards.
- Wearable or HealthKit/Google Fit integration.
- Workout programs/coaching/AI recommendations.
- Native app store distribution.

### 1.4 Target User
Single user (the owner), a lifter who follows a split (e.g., Push/Pull/Legs) and wants to track progressive overload. Assume comfort with lb or kg (user-selectable).

---

## 2. Tech Stack and Architecture

Use the following unless there is a strong reason to deviate. Document any deviation in the README.

| Concern | Choice | Notes |
|---|---|---|
| Framework | React 18 + TypeScript | Strict mode on |
| Build tool | Vite | |
| Styling | Tailwind CSS | Design tokens in `tailwind.config` (see section 8) |
| Routing | React Router (hash or browser router) | Use **HashRouter** if deploying to GitHub Pages to avoid 404 on refresh; otherwise BrowserRouter with SPA fallback |
| State (UI) | Zustand | Active workout state, settings |
| Backend / database | **Supabase** (Postgres, Auth, RLS) via `@supabase/supabase-js` | System of record for all user data (Section 19) |
| Local cache + offline queue | IndexedDB via **Dexie** | Instant reads/writes, offline use, and an outbox that syncs to Supabase |
| Charts | Recharts (or uPlot if perf issues) | Responsive, touch tooltips |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest, service worker, offline precache |
| Dates | `date-fns` | |
| IDs | `crypto.randomUUID()` (UUID v4); `uuid` v5 for seeded exercises | Generated client-side so offline-created records never collide |
| Testing | Vitest + React Testing Library; Playwright for a few e2e flows | |
| Lint/format | ESLint + Prettier | |

### 2.1 Architecture principles
- **Offline-first, Supabase as system of record.** Every read and write goes to the local IndexedDB cache first so the UI is instant and works with no signal; changes sync to Supabase in the background (Section 19). No feature may require being online except the very first sign-in and the first data pull on a new device.
- **Active workout is crash-safe.** Persist the in-progress workout to IndexedDB on every change (debounced ≤ 300 ms) so a closed tab, phone lock, or app kill never loses data. On launch, if an unfinished workout exists, show a "Resume workout" banner.
- **Pure calculation layer.** All math (e1RM, volume, PR detection, trend smoothing) lives in `src/lib/calc/` as pure, unit-tested functions with no React or DB dependencies.
- **Repository layer.** All data access goes through `src/db/` repository functions (local write + outbox entry) and the sync engine in `src/sync/`. Components never call Dexie or Supabase directly.
- **Units stored canonically.** Store all weights in **kilograms** (float) internally. Convert for display based on the user's unit setting. Round displayed values sensibly (see 9.2).

### 2.2 Suggested folder structure
```
src/
  main.tsx
  App.tsx
  routes/
    WorkoutTab/
    HistoryTab/
    ProgressTab/
    ExercisesTab/
    SettingsPage/
  components/
    ui/            # Button, Card, Sheet, Tabs, Input, Stepper, EmptyState, etc.
    workout/       # ExerciseCard, SetRow, RestTimer, TemplatePicker, etc.
    charts/        # LineChart wrappers, RangeSelector
  db/
    schema.ts      # Dexie schema + migrations
    repos/         # workouts, exercises, templates, bodyweight, settings
    seed.ts        # exercise library seed
  lib/
    calc/          # e1rm, volume, prs, trend
    units.ts
    format.ts
    export.ts      # JSON export/import
  store/           # zustand stores
  styles/
  types/
public/
  icons/           # PWA icons (192, 512, maskable, apple-touch-icon)
```

---

## 3. Information Architecture

Bottom tab bar with 4 tabs, always visible except during a full-screen modal flow.

1. **Workout** — start/resume a workout, templates
2. **History** — past workouts
3. **Progress** — exercise graphs, bodyweight, PRs
4. **Exercises** — library and per-exercise detail

Settings is reached via a gear icon in the Workout tab header (not a fifth tab).

---

## 4. Data Model

All entities use **UUID v4 string IDs** generated client-side. In the app and local cache, timestamps are epoch milliseconds (number); in Postgres they are `timestamptz` (convert at the sync boundary). Weights stored in kg. Every synced record also carries `userId`, `updatedAt`, and `deletedAt?` (soft-delete tombstone); add these to each interface below. **The Postgres schema in Section 19.3 is authoritative** for table and column names.

### 4.1 Exercise
```ts
interface Exercise {
  id: string;
  name: string;                 // unique (case-insensitive) among non-archived
  muscleGroup: MuscleGroup;     // primary
  equipment: Equipment;
  type: ExerciseType;           // determines which input fields show
  isCustom: boolean;            // false for seeded library
  archived: boolean;            // soft delete; keeps history intact
  notes?: string;
  createdAt: number;
}

type MuscleGroup =
  'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'quads' |
  'hamstrings' | 'glutes' | 'calves' | 'core' | 'forearms' | 'full_body' | 'cardio' | 'other';

type Equipment =
  'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'other';

type ExerciseType =
  'weight_reps'        // weight x reps (default, most lifts)
  | 'bodyweight_reps'  // reps only (push-ups, pull-ups)
  | 'weighted_bodyweight' // added weight + reps (weighted pull-ups, dips)
  | 'duration';        // time only (planks)
```
**v1 required:** `weight_reps`, `bodyweight_reps`, `weighted_bodyweight`. `duration` may be included but graphs for it are optional.

### 4.2 Workout
```ts
interface Workout {
  id: string;
  name: string;                 // default e.g. "Push Day" or "Workout"; editable
  startedAt: number;
  endedAt?: number;             // undefined while in progress
  status: 'in_progress' | 'completed';
  templateId?: string;          // if started from a template
  notes?: string;
  exercises: WorkoutExercise[]; // ordered
}

interface WorkoutExercise {
  id: string;
  exerciseId: string;
  order: number;
  notes?: string;
  restSeconds?: number;         // per-exercise override of default rest
  sets: WorkoutSet[];           // ordered
}

interface WorkoutSet {
  id: string;
  order: number;
  type: 'normal' | 'warmup' | 'drop' | 'failure';
  weightKg?: number;            // for weight_reps / weighted_bodyweight
  reps?: number;
  durationSec?: number;         // for duration type
  completed: boolean;
  completedAt?: number;
  isPR?: boolean;               // computed at finish, stored for fast display
}
```
Store workouts as a single document per workout (nested exercises/sets) for simplicity and atomic saves. Maintain an index on `startedAt` and `status`.

### 4.3 Template
```ts
interface Template {
  id: string;
  name: string;
  exercises: TemplateExercise[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}
interface TemplateExercise {
  exerciseId: string;
  order: number;
  restSeconds?: number;
  sets: { type: SetType; targetReps?: number; targetWeightKg?: number }[];
}
```

### 4.4 BodyweightEntry
```ts
interface BodyweightEntry {
  id: string;
  date: string;       // 'YYYY-MM-DD' local date; one entry per date (upsert)
  weightKg: number;
  note?: string;
  createdAt: number;
}
```

### 4.5 Settings (single record)
```ts
interface Settings {
  unit: 'lb' | 'kg';                  // default 'lb'
  theme: 'dark' | 'light' | 'system'; // default 'dark'
  defaultRestSeconds: number;         // default 90
  restTimerAutoStart: boolean;        // default true
  keepScreenAwakeDuringWorkout: boolean; // default true
  hapticsEnabled: boolean;            // default true
  weightIncrement: number;            // display unit step for +/- buttons; default 5 (lb) / 2.5 (kg)
  bodyweightGoalKg?: number;          // optional
  schemaVersion: number;
}
```

### 4.6 Local cache (Dexie) schema and indexes
The local cache mirrors the Supabase tables in Section 19.3 and adds a `syncQueue` (outbox) table and a `syncState` table (per-table pull cursors).
- `exercises`: `id, name, muscleGroup, archived`
- `workouts`: `id, startedAt, status`
- `templates`: `id, name, lastUsedAt`
- `bodyweight`: `id, &date` (unique date)
- `settings`: `id`

Define Dexie `version(1)`. Plan for migrations via `schemaVersion`. Include a migration test stub.

---

## 5. Feature Requirements

Priority key: **P0** = must ship in v1, **P1** = should ship in v1 if time allows, **P2** = post-v1.

### 5.1 Workout Tab

#### 5.1.1 Home state (no workout in progress) — P0
- Header: title "Workout", gear icon → Settings.
- Primary button: **Start Empty Workout**.
- Section "Templates": list of saved templates (name, exercise summary like "Bench, Incline DB, +3"). Tapping a template opens a preview sheet with **Start Workout** and **Edit** actions. Long-press or overflow menu: Duplicate, Delete.
- **+ New Template** button → template editor (same exercise-picker and set-config UI as the workout screen but saves as a template).
- Empty state for no templates: short friendly message and a "Create template" CTA.

#### 5.1.2 Resume banner — P0
If an `in_progress` workout exists on app launch, show a persistent banner at the top of the Workout tab and a floating mini-bar above the tab bar on other tabs: "Workout in progress · 00:42:10 · Resume". Tapping it opens the active workout screen.

#### 5.1.3 Active workout screen — P0
Full-screen view (tab bar hidden). Layout top to bottom:

**Header (sticky):**
- Back/minimize chevron (returns to tabs; workout keeps running).
- Editable workout name.
- Live elapsed timer (mm:ss or h:mm:ss) since `startedAt`.
- **Finish** button (primary, right).

**Exercise cards (scrollable):** one per exercise, containing:
- Exercise name (tappable → exercise detail sheet showing recent history and mini-graph, P1) and an overflow (⋯) menu: Replace exercise, Move up/down (or drag handle), Add note, Set rest timer, Remove exercise.
- Optional note field.
- Set table with columns: **SET | PREVIOUS | LB (or KG) | REPS | ✓**
  - **SET** shows number, or a letter badge for warmup (W), drop (D), failure (F). Tapping the badge opens a menu to change set type or delete the set.
  - **PREVIOUS** shows what was done for the same set index in the most recent completed workout containing this exercise, formatted `135 × 8`. Tapping it fills weight and reps into the row (P0).
  - **Weight** and **Reps** are numeric inputs using `inputmode="decimal"` / `inputmode="numeric"`; selecting a field selects its contents for fast overwrite. Weight supports decimals.
  - **✓** button toggles completion. On complete: row highlights (subtle accent tint), light haptic, rest timer starts if enabled. Un-checking reverts the row and does not cancel a running timer.
  - Swipe left on a set row to delete (with undo toast).
- **+ Add Set** button below the table. New set pre-fills with the previous set's weight and reps in the same exercise (but not marked complete).
- Column headers adapt to `ExerciseType` (e.g., bodyweight_reps shows only REPS; weighted_bodyweight shows "+LB").

**Bottom of screen:**
- **+ Add Exercise** button → Exercise picker (see 5.4.2).
- **Cancel Workout** (destructive, requires confirm dialog: "Discard this workout? This can't be undone.").

**Rest timer — P0**
- When a set is completed (and auto-start is on), a rest timer bar slides up above the bottom, showing a countdown, **−15s / +15s** buttons, and **Skip**.
- Duration = exercise's `restSeconds` if set, else the global default.
- On completion: haptic vibration (if supported) and an audible chime (short, optional; respect a "sound" setting, P1). Bar shows "Rest complete" briefly then dismisses.
- Timer must be based on a target end timestamp (not interval ticks) so it stays accurate when the screen locks or tab is backgrounded. On return to foreground, recompute remaining time.
- Local notification when backgrounded is **P2** (PWA support is inconsistent on iOS).

**Screen awake — P1**
Use the Screen Wake Lock API during an active workout when the setting is on. Gracefully no-op if unsupported.

**Finish flow — P0**
1. Tap **Finish**.
2. If any sets are incomplete (non-empty weight/reps but not checked), show a dialog: "You have N incomplete sets. Finish anyway?" with options: *Mark complete & finish*, *Discard incomplete sets & finish*, *Cancel*.
3. Empty sets (no weight and no reps) are silently removed. Exercises with zero completed sets are removed.
4. If nothing remains, offer to discard the workout instead.
5. On confirm: set `endedAt`, `status = 'completed'`, compute PRs (see 6.3), save.
6. Show a **Workout Summary** screen: name, duration, total volume, total sets, list of PRs achieved (trophy icon), and buttons: **Done** and **Save as Template** (P1).

#### 5.1.4 Template editor — P0
Same exercise cards and set rows as active workout but without timer/completion checkboxes. Each set row captures set type, optional target reps, optional target weight. Save/Cancel in header. Starting a workout from a template pre-creates exercises and sets with target values prefilled as weight/reps (uncompleted).

### 5.2 History Tab — P0
- Reverse-chronological list of completed workouts, grouped by month header ("November 2026").
- Each row: workout name, date (e.g., "Thu, Nov 12"), duration, total volume, count of exercises, and a PR badge if any PRs.
- Tap → **Workout Detail** screen: full read-only breakdown (every exercise and set, PR markers, notes), with actions: **Edit** (re-open to modify weights/reps/dates), **Delete** (confirm), **Save as Template**, **Repeat Workout** (starts a new workout prefilled with the same exercises).
- Search/filter by workout name or exercise (P1).
- Empty state: "No workouts yet. Your finished workouts will show up here."

Editing a past workout must recompute PR flags for affected exercises (see 6.3.3).

### 5.3 Progress Tab — P0

Top segmented control with three views: **Exercises | Bodyweight | PRs**

#### 5.3.1 Exercises view (per-exercise graph) — P0
- Searchable exercise selector at top (defaults to the most recently trained exercise). Only exercises with at least one completed set are listed first; others accessible via search.
- **Metric toggle (chips):**
  - **Weight** (default): the heaviest completed working-set weight in each workout (excludes warmup sets by default). This is the "weight for each exercise" graph the user requested.
  - **Est. 1RM**: best estimated one-rep max per workout (Epley, see 6.1).
  - **Volume**: total weight × reps for that exercise per workout.
  - **Reps** (best set reps): P1.
- **Range selector:** 1M | 3M | 6M | 1Y | All. Default 3M.
- **Line chart:** x-axis = workout date, y-axis = selected metric in the user's unit. One point per workout containing the exercise. Smooth connecting line, visible dots, y-axis auto-scaled with padding (do not force zero baseline for Weight/1RM).
- **Interaction:** tap/drag on chart shows a tooltip with date, value, and the set that produced it (e.g., "225 lb × 5"). Tooltip must work with touch.
- **Stat cards below chart:** Current best (all-time PR for the metric), Change over selected range (absolute and %), Total workouts with this exercise, Last performed (relative date).
- **Recent sessions list** beneath: last ~10 sessions with date and top set. Tap → that workout's detail.
- Empty state: "Log this exercise a few times to see your progress."
- If only 1 data point, show it as a single dot with a note instead of a line.

#### 5.3.2 Bodyweight view — P0
- Prominent **Log weight** card at top: large numeric input prefilled with the most recent entry, date picker defaulting to today, optional note, **Save** button. Saving for an existing date updates that entry (upsert).
- **Line chart** of bodyweight with range selector (1M | 3M | 6M | 1Y | All; default 3M).
  - Raw entries shown as small dots.
  - A **trend line** (exponentially weighted moving average, see 6.4) shown as the main bold line so daily noise is smoothed.
  - Optional horizontal dashed **goal line** if `bodyweightGoalKg` is set.
- **Stat cards:** Current (latest), Change over range (absolute + direction arrow, neutral color, not red/green since goal direction varies), Min, Max, Average over range.
- **Entries list:** reverse-chronological; swipe to delete, tap to edit.
- Empty state: "Log your first weigh-in to start tracking."

#### 5.3.3 PRs view — P1
- Grouped list by exercise showing best weight, best est. 1RM, and best volume set with achieved date. Search/filter by muscle group.

### 5.4 Exercises Tab

#### 5.4.1 Library list — P0
- Search bar (instant filter, case-insensitive substring).
- Filter chips by muscle group (and equipment, P1).
- Alphabetical list with muscle group + equipment as secondary text.
- **+ New Exercise** button.
- Tapping an exercise → **Exercise Detail**: name, muscle group, equipment, notes; tabs/sections for **History** (every session list), **Records** (PRs), and a compact version of the progress chart. Actions: Edit (custom only for name/type; seeded exercises allow editing notes), Archive/Delete (see below).

#### 5.4.2 Exercise picker (used from workouts/templates) — P0
Bottom sheet or full-screen modal with search + muscle group filter chips, multi-select with a counter and **Add (N)** confirm button, plus a **+ Create new exercise** shortcut. Recently used exercises appear at the top (P1).

#### 5.4.3 Create/edit exercise — P0
Fields: Name (required, unique), Muscle group (required), Equipment (required), Type (required, default weight_reps), Notes (optional). Validate duplicates (case-insensitive) with an inline error.

#### 5.4.4 Delete behavior — P0
- If an exercise has never been used: hard delete.
- If used in any workout/template: **archive** (hidden from picker and library by default, history preserved, can be restored via a "Show archived" toggle). Show an explanatory confirm dialog.
- Seeded library exercises can be archived but not hard-deleted.

### 5.5 Settings — P0
Accessed from Workout tab gear icon. Sections:

- **Units:** lb / kg toggle. Changing re-renders all values; no stored data changes (stored in kg).
- **Appearance:** Dark / Light / System.
- **Workout:** Default rest time (stepper, 15 s increments, range 15 s to 10 min), Auto-start rest timer (toggle), Keep screen awake (toggle), Haptics (toggle), Weight increment for +/- (stepper).
- **Bodyweight:** Optional goal weight.
- **Account & Sync:** signed-in email, sync status (Synced / Syncing / Offline / Error, with a pending-changes count), **Sync now** button, **Sign out** (if unsynced changes exist, warn and block sign-out until synced or the user explicitly confirms discarding them).
- **Data:**
  - **Export data** → downloads `lift-backup-YYYY-MM-DD.json` containing all entities and schemaVersion.
  - **Import data** → file picker; validate schema; show summary ("N workouts, N exercises, N weigh-ins"); choose **Replace all data** or **Merge** (merge by ID; on conflict keep newest `updatedAt`/`createdAt`, P1; v1 may ship Replace only). Always require confirmation for Replace.
  - **Export workouts as CSV** (P1): columns `date, workout, exercise, set_order, set_type, weight, reps, notes`.
  - **Delete all data** (destructive, double confirm, type "DELETE").
- **About:** version, link to a short "How to install" explainer, storage usage estimate (`navigator.storage.estimate()` if available).
- Request **persistent storage** (`navigator.storage.persist()`) on first launch / after first workout to reduce eviction risk; surface a gentle note if denied.

### 5.6 Onboarding / First-run — P1
- Sign-up is open: the sign-in screen offers "Create an account" (email + password, confirm password, min 8 characters). After first sign-in, a single welcome sheet: choose units (lb/kg), optionally enter current bodyweight, and "Add to Home Screen" instructions (iOS: Share → Add to Home Screen; Android: install prompt). Skippable.
- Seed the exercise library silently on first launch.
- Optionally offer starter templates (Push, Pull, Legs) that the user can accept or skip.

### 5.7 PWA / Install — P0
- `manifest.webmanifest`: name, short_name, `display: standalone`, `orientation: portrait`, `theme_color`, `background_color`, `start_url`, `scope`, icons (192, 512, 512 maskable) and Apple touch icon (180).
- Service worker precaches the full app shell so the app loads offline. Use an "update available" toast (prompt user to refresh) rather than silently swapping versions mid-workout. Never auto-reload while a workout is in progress.
- iOS meta tags: `apple-mobile-web-app-capable`, status bar style, splash/theme color, `viewport-fit=cover`. Respect safe-area insets (`env(safe-area-inset-*)`) for the tab bar and headers.
- Android: capture `beforeinstallprompt` and show an optional in-app "Install" button in Settings → About.
- Disable pinch-zoom on inputs by using font-size ≥ 16 px on form fields (prevents iOS auto-zoom), and set `touch-action: manipulation` to remove tap delay.

---

## 6. Calculations and Business Logic

All implemented in `src/lib/calc/` with unit tests.

### 6.1 Estimated 1RM
Use **Epley**: `e1RM = weight × (1 + reps / 30)`. For `reps === 1`, e1RM = weight. Ignore sets with reps > 12 for e1RM purposes (low reliability) and exclude warmup sets. Return `undefined` when inputs invalid.

### 6.2 Volume
- Per set: `weight × reps` (completed, non-warmup sets only; this exclusion rule is a single constant so it is easy to change).
- Per exercise per workout: sum of its sets.
- Per workout: sum across exercises.
- For `bodyweight_reps` with no added weight, volume is reps only (displayed as "reps"); exclude from kg-volume totals.

### 6.3 Personal Records (PR)

#### 6.3.1 Definition
For each exercise, track three records, using only completed, non-warmup sets:
1. **Max weight** (heaviest weight lifted for ≥ 1 rep).
2. **Max est. 1RM**.
3. **Max set volume** (weight × reps for a single set).
Optionally **rep PR at a given weight** (P2).

A set is flagged `isPR` if it sets a new all-time record in any of the first two categories (weight or e1RM) compared to all prior completed workouts (strictly greater; ties do not count). Volume PR is shown in the PRs view but does not trigger the in-workout trophy (avoid noise).

#### 6.3.2 Timing
Compute PRs when a workout is finished (and again on edit/delete). Store `isPR` on the set for fast rendering. Optionally show a live "PR!" indicator on a set row when checked if it would beat the stored record (P1).

#### 6.3.3 Recompute on edit/delete
Editing or deleting a historical workout must recompute `isPR` flags for the affected exercise across all workouts (process chronologically). Implement as `recomputePRsForExercise(exerciseId)`.

### 6.4 Bodyweight trend (smoothing)
Use an exponentially weighted moving average over dated entries:
`trend_t = trend_{t-1} + α × (weight_t − trend_{t-1})`, with `α = 0.1` for daily-ish data. Handle gaps by scaling α with elapsed days: `α_eff = 1 − (1 − 0.1)^(days_since_prev)`. First point's trend = its weight. Expose α as a constant.

### 6.5 Previous-set lookup
For an exercise at set index *i*, "Previous" = the set at index *i* from the most recent **completed** workout containing that exercise (matching by order among non-warmup sets if possible, else by raw index). If that workout had fewer sets, show "—". Warmup sets look up warmups only.

### 6.6 Range filtering
Range presets are relative to "now" (local time). "All" includes everything. For charts, if the range yields < 2 points, fall back to showing available points with an informative hint.

### 6.7 Weight rounding and display
- Display lb values to nearest 0.1 and strip trailing `.0` (e.g., `135`, `137.5`).
- Display kg to nearest 0.1 likewise.
- Store full-precision kg internally; conversion constant `1 lb = 0.45359237 kg`. When a user enters a weight in lb, convert to kg for storage; round trip must not visibly drift (e.g., entering 135 lb must display 135, not 134.99). Apply display rounding at format time and consider rounding stored kg to 4 decimals.

---

## 7. Key User Flows (acceptance-level)

### Flow A: Log a workout from a template
1. Open app → Workout tab → tap "Push Day" template → Start Workout.
2. Active workout opens with exercises and prefilled set targets; PREVIOUS column shows last session's numbers.
3. User adjusts weight/reps, taps ✓ on each set; rest timer starts each time.
4. User taps Finish → summary shows duration, volume, PRs → Done → History shows the workout.
**Pass criteria:** zero data loss if the app is force-closed mid-workout and reopened; resume banner appears with correct elapsed time.

### Flow B: Ad hoc workout
Start Empty Workout → Add Exercise (multi-select 3) → log sets → Finish → Save as Template (P1).

### Flow C: See progress for Bench Press
Progress → Exercises → search "Bench Press" → chart shows max weight per workout over 3M; toggle to Est. 1RM; change range to 6M; tap a point to see "225 lb × 5 on Nov 4".

### Flow D: Log bodyweight
Progress → Bodyweight → enter 178.4 → Save → chart updates with new point and trend; logging again the same day updates rather than duplicates.

### Flow E: Backup and restore
Settings → Export → file downloads. Delete all data. Settings → Import that file → Replace → all workouts, exercises, templates, bodyweight, and settings restored identically.

### Flow F: Offline
Install to home screen, enable airplane mode, open app, complete an entire workout and log bodyweight. Everything works; data persists after reconnecting.

---

## 8. UI / UX Design Spec

### 8.1 Design principles
- Clean, spacious, minimal. One accent color. Big readable numbers.
- Mobile-first at 360–430 px widths. Must also be usable (not necessarily optimized) on tablet/desktop with a centered max-width (~480 px) container.
- Minimum tap target 44×44 px. Primary actions reachable by thumb (bottom area).
- Never block the user with unnecessary confirmations; use undo toasts for reversible actions.
- Smooth but restrained motion (150–250 ms ease-out). Respect `prefers-reduced-motion`.

### 8.2 Design tokens (starting point; adjust for taste)

**Dark theme (default)**
| Token | Value |
|---|---|
| bg | `#0B0B0F` |
| surface | `#15151B` |
| surface-2 | `#1E1E26` |
| border | `#2A2A34` |
| text-primary | `#F4F4F6` |
| text-secondary | `#9A9AA8` |
| accent | `#4F8CFF` (blue) |
| accent-tint | accent at 15% opacity (completed set row bg) |
| success | `#34C759` |
| danger | `#FF453A` |
| warning | `#FFB020` |
| pr-gold | `#FFC83D` |

**Light theme**: invert thoughtfully (bg `#FFFFFF`/`#F5F5F7`, text `#111114`, same accent, border `#E4E4EA`). Charts must have readable contrast in both themes.

### 8.3 Typography
- System font stack (`-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif`) or bundle Inter.
- Use tabular numerals (`font-variant-numeric: tabular-nums`) for all numbers so columns align.
- Scale: 12 (caption) / 14 (body-sm) / 16 (body) / 18 (title-sm) / 24 (title) / 32 (stat numbers).

### 8.4 Components to build (reusable)
Button (primary/secondary/ghost/destructive), IconButton, Card, BottomSheet, Dialog, Toast (with undo), Tabs/SegmentedControl, Chip, Input/NumberInput, Stepper, Toggle, ListRow, SwipeRow, EmptyState, StatCard, RangeSelector, ChartTooltip, RestTimerBar, TabBar, Header, Badge (set type / PR).

### 8.5 Set row design (most important component)
Compact row, ~48–52 px tall. Columns: set badge (32 px) | previous (flex, secondary text, tappable) | weight input (~72 px) | reps input (~64 px) | check button (40 px circle, outlined → filled accent when complete). Completed rows get the accent-tint background and dimmer input text. Inputs have no heavy borders; use a subtle surface-2 fill with rounded corners.

### 8.6 Charts
- Line color = accent; dots visible; grid lines very subtle (border color at low opacity); axis labels in text-secondary at 12 px; y-axis with 4–5 ticks; x-axis with sparse date labels.
- Bodyweight: trend line bold accent, raw points as small muted dots.
- Tooltips: card-styled, anchored near the touch point, include date and value (+ the set detail for exercise charts).
- Chart height ~220–260 px; full-width within card padding.
- Smooth animation on range change but no jank; memoize data transforms.

### 8.7 Empty, loading, and error states
Every list/chart has an empty state with a one-line explanation and a CTA. Since data is local, loading is near-instant; use skeletons only if any query exceeds ~150 ms. Surface unrecoverable errors in a dialog with a "Copy details" button and a suggestion to export data.

### 8.8 Accessibility
- All interactive elements labeled (`aria-label`) and keyboard focusable (for desktop testing).
- Color is never the sole indicator (completed sets also show a check icon).
- Contrast ratio ≥ 4.5:1 for text in both themes.
- Support dynamic text sizing reasonably (layout shouldn't break at 130% font scale).

---

## 9. Non-Functional Requirements

### 9.1 Performance
- First load < 2 s on mid-range phone over 4G; repeat loads instant from cache.
- Initial JS bundle target < 250 KB gzipped (code-split Progress/charts routes).
- Set input to UI update < 50 ms. Chart renders for up to 2,000 data points without visible lag (downsample for display if needed).
- Lighthouse PWA audit: installable and all checks pass; Performance ≥ 90 on mobile.

### 9.2 Reliability and data integrity
- Writes wrapped in Dexie transactions where multiple tables change.
- Active workout autosave (see 2.1). On `visibilitychange` → hidden and `pagehide`, flush pending writes immediately.
- Import validates against a schema (e.g., Zod) and rejects malformed files without touching existing data (validate fully before replacing).
- Never silently drop user data. Migrations must be tested with fixture data.

### 9.3 Privacy and security
- No analytics, no tracking. The only runtime network traffic is to the user's own Supabase project. All fonts/assets are self-hosted/bundled; no third-party CDNs.
- Data lives on the device (cache) and in the user's Supabase database, protected by Row Level Security so only the signed-in owner can read or write their rows.
- The client uses only the Supabase **anon (public) key**. The **service-role key must never appear in the repo, the client bundle, or any env file the app reads.** `.env.local` is gitignored; commit `.env.example` only.

### 9.4 Browser support
- iOS Safari 16.4+ (PWA installed) and latest Chrome on Android as primary targets. Latest desktop Chrome/Safari/Firefox for development and secondary use.
- Feature-detect and degrade gracefully: Wake Lock, Vibration (not supported on iOS), `beforeinstallprompt`, `navigator.storage.persist`.

### 9.5 iOS-specific considerations (called out because they commonly break PWAs)
- No Vibration API on iOS Safari; haptics are Android-only. Make the setting a no-op on iOS without error and hide it if unsupported.
- Storage for home-screen-installed PWAs is generally preserved, but a non-installed Safari tab can be purged after ~7 days of inactivity. Encourage installing to Home Screen and offer periodic backup reminders (P1: a gentle "It's been 30 days since your last backup" nudge).
- Handle the on-screen keyboard resizing the viewport: keep the focused input visible (scroll into view) and avoid the tab bar jumping over the keyboard.
- Audio playback requires a prior user gesture; trigger the timer chime only after the user has interacted (they will have by tapping ✓).

---

## 10. Seed Data: Exercise Library

Seed on first launch (~80–100 exercises). Each: name, muscleGroup, equipment, type. Starter list (extend as appropriate):

**Chest:** Barbell Bench Press, Incline Barbell Bench Press, Dumbbell Bench Press, Incline Dumbbell Press, Machine Chest Press, Cable Fly, Dumbbell Fly, Push-Up (bodyweight_reps), Chest Dip (weighted_bodyweight)
**Back:** Deadlift, Barbell Row, Dumbbell Row, Seated Cable Row, Lat Pulldown, Pull-Up (weighted_bodyweight), Chin-Up (weighted_bodyweight), T-Bar Row, Face Pull, Straight-Arm Pulldown
**Shoulders:** Overhead Press (Barbell), Seated Dumbbell Press, Arnold Press, Lateral Raise, Cable Lateral Raise, Rear Delt Fly, Upright Row, Machine Shoulder Press
**Biceps:** Barbell Curl, Dumbbell Curl, Hammer Curl, Preacher Curl, Cable Curl, Incline Dumbbell Curl
**Triceps:** Tricep Pushdown (Cable), Skull Crusher, Overhead Tricep Extension, Close-Grip Bench Press, Dip (weighted_bodyweight), Tricep Kickback
**Quads:** Back Squat, Front Squat, Leg Press, Leg Extension, Bulgarian Split Squat, Hack Squat, Goblet Squat, Walking Lunge
**Hamstrings:** Romanian Deadlift, Lying Leg Curl, Seated Leg Curl, Good Morning, Stiff-Leg Deadlift
**Glutes:** Hip Thrust, Glute Bridge, Cable Kickback, Sumo Deadlift
**Calves:** Standing Calf Raise, Seated Calf Raise
**Core:** Plank (duration), Hanging Leg Raise (bodyweight_reps), Cable Crunch, Ab Wheel Rollout, Russian Twist
**Forearms:** Wrist Curl, Reverse Curl, Farmer's Carry (duration)
**Cardio:** Running (duration), Cycling (duration), Rowing Machine (duration)

Seeded rows have `isCustom: false`. Seeding must be idempotent (check by name before inserting) so future library updates can add exercises without duplicating.

---

## 11. Edge Cases and Rules

- **Zero/blank weight or reps:** a set with a blank weight on a `weight_reps` exercise cannot be marked complete (show inline shake/error). Reps of 0 not allowed. Weight of 0 is allowed only for `bodyweight_reps`/`weighted_bodyweight` types.
- **Decimal input:** accept both `.` and `,` as decimal separator; normalize.
- **Large numbers:** cap weight at 2000 and reps at 999 to catch typos (soft warning).
- **Duplicate exercise in one workout:** allowed (e.g., two bench blocks), treated as separate WorkoutExercise entries.
- **Exercise renamed:** history references `exerciseId`, so renames propagate everywhere automatically.
- **Timezones/DST:** bodyweight `date` is the local calendar date string. Workouts use epoch ms; display in local time. Day grouping uses local timezone.
- **Clock changes mid-workout:** elapsed timer uses `Date.now() - startedAt`; guard against negative values.
- **Very long workout (> 6 h):** still allowed; show duration normally. Offer a prompt on Finish to adjust end time if the workout was left open overnight (P1: "This workout has been running 14 h. Set end time?").
- **Editing a completed workout date:** changes ordering in History and requires PR recomputation.
- **Deleting a template:** does not affect workouts created from it.
- **Unit switch mid-workout:** inputs convert displayed values; underlying kg unchanged.
- **Storage full/quota exceeded:** catch errors, show a blocking dialog with Export option.
- **Multiple tabs open:** use a BroadcastChannel or Dexie live queries so state stays consistent; warn if an active workout is already open in another tab (P1).

---

## 12. Testing Plan

**Unit tests (Vitest), required:**
- e1RM, volume, PR detection (including ties, warmups excluded, edit/delete recompute), previous-set lookup, bodyweight EWMA with gaps, unit conversion round trips, range filtering, import validation.

**Component/integration tests (RTL):**
- Set row: entering values, completing, undo, delete via swipe.
- Active workout: add/remove exercise, add set prefill behavior, finish flow with incomplete sets.
- Settings: unit toggle re-renders values.

**E2E (Playwright), at least:**
- Flow A (template → finish → history), Flow D (bodyweight upsert), Flow E (export/import roundtrip), and an offline test that loads the app with the network disabled after the first visit.

**Manual device checklist (before calling v1 done):**
- Install on a real iPhone and an Android device; verify standalone mode, icon, status bar, safe areas, keyboard behavior, offline use, rest timer accuracy after locking the screen, and data persistence across app kills.

---

## 13. Milestones (suggested build order)

1. **Foundation:** Vite + React + TS + Tailwind + Router, tab shell, design tokens, theme switching, Dexie cache schema, settings store, PWA manifest + service worker, deploy pipeline with a hello-world installable on a phone. **Plus Supabase:** project connection via env vars, SQL migrations (schema + RLS) in `supabase/migrations/`, email/password auth with a sign-in screen and persistent session, and the basic sync engine skeleton (Section 19). From here on, every repo built in later milestones writes through the outbox.
2. **Exercise library:** seed data, list/search/filter, create/edit/archive, picker.
3. **Active workout core:** start empty workout, add exercises, set rows, completion, autosave + resume, finish flow, summary.
4. **Rest timer + polish:** timer bar, wake lock, haptics, previous column, set types, swipe delete + undo.
5. **Templates:** create/edit, start from template, save workout as template.
6. **History:** list, detail, edit, delete, repeat, PR recompute.
7. **Progress — exercises:** calc layer, chart, metric toggle, range selector, stats, recent sessions.
8. **Progress — bodyweight:** log, upsert, chart with trend, stats, entries list, goal line.
9. **Sync hardening and data tools:** retry/backoff, conflict handling, sync status UI, offline-to-online and two-device tests, RLS isolation tests, export/import (JSON), CSV export, delete-all (local and server), storage persistence request.
10. **Hardening:** accessibility pass, performance pass, bundle splitting, e2e + manual device tests, onboarding (P1 items), README.

Each milestone should end in a deployable, working state.

---

## 14. Deployment

- Static hosting only. Recommended: **GitHub Pages** (free) via GitHub Actions, or **Netlify/Vercel/Cloudflare Pages**. Configure the Vite `base` path accordingly (`/<repo-name>/` for GitHub Pages) and make sure the PWA manifest `start_url`/`scope` match.
- HTTPS is required for service workers and install (all hosts above provide it).
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon key only; safe in the client because RLS is enabled on every table). Set them in the host's build settings (and as GitHub Actions secrets if deploying to GitHub Pages).
- In the Supabase dashboard (Auth → URL configuration), add the deployed origin and `http://localhost:5173` to the Site URL / redirect allow-list.
- Include a short `README.md` covering: local dev commands, build, deploy steps, how to install on iOS and Android, how to back up and restore data, and the data schema/migration approach.
- Versioning: show app version (from `package.json`) in Settings → About; bump on each deploy.

---

## 15. Future Enhancements (explicitly post-v1)

- Live multi-device updates via Supabase Realtime (v1 syncs on app open, on focus, on reconnect, and after writes) and resuming an in-progress workout on a second device.
- Supersets and circuits grouping.
- Plate calculator and barbell-weight-aware increments.
- Body measurements (waist, arms, etc.) and progress photos.
- Muscle-group volume heatmap and weekly volume charts.
- Rep-range/weight "rep PR" tracking and PR history timeline.
- Workout calendar view with streaks.
- Rest-timer local notifications while backgrounded.
- Apple Health / Google Fit write-back via companion shortcuts.
- Nutrition tracking (previously ruled out for v1).
- Localization.

---

## 16. Open Questions (decide with sensible defaults if unanswered)

1. **Default unit:** lb (assumed, US user). Changeable in Settings.
2. **Warmup sets in "Weight" graph:** excluded by default. Consider a toggle (P2).
3. **App name and icon:** "Lift" is a placeholder. Generate a simple, clean icon (e.g., minimal barbell or dumbbell glyph on dark background) if no asset is provided.
4. **Accent color:** blue (`#4F8CFF`) assumed; easy to swap via tokens.
5. **Hosting choice:** default to GitHub Pages unless instructed otherwise.

---

## 17. Definition of Done (v1)

- All P0 features implemented and passing tests.
- Installs from a URL on iOS and Android, runs full screen, works fully offline.
- Active workout survives force-quit with no data loss.
- Per-exercise weight graph and bodyweight graph with trend are correct and legible in dark and light themes.
- JSON export/import round-trips all data exactly.
- All data persists to Supabase. Signing in on a second device shows identical data. Changes made offline sync after reconnect with no loss and no duplicates.
- RLS verified by test: a second test user cannot read, insert, update, or delete the first user's rows. No service-role key anywhere in the client or repo.
- Lighthouse PWA checks pass; no console errors in normal use.
- README documents setup, deployment, and install.

---

## 18. Claude Code Build Setup: Models, Agents, and Workflow

This section tells Claude Code **how to run the build**: which model to use for which kind of work, which subagents to create, and the rules they follow. Do this setup **before writing any app code** (see 18.7, Step 0).

### 18.1 Model selection principles

| Tier | Model alias | Use for | Why |
|---|---|---|---|
| Heavy reasoning | `opus` | Planning, architecture, schema/migration design, hard debugging, code review, anything where a wrong decision is expensive to undo | Best judgment on ambiguous or cross-cutting decisions |
| Workhorse | `sonnet` | Writing and editing most code: components, screens, repos, calc functions, tests, PWA config | Strong coding at much lower cost and latency; most of the build lives here |
| Fast and cheap | `haiku` | Mechanical, well-specified work: seed data, boilerplate, icons/manifest, README, formatting, renaming, lookups and file searches | Speed and cost; no deep reasoning needed |
| Top tier (optional) | `fable` | Escalation only: a bug that Opus failed to fix after 2 attempts, or a final whole-codebase review before v1 sign-off | Highest capability; use sparingly |

Rules:
1. **Default main-session model:** use plan-then-execute mode. In Claude Code run `/model opusplan` so planning uses Opus and execution uses Sonnet. If that alias is unavailable, start in Opus for planning, then `/model sonnet` for implementation.
2. **Escalate on failure, not on suspicion.** If a Sonnet task fails tests twice, re-run it with Opus before trying a third time on Sonnet.
3. **Never use Opus or Fable for mechanical work** (formatting, seed lists, README). Use Haiku.
4. **Review is always Opus** and always done by a read-only agent that did not write the code.
5. Pin the model in each subagent's frontmatter (`model:` field) so cost and quality do not depend on what the main session happens to be using.

### 18.2 Project memory: `CLAUDE.md`

Create `CLAUDE.md` at the repo root first. Every agent reads it. Contents:

```markdown
# Lift — Claude Code Guide

Source of truth: /docs/PRD.md (copy the PRD there). Read the relevant PRD sections
before starting any task. If code and PRD disagree, stop and ask.

## Stack
React 18 + TypeScript (strict) + Vite + Tailwind + Zustand + Dexie (IndexedDB cache)
+ Supabase (Postgres, Auth, RLS) + Recharts + vite-plugin-pwa + Vitest + Playwright.
Supabase is the system of record; Dexie is an offline cache + outbox. See PRD Section 19.

## Commands
- npm run dev        # local dev server
- npm run typecheck  # tsc --noEmit
- npm run lint
- npm run test       # vitest run
- npm run e2e        # playwright
- npm run build

## Hard rules
- All weights are stored in KG internally. Convert only at the display boundary (lib/units.ts).
- Components NEVER call Dexie or Supabase directly. Use repos in src/db/repos/ (local write +
  outbox entry) and the sync engine in src/sync/. Only src/sync and src/lib/supabase.ts import
  @supabase/supabase-js.
- Every table has RLS enabled with owner-only policies. Schema changes happen ONLY through SQL
  files in supabase/migrations/. Never edit the database by hand without a matching migration.
- Client uses the anon key only. NEVER use, print, or commit the service-role key. .env.local is
  gitignored; keep .env.example current.
- All math lives in src/lib/calc/ as pure functions with unit tests. No React imports there.
- The active workout autosaves to IndexedDB on every change (debounced <= 300 ms).
- Network calls go ONLY to Supabase, and only from src/sync and the auth module. No analytics.
  No third-party CDN assets. The app must remain fully usable offline.
- Never auto-reload the app (service worker update) while a workout is in progress.
- Inputs use font-size >= 16px (prevents iOS zoom). Respect safe-area insets.
- No `any`. No unused exports. No commented-out code.

## Definition of done for any task
typecheck + lint + tests pass, new logic has tests, UI works at 390px width in dark
and light themes, and you updated docs/PROGRESS.md.

## Working agreements
- Work one milestone at a time (PRD section 13). Finish and deploy-check before the next.
- Keep docs/PROGRESS.md current: done, in progress, blocked, decisions made.
- Commit after each completed task with a conventional commit message.
- Do not add dependencies not listed in the PRD without stating why and asking first.
```

### 18.3 Subagents

Create these files in `.claude/agents/`. Each is a Markdown file with YAML frontmatter. Subagents run in their own context and cannot spawn other subagents, so **the main session is the orchestrator** and delegates to them explicitly (see 18.5). Tool lists follow least privilege: reviewers and planners are read-only.

#### `architect.md` — Opus, read-only
```markdown
---
name: architect
description: Use for planning and design decisions before implementation: milestone plans, data model/schema changes, Dexie migrations, component boundaries, and resolving ambiguity in the PRD. Use proactively at the start of every milestone.
tools: Read, Grep, Glob, WebFetch
model: opus
---
You are the software architect for Lift, a local-first workout tracker PWA.
Read CLAUDE.md and the relevant PRD sections first.

Produce a concrete implementation plan for the requested milestone or change:
- Files to create or modify (exact paths)
- Types and function signatures
- Data flow and where state lives (Dexie vs Zustand vs component)
- Edge cases from PRD section 11 that apply
- A task list ordered so each task is independently testable, tagged with the
  recommended agent for each task
- Risks and anything in the PRD that is ambiguous (list as questions)

Do not write implementation code. Do not edit files. Keep the plan tight and actionable.
```

#### `data-engineer.md` — Sonnet
```markdown
---
name: data-engineer
description: Use to implement the data layer: Dexie schema and migrations, repositories in src/db/repos, seed logic, JSON/CSV export and import with Zod validation, and the pure calculation library in src/lib/calc.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---
You implement the persistence and calculation layers for Lift.
Follow CLAUDE.md and PRD sections 4, 6, and 9.2 exactly.

- Weights stored in kg. Conversion lives only in lib/units.ts.
- Repos expose typed async functions; no Dexie calls leak outside src/db.
- Calc functions are pure and deterministic with no React or DB imports.
- Every calc function gets unit tests in the same task (Vitest), including edge
  cases: ties, warmup exclusion, empty input, single data point, gaps in dates.
- Wrap multi-table writes in Dexie transactions.
Run typecheck, lint, and tests before reporting done.
```

#### `supabase-engineer.md` — Sonnet (RLS and migrations always reviewed by Opus)
```markdown
---
name: supabase-engineer
description: Use for everything Supabase: SQL migrations, table schema, RLS policies, auth setup and session handling, the sync engine (outbox, pull cursors, conflict handling), generated DB types, and RLS isolation tests.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---
You own the Supabase backend and sync layer for Lift. Follow CLAUDE.md and PRD
Sections 4 and 19 exactly.

- Schema changes ONLY via files in supabase/migrations/ (use `npx supabase migration new`).
  Develop and test against the local stack (`npx supabase start`) before touching the
  remote project. Never push to the remote project without the user's approval.
- Every table: RLS enabled, owner-only policies using (select auth.uid()), user_id default
  auth.uid(), updated_at trigger, soft-delete column.
- Client uses the anon key only. Never read, print, or commit the service-role key.
- Sync is offline-first: local write + outbox entry, idempotent upserts, per-table pull
  cursors, tombstones for deletes, retry with backoff. No Background Sync API dependency.
- Generate types with `npx supabase gen types typescript` into src/types/database.ts.
- Write RLS isolation tests (two users; user B cannot select/insert/update/delete user A's
  rows) and sync tests (offline queue, retry, duplicate-safe replays, two-device pull).
- If a Supabase MCP server is connected, use it for inspection and advisors (security and
  performance); apply schema changes through migrations, not ad hoc SQL.
Run typecheck, lint, and tests before reporting done.
```

#### `ui-builder.md` — Sonnet
```markdown
---
name: ui-builder
description: Use to build React UI: reusable components in components/ui, screens in routes/, the set row, exercise cards, bottom sheets, tab bar, dialogs, toasts, and Tailwind theming for dark and light mode.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---
You build the Lift UI. Follow CLAUDE.md and PRD sections 5 and 8.

- Mobile first at 390px. Min tap target 44px. Inputs >= 16px font.
- Use the design tokens from PRD 8.2 via Tailwind config; never hardcode colors.
- Tabular numerals for all numbers. Respect safe-area insets.
- Build small reusable components first, then compose screens.
- Every list and chart has an empty state. Destructive actions use undo toasts where
  reversible, confirm dialogs where not.
- Add accessible labels. Do not rely on color alone.
- Screens read/write data only through repos and Zustand stores, never Dexie directly.
Run typecheck and lint before reporting done.
```

#### `chart-builder.md` — Sonnet
```markdown
---
name: chart-builder
description: Use to build the Progress tab: per-exercise weight/e1RM/volume charts, the bodyweight chart with trend line and goal line, range selectors, touch tooltips, and stat cards.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---
You build the charts for Lift. Follow PRD sections 5.3, 6, and 8.6.

- Data transforms (range filtering, per-workout aggregation, trend smoothing) are pure
  functions in lib/calc with tests; chart components only render.
- Touch tooltips must work on mobile. Do not force a zero baseline for weight/e1RM.
- Handle 0, 1, and many data points gracefully. Memoize transforms; downsample
  display data above ~500 points.
- Readable contrast in dark and light themes.
Run typecheck, lint, and tests before reporting done.
```

#### `pwa-engineer.md` — Sonnet
```markdown
---
name: pwa-engineer
description: Use for PWA and platform concerns: vite-plugin-pwa config, manifest, service worker caching, update prompt, iOS meta tags, safe areas, Wake Lock, persistent storage, install prompts, and deployment config (GitHub Pages or Netlify).
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---
You own installability, offline behavior, and deployment for Lift.
Follow PRD sections 5.7, 9.5, and 14.

- App shell must precache and load offline. Updates show a toast; never auto-reload
  during an active workout.
- Feature-detect Wake Lock, Vibration, beforeinstallprompt, storage.persist; degrade
  silently where unsupported (notably iOS).
- Ensure Vite base path, manifest start_url, and scope are consistent with the host.
- Verify with a production build served locally and a Lighthouse PWA audit.
```

#### `qa-engineer.md` — Sonnet
```markdown
---
name: qa-engineer
description: Use to write and run tests beyond unit level: React Testing Library integration tests and Playwright e2e flows (PRD section 7 flows A-F, including the offline test). Use after each milestone to verify behavior.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---
You verify Lift works. Follow PRD sections 7 and 12.

- Write tests from the PRD's acceptance criteria, not from the implementation.
- Playwright runs at a 390x844 mobile viewport. Include the offline flow and the
  force-close-mid-workout recovery flow.
- Report failures with exact repro steps, expected vs actual, and the likely file.
  Do not fix application code unless explicitly asked; report back instead.
```

#### `code-reviewer.md` — Opus, read-only
```markdown
---
name: code-reviewer
description: Use after finishing each milestone and before merging. Independent read-only review for correctness, PRD compliance, data-loss risks, type safety, accessibility, and performance. Must not be the agent that wrote the code.
tools: Read, Grep, Glob, Bash
model: opus
---
You are a strict reviewer for Lift. You cannot edit files.
Read CLAUDE.md and the PRD sections for the milestone, then review the diff (git diff).

Check, in priority order:
1. Data-loss, integrity, and security risks (autosave, migrations, import/replace, PR recompute, sync/outbox replays, RLS policy gaps, any key or secret exposure)
2. Unit handling (kg storage, rounding drift) and calc correctness vs PRD section 6
3. PRD requirement coverage and edge cases from section 11
4. Layer violations (components touching Dexie, calc importing React)
5. Accessibility, mobile usability, performance, bundle size
6. Test coverage gaps

Output: a prioritized list (blocker / should-fix / nit) with file:line references and a
concrete suggested fix for each blocker. End with PASS or CHANGES REQUIRED.
```

#### `scribe.md` — Haiku
```markdown
---
name: scribe
description: Use for cheap mechanical work: exercise seed data from PRD section 10, PWA icon and manifest assets, README, docs/PROGRESS.md updates, renames, formatting, and boilerplate files.
tools: Read, Write, Edit, Grep, Glob, Bash
model: haiku
---
You handle mechanical, well-specified tasks for Lift quickly and precisely.
Follow the instructions literally. Do not redesign or add features.
Seed data must be idempotent and match PRD section 10. Keep docs concise.
```

Also use Claude Code's **built-in `Explore` agent** (fast, read-only, runs on a small model) for codebase searches instead of reading many files in the main context.

### 18.4 Model and agent assignment by task

| Task | Agent | Model |
|---|---|---|
| Milestone planning, schema/migration design, resolving PRD ambiguity | `architect` | opus |
| Dexie cache schema, local repos, export/import, calc library + unit tests | `data-engineer` | sonnet |
| Supabase migrations, RLS policies, auth, sync engine, RLS and sync tests | `supabase-engineer` | sonnet (output always reviewed by `code-reviewer` on opus) |
| Components, screens, theming, workout flow UI | `ui-builder` | sonnet |
| Progress charts, bodyweight chart, trend line | `chart-builder` | sonnet |
| PWA config, service worker, iOS quirks, deploy pipeline | `pwa-engineer` | sonnet |
| Integration tests, Playwright e2e, offline test | `qa-engineer` | sonnet |
| End-of-milestone review | `code-reviewer` | opus |
| Seed data, icons, README, progress log, formatting | `scribe` | haiku |
| Finding files / understanding code | built-in `Explore` | (built-in, small model) |
| A bug unresolved after Opus attempts, or final pre-release audit | main session | fable (optional) |

### 18.5 Orchestration rules (for the main session)

1. **Milestone loop.** For each milestone in section 13: (a) `architect` produces the plan; (b) main session delegates tasks to the assigned builder agents in dependency order; (c) `qa-engineer` writes and runs tests; (d) `code-reviewer` reviews the diff; (e) fix all blockers (builder agents), re-review until PASS; (f) `scribe` updates `docs/PROGRESS.md`; (g) commit.
2. **Delegate explicitly.** Name the agent in the instruction (e.g., "Use the data-engineer agent to implement the workouts repo per PRD 4.2 and 6.3"). Give it the exact PRD sections and files, because subagents start with fresh context.
3. **Parallelize only independent work.** Safe in parallel: `scribe` seed data while `ui-builder` builds shared components; `chart-builder` and `pwa-engineer` once the data layer is stable. **Never** run two agents that edit the same files at once. If running parallel agents on separate areas, use separate git worktrees or strictly disjoint directories.
4. **Contract first.** Before parallel work starts, the data layer types (`src/types`) and repo function signatures must exist so UI and charts can code against them.
5. **Verify before trusting.** After every agent finishes, the main session runs `npm run typecheck && npm run lint && npm run test` itself rather than relying on the agent's report.
6. **Keep the main context clean.** Offload searching/reading to `Explore`, and have agents return short summaries (what changed, files touched, test results), not file dumps.
7. **Two-strikes escalation.** If an agent's task fails verification twice, stop retrying on the same model: re-plan with `architect` (opus), or reassign the implementation to an Opus session.
8. **Ask, don't guess.** If the PRD is silent or contradictory on something that affects data shape, units, or user-visible behavior, ask the user before building. Safe defaults in section 16 may be applied without asking.

### 18.6 Automation (hooks and permissions)

Add `.claude/settings.json` so quality gates run automatically:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(npx vitest *)",
      "Bash(npx playwright *)",
      "Bash(npx prettier *)",
      "Bash(npx supabase start)",
      "Bash(npx supabase stop)",
      "Bash(npx supabase migration *)",
      "Bash(npx supabase db reset)",
      "Bash(npx supabase gen types *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git add *)",
      "Bash(git commit *)"
    ],
    "deny": [
      "Bash(git push --force *)",
      "Bash(rm -rf *)",
      "Read(./.env*)"
    ]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "npx prettier --write \"src/**/*.{ts,tsx,css}\" >/dev/null 2>&1 || true" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "npm run typecheck --silent" }
        ]
      }
    ]
  }
}
```

Adjust the exact hook shapes to whatever the installed Claude Code version expects, and keep hooks fast (type-check on stop, not the full test suite).

Optional custom slash commands in `.claude/commands/`:
- `/milestone <n>`: runs the milestone loop in 18.5 for milestone *n*.
- `/review`: invokes `code-reviewer` on the current diff.
- `/verify`: runs typecheck, lint, tests, and build, and summarizes results.

### 18.7 Kickoff instructions (what to do first)

**Step 0 — Setup (no app code yet):**
1. Create the repo, put this PRD at `docs/PRD.md`, and create `docs/PROGRESS.md`. **Ask the user for their Supabase project URL and anon (publishable) key** (they create the project at supabase.com), put them in `.env.local` (gitignored) and document the variable names in `.env.example`. Never ask for or use the service-role key. Pushing migrations to the remote project (`supabase db push` or MCP `apply_migration`) requires the user's explicit approval each time.
2. Create `CLAUDE.md` (18.2), all agent files (18.3), and `.claude/settings.json` (18.6).
3. Set the main session model: `/model opusplan`.
4. Read the entire PRD, then use the `architect` agent to produce a **master plan** mapping milestones 1–10 to tasks and agents. Save it to `docs/PLAN.md` and show it to the user for approval.

**Step 1:** After approval, run the milestone loop (18.5) starting at Milestone 1. Do not start milestone *n+1* until milestone *n* passes review, builds, deploys, and installs on a phone (user will confirm on device).

**Check-ins:** Stop and report to the user at the end of milestones 1, 3, 6, 8, and 10 with a short summary, the deployed URL, and what to test on their phone.

---

## 19. Supabase Backend and Sync

This section is authoritative for persistence, auth, and sync. It overrides any earlier "local only" wording.

### 19.1 Decisions

| Topic | Decision | Reason |
|---|---|---|
| System of record | Supabase Postgres | User wants everything saved to a real database |
| Offline behavior | **Offline-first**: Dexie cache + outbox, background sync to Supabase | A gym often has bad signal; logging a set must never wait on the network |
| Auth | Supabase Auth, **email + password**, open sign-up, one private account per person | Simple and works inside an installed iOS PWA |
| Security | RLS on every table, owner-only policies, anon key in client | Anon key is public by design; RLS is what protects the data |
| Conflict policy | Last write wins by server `updated_at` | Single user, rare conflicts |
| Workout storage | Nested exercises/sets stored as `jsonb` on the `workouts` row | One workout is one atomic sync unit; avoids partial-sync bugs. All charts compute from the local cache |
| Realtime | Not in v1 | Sync on open, focus, reconnect, and after writes is enough |

If the user later prefers online-only (no offline cache), say so before building; it would simplify sync but breaks gym use with no signal.

### 19.2 Auth requirements
- Sign-in screen on first launch: email + password. No magic links and no OAuth redirect flows, because on iOS a link opened from email lands in Safari, not the installed home-screen app, and the session does not carry over.
- Anyone can create an account from the sign-in screen (changed 2026-11-15; previously single-owner with sign-ups disabled). Owner-only RLS keeps every account's data private. Recommended project settings: "Confirm email" off (the default SMTP sender is heavily rate-limited and confirmation links open in Safari, not the installed app), or, if left on, Site URL and redirect allow-list set to the Pages URL. The app handles both: with confirmation on, it tells the user to confirm and then sign in.
- Session persists (`persistSession`, `autoRefreshToken`). **If a session exists, the app must open and work fully offline** even if the token cannot be refreshed; refresh when back online. Never force a sign-in screen while offline with a cached session.
- Sign-out clears the local cache after confirming everything is synced. Signing in as a different user on the same device must wipe the previous user's cache first.
- Password reset: via Supabase email reset flow, opened in the browser (acceptable for a rare action).

### 19.3 Database schema (migration `0001_init.sql`)

All tables in `public`. Every row is owned by one user. Postgres column names are snake_case; map to camelCase at the sync boundary.

```sql
-- Shared helper: bump updated_at on every write (server time is the sync cursor)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.exercises (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  muscle_group text not null,
  equipment    text not null,
  type         text not null check (type in ('weight_reps','bodyweight_reps','weighted_bodyweight','duration')),
  is_custom    boolean not null default true,
  archived     boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index exercises_user_name_uniq
  on public.exercises (user_id, lower(name))
  where deleted_at is null and archived = false;
create index exercises_user_updated_idx on public.exercises (user_id, updated_at);

create table public.workouts (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  status      text not null check (status in ('in_progress','completed')),
  template_id uuid,
  notes       text,
  exercises   jsonb not null default '[]'::jsonb,  -- WorkoutExercise[] with nested sets (PRD 4.2)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index workouts_user_started_idx on public.workouts (user_id, started_at desc);
create index workouts_user_updated_idx on public.workouts (user_id, updated_at);

create table public.templates (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  exercises    jsonb not null default '[]'::jsonb,  -- TemplateExercise[] (PRD 4.3)
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index templates_user_updated_idx on public.templates (user_id, updated_at);

create table public.bodyweight_entries (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,                          -- local calendar date
  weight_kg  numeric(7,3) not null check (weight_kg > 0 and weight_kg < 700),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index bodyweight_user_date_uniq
  on public.bodyweight_entries (user_id, entry_date)
  where deleted_at is null;
create index bodyweight_user_updated_idx on public.bodyweight_entries (user_id, updated_at);

create table public.user_settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,     -- Settings (PRD 4.5)
  updated_at timestamptz not null default now()
);

-- updated_at triggers
create trigger exercises_updated_at before insert or update on public.exercises
  for each row execute function public.set_updated_at();
create trigger workouts_updated_at before insert or update on public.workouts
  for each row execute function public.set_updated_at();
create trigger templates_updated_at before insert or update on public.templates
  for each row execute function public.set_updated_at();
create trigger bodyweight_updated_at before insert or update on public.bodyweight_entries
  for each row execute function public.set_updated_at();
create trigger user_settings_updated_at before insert or update on public.user_settings
  for each row execute function public.set_updated_at();

-- Row Level Security: owner-only on every table
alter table public.exercises          enable row level security;
alter table public.workouts           enable row level security;
alter table public.templates          enable row level security;
alter table public.bodyweight_entries enable row level security;
alter table public.user_settings      enable row level security;

create policy "owner all" on public.exercises
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner all" on public.workouts
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner all" on public.templates
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner all" on public.bodyweight_entries
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner all" on public.user_settings
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```

Notes for the implementer:
- The SQL above is the intended starting point. Review it, run it through the local stack, and run Supabase's security and performance advisors on the project before calling it done.
- Revoke access for the `anon` role on all tables (no policies grant it anything, and RLS is on, but confirm no table is exposed without RLS).
- `weight_kg` is stored with 3 decimals; the app rounds to 4 decimals at the unit-conversion boundary, so the DB column precision is sufficient for display rounding rules in PRD 6.7.
- Generate TypeScript types into `src/types/database.ts` and use them in the sync layer.

### 19.4 Sync engine (`src/sync/`)

**Write path (every user action):**
1. Repo writes the change to Dexie in one transaction, together with an **outbox entry** `{ id, table, recordId, op: 'upsert' | 'delete', payload, createdAt, attempts, lastError }`.
2. UI updates immediately from Dexie (live queries). The user never waits on the network.
3. The sync engine drains the outbox when online. Multiple pending ops on the same record **coalesce** into one (latest payload wins; an upsert followed by a delete becomes a delete).
4. Pushes use idempotent `upsert` (`on conflict (id)`), so retries and duplicate replays are safe. Deletes are **soft deletes** (`deleted_at` set) so other devices can learn about them.
5. On failure: keep the entry, increment `attempts`, record `lastError`, retry with exponential backoff (e.g., 2 s, 5 s, 15 s, 60 s, capped at 5 min). Distinguish retryable errors (network, 5xx, 401 pending refresh) from permanent ones (RLS or constraint violations, 4xx). Permanent errors move the entry to a "failed" state that is surfaced in Settings → Account & Sync with a Retry/Discard choice, and never silently dropped.

**Read path (pull):**
- For each table, keep a cursor `lastPulledAt` (the max server `updated_at` seen). Pull `where updated_at > cursor order by updated_at, id limit 500`, paginating until empty. Apply rows to Dexie (including tombstones as deletes).
- **Do not overwrite a local record that has a pending outbox entry**; the local change wins until it is pushed, then server time decides.
- First sign-in on a new device does a full pull with a progress indicator before showing the main UI.

**When sync runs:** app start, `visibilitychange` to visible, the `online` event, ~2 s (debounced) after local writes, after sign-in, and on the manual **Sync now** button. Do not rely on the Background Sync API (unsupported on iOS Safari).

**Active workout:** autosaves to Dexie on every change (PRD 2.1). While `in_progress`, push to Supabase debounced (about 5 s) and always on finish. In v1, resuming an in-progress workout from a different device is not supported; a second device simply sees it as in-progress and should not auto-open it.

**Seeded exercises:** use a fixed namespace and **UUID v5 from the exercise name** for every library exercise, so two devices that seed at the same time generate identical IDs and the upserts converge instead of duplicating. Seed on first successful sign-in and when the server has no seeded rows.

**Settings:** stored in `user_settings.data`; sync like any other record.

**Status model exposed to the UI:** `synced` | `syncing` | `offline` | `error`, plus `pendingCount` and `lastSyncedAt`. Show a small unobtrusive indicator on the Workout tab header and the full detail in Settings.

### 19.5 Data operations with a server

- **Export:** run a sync first if online, then export from the local cache (same JSON as PRD 5.5).
- **Import (Replace):** requires being online. Validate the file fully, confirm, then write through the repos so changes flow through the outbox. Replace means tombstoning existing rows and inserting the imported ones.
- **Delete all data:** requires being online and typing "DELETE". Deletes the user's rows server-side (RLS allows owner deletes), then clears the local cache and outbox. Never delete the auth user itself in v1.
- **Schema versions:** local `schemaVersion` and the SQL migrations evolve together. Any change that alters synced shapes needs a migration file, a Dexie version bump with an upgrade function, and a test with fixture data.

### 19.6 Dev workflow and environments
- Develop and test against the **local Supabase stack** (`npx supabase start`, Docker required). Run all migrations and tests locally first.
- One remote Supabase project for real data. Migrations reach it only after local tests pass **and the user approves**.
- Commit `supabase/migrations/*.sql` and `supabase/config.toml`. Keep `.env.local` out of git; commit `.env.example` with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=`.
- If a Supabase MCP server is connected to Claude Code, use it to inspect tables, read logs, and run the security/performance advisors against the project. Schema changes still go through migration files, and avoid pointing it at anything other than the user's own Lift project.

### 19.7 Testing requirements (add to PRD section 12)
- **RLS isolation (required):** create two users; verify user B cannot select, insert, update, or delete user A's rows in every table, and that an unauthenticated request gets nothing.
- **Sync unit tests:** outbox coalescing, backoff, retryable vs permanent errors, idempotent replay (pushing the same op twice creates one row), pull cursor pagination, tombstone application, local-pending-wins rule.
- **Two-device simulation:** two independent Dexie instances against one local Supabase; edits on each converge after sync; seeded exercises do not duplicate.
- **Offline e2e (Playwright):** log a full workout and a bodyweight entry offline, go online, confirm the rows appear in Supabase with the right values; reload while offline with a cached session and confirm the app opens.
- **Auth edge cases:** expired token while offline, sign-out with unsynced changes, account switch wipes the cache.

### 19.8 Known constraints to be aware of
- Supabase free-tier projects have historically been **paused after about a week of inactivity**. The local cache keeps the app working and the outbox keeps queueing, but syncing stalls until the project is restored from the dashboard. Open the app regularly, and keep periodic JSON backups (PRD 5.5).
- Anon key and project URL are visible in the built client by design. This is safe **only because every table has RLS enabled**; the reviewer must verify this on every schema change.
- iOS can evict local data for non-installed Safari sites after long inactivity; the Supabase copy is what makes this safe, so the app should warn if the outbox has unsynced changes for a long time (for example, more than 24 hours).
