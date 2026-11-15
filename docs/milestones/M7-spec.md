# M7 Spec — Progress: exercises (branch m7-progress-exercises)

Author: architect. Binding for M7 builders. Earlier decisions still apply (M1 D1–D12, M2 E1–E7, M3 W1–W8/U1–U5, M4 T1–T8, M5 M1–M10, M6 H1–H24) and PLAN Q1–Q7. Q5 matters most: `weighted_bodyweight` math uses added weight only.

## Scope
In:
- Progress tab shell with segmented control Exercises | Bodyweight | PRs.
- Exercises view (PRD §5.3.1): selector, metric chips (Reps included; P1 but cheap), range selector, line chart with touch tooltip, stat cards, recent sessions, empty / single-point / fallback states.
- Calc layer (§6.1–6.3, §6.6).
- Recharts installed with exact version, lazy-loaded, own chunk (§9.1).
- Exercise Detail tabs (§5.4.1): Records tab; Chart tab (compact chart + "View progress" link).
- Large fixture and 2000-point performance check.
- Playwright Flow C.

Out: Bodyweight view (M8). PRs view placeholder now, built in M8 (PLAN 8.3) on `records.ts`. Rep PR at a given weight (P2). Chart export/sharing. Multi-exercise comparison. No migration, no Dexie bump, no repo changes.

## 0. Decisions (reversible defaults)

- **P1 Segments.** Exercises (default) | Bodyweight | PRs via existing `SegmentedControl` labelled "Progress views". Bodyweight → EmptyState "Bodyweight tracking" / "Logging your weight arrives in the next update." PRs → EmptyState "Personal records" / "A full records list is coming soon. Each exercise’s Records tab shows its bests today." No CTA.
- **P2 Working set.** `completed`, type not in `EXCLUDED_SET_TYPES`, and `canCompleteSet(set, type).ok`. Exported as `isWorkingSet(set, type)` in `src/lib/calc/volume.ts`; `prs.ts` replaces private `isEligible` with it (no behaviour change; prs tests stay green).
- **P3 Metrics by type.** `metricsFor(type)` in chip order, first = default:

  | Type | Chips | Value kind |
  |---|---|---|
  | weight_reps | Weight, Est. 1RM, Volume, Reps | kg, kg, kg, count |
  | weighted_bodyweight | Added weight, Est. 1RM, Volume, Reps | kg (added only), kg, kg, count |
  | bodyweight_reps | Reps, Total reps | count, count |
  | duration | Longest set (chips hidden) | seconds |

  Per-workout value over all working sets of every block of that exercise (duplicate blocks combined): weight = max `weightKg > 0`; e1rm = max `setE1rm` (reps ≤ 12 rule); volume = sum `setVolume` (kg types), sum of reps for bodyweight_reps; reps = max reps; duration = max `durationSec`. No value → no point.
- **P4 Winning set.** Ties → first by block `order` then set `order`. For `reps`, tie → more `weightKg`, then first. Volume points carry no set, carry `setCount`. Compare after `round4`.
- **P5** One point per workout, x = `startedAt`, sorted `startedAt` asc then `workoutId` asc. Completed workouts only (`listCompletedWorkouts()`).
- **P6 Ranges** `1M | 3M | 6M | 1Y | All`, default 3M. Cutoff via date-fns `subMonths(now, 1|3|6)` / `subYears(now, 1)` (local; Mar 31 − 1M = Feb 28/29). Include `t >= cutoff`; no upper bound. `All` no cutoff.
- **P7 Fallback (§6.6).** If range has < 2 points and all time has more points than the range, show all time, `fellBack = true`, hint "Fewer than 2 workouts in this range. Showing all time." Range control keeps the user's choice.
- **P8 States:** no completed workout at all → EmptyState "No workouts yet" / "Finish a workout to see your progress here." CTA "Start a workout" → `/`. Selected exercise has no sessions → "Log this exercise a few times to see your progress." + CTA. Sessions but no points for metric → "No {metric label} data yet" / "Try another metric." (stats and recent sessions still render). 1 point shown → single dot, no line, note "One workout so far. Log another to see a trend."
- **P9 Stat cards** (2×2; `StatTile` gains optional `detail`): Current best = all-time `rangeStats(allPoints).best` ("—" if none). Change: label "Change · {range}" or "Change · All" when fellBack; value/detail from `formatChange(first, last)` over shown points, e.g. "+20 lb" / "+10%", "−5 lb" / "−2%", "0 lb" / "0%"; < 2 points → "—" / "Need 2+ workouts". Workouts = `exerciseHistory(id, workouts).length` (all time). Last performed = `formatRelativeDay(latest startedAt, now)`.
- **P10 Change maths.** Round to displayed values first (`toDisplay`, 1 dp for kg kinds; raw for count/seconds). `abs = last − first`, minus U+2212, no "+" for 0. `pct = Math.round(abs / first × 100)`; "—" if first is 0. Neutral colour.
- **P11** `rangeStats` returns `{count, first, last, best}`; change formatted via `formatChange` (deviation from PLAN). Best tie → earliest.
- **P12 Recent sessions.** 10 newest of `exerciseHistory`, regardless of range; row Link → `/history/:workoutId`. Line 1 `formatWorkoutDate(startedAt, now)` · name. Line 2 `formatSetDetail(topSet, type, unit)` + " · {n} sets" (working sets); none → "Warm-up only". `topSet`: weight_reps heaviest, then most reps, then first; weighted_bodyweight heaviest added > 0 then reps, else most reps; bodyweight_reps most reps; duration longest.
- **P13 Selector.** Header button with name + chevron, `aria-label="Exercise: {name}. Change"`, opens `BottomSheet` "Choose exercise" with `SearchInput` ("Search exercises"). Blank query → trained exercises only (≥ 1 completed set in a completed workout), newest `lastStartedAt` first, subtitle `formatRelativeDay`; archived trained included with " · Archived". With query (`matchesQuery`) → trained matches, then "Not logged yet" section of untrained non-archived matches (collator order). Tap selects + closes. Default/unknown id → most recently trained.
- **P14 State.** Data via liveQuery `listCompletedWorkouts()` + `useExerciseMap()`. View state in memory-only Zustand `useProgressViewStore` `{ view, exerciseId?, metric?, range }` (survives tab switches, resets on reload). `/progress?exercise=<id>` overrides `exerciseId` on mount; URL not kept in sync. Remembered metric used only if in `metricsFor(type)`. Range persists across exercises.
- **P15 Units.** Calc in kg/reps/seconds. Chart datum mapped with `toDisplay` in a memo keyed on unit. All text via `format.ts`.
- **P16 Chart look (§8.6).** Height 240 (Progress) / 180 (compact). Accent `monotone` line only with ≥ 2 points. Dots always: r=3, r=2 when > 150 points; active r=5. Horizontal grid at border colour 40% opacity. Axis labels text-secondary 12 px. `yAxis(values, zeroBased)` → `{domain, ticks}` 4–5 round ticks; Weight/e1RM not zero-based (pad 10% of spread, ≥ 1 unit; single value ±5%, ≥ 1; floor 0); volume/reps/duration zero-based; duration ticks `formatDurationInput`. X numeric time scale `xDomain(ts)` (single point ±1 day); 3–4 ticks "Nov 4" (span ≤ 365 d) else "Nov ’25". Animation 200 ms ease-out, off under `prefers-reduced-motion`. Colours via CSS custom properties in `src/components/charts/chart.css` targeting Recharts classes (`rgb(var(--color-accent))`); no hex.
- **P17 Tooltip.** Recharts `Tooltip` with custom `ChartTooltip` (surface card), vertical cursor, default touch trigger. Line 1 `formatShortDate(t, now)`. Line 2: weight `formatSetDetail(set)` ("225 lb × 5"); e1rm "262.5 lb"; volume `formatVolume`; reps "12 reps"; total reps "45 reps"; duration "1:30". Line 3: e1rm `formatSetDetail(set)`; volume "{n} sets"; reps on kg types `formatSetDetail(set)`. `accessibilityLayer` on. sr-only summary "{label} chart, {n} workouts, from {first} to {last}".
- **P18 Downsample** `downsample(points, max = 500)`: ≤ max → same array; else keep first and last, split interior into `floor((max − 2) / 2)` index buckets, keep each bucket's min and max (dedup, time order). ≤ max points, time order, includes global min and max. `max < 4` throws `RangeError`. Applied after range resolution; stats use full points.
- **P19 Records tab.** `exerciseRecords` all time, working sets only; ties → earliest; `round4`. Kg types: "Best weight" (`formatWeight` with unit, "+" prefix for weighted_bodyweight), "Best est. 1RM", "Best set volume" (`formatVolume`). bodyweight_reps "Most reps"; duration "Longest set". Each card: value, detail `formatSetDetail(set)`, `formatShortDate(startedAt, now)`, link `/history/:workoutId`. Empty: "No records yet" / "Complete a working set to set your first record." First-ever logging counts.
- **P20 Chart tab.** Lazy `ExerciseMiniChart`: default metric over All, 180 px, no chips/range, tooltip on, P8 empty/single states. Below: link "View progress" → `/progress?exercise=:id`.
- **P21 Recharts + splitting.** Main session installs `recharts@3` + `react-is@18.3.1` exact. Only `src/components/charts/**` imports `recharts` (ESLint restricted import with override). `App.tsx` lazy-loads `./routes/ProgressTab/ProgressTab` in `<Suspense fallback={null}>`; `ExerciseDetail` lazy-loads `ExerciseMiniChart`. No `manualChunks`. Lazy chunks precached via existing `**/*.js` glob. `ChunkErrorBoundary` → EmptyState "Couldn’t load this screen" + "Reload" button (user-initiated `location.reload()`).
- **P22 Performance.** Memo chain: `series = useMemo(exerciseSeries, [workouts, exerciseId, metric, type])` → `resolved = useMemo(resolveRange, [series, range, nowDay])` → `display = useMemo(downsample + toDisplay, [resolved, unit])`; `nowDay` from `useNow(60000)`. `trainedExercises` and `exerciseHistory` memoised on workouts. Targets: 2000 workouts series+resolve+downsample < 50 ms (unit test asserts < 250 ms); chart first paint < 1 s, range switch < 300 ms (e2e).
- **P23 Routes.** Only `progress` (lazy); tab bar + mini bar per existing rule.
- **P24** H24 TZ pin applies; range tests include a DST crossing.

## 1. Contracts

### `src/lib/calc/volume.ts` (edit)
```ts
export function isWorkingSet(set: WorkoutSet, type: ExerciseType): boolean; // P2
```

### `src/lib/calc/series.ts` (new)
```ts
export type Metric = 'weight' | 'e1rm' | 'volume' | 'reps' | 'duration';
export type ValueKind = 'kg' | 'count' | 'seconds';
export interface Point {
  t: number;          // workout startedAt
  value: number;      // kg | reps | seconds per metricKind
  workoutId: string;
  set?: WorkoutSet;   // producing set (undefined for volume)
  setCount: number;   // working sets of this exercise in the workout
}
export function metricsFor(type: ExerciseType): readonly Metric[];
export function metricKind(metric: Metric, type: ExerciseType): ValueKind;
export function isZeroBased(metric: Metric): boolean;
export function exerciseSeries(
  exerciseId: string, workouts: readonly Workout[], metric: Metric, exerciseType: ExerciseType,
): Point[];
export function downsample<T extends { t: number; value: number }>(points: readonly T[], max?: number): readonly T[];
```

### `src/lib/calc/range.ts` (new)
```ts
export type RangeKey = '1M' | '3M' | '6M' | '1Y' | 'All';
export const RANGE_KEYS: readonly RangeKey[];
export const DEFAULT_RANGE: RangeKey; // '3M'
export function rangeStart(range: RangeKey, now: number): number | undefined;
export function filterRange<T extends { t: number }>(points: readonly T[], range: RangeKey, now: number): T[];
export function resolveRange<T extends { t: number }>(
  points: readonly T[], range: RangeKey, now: number,
): { points: T[]; fellBack: boolean };
export interface RangeStats { count: number; first?: Point; last?: Point; best?: Point }
export function rangeStats(points: readonly Point[]): RangeStats; // input sorted asc
```

### `src/lib/calc/axis.ts` (new)
```ts
export function yAxis(values: readonly number[], zeroBased: boolean): { domain: [number, number]; ticks: number[] };
export function xDomain(ts: readonly number[]): [number, number];
```

### `src/lib/calc/records.ts` (new)
```ts
export interface RecordEntry { value: number; workoutId: string; startedAt: number; set: WorkoutSet }
export interface ExerciseRecords {
  weight?: RecordEntry; e1rm?: RecordEntry; setVolume?: RecordEntry; reps?: RecordEntry; duration?: RecordEntry;
}
export function exerciseRecords(exerciseId: string, workouts: readonly Workout[], type: ExerciseType): ExerciseRecords;
export function topSet(sets: readonly WorkoutSet[], type: ExerciseType): WorkoutSet | undefined;
export interface TrainedExercise { exerciseId: string; lastStartedAt: number; sessionCount: number }
export function trainedExercises(workouts: readonly Workout[]): TrainedExercise[]; // completed only; desc lastStartedAt, then id asc
```

### `src/lib/exercises.ts` (edit)
```ts
export function selectorSections(
  exercises: readonly Exercise[], trained: readonly TrainedExercise[], query: string,
): { trained: Exercise[]; others: Exercise[] }; // others empty when query blank
```

### `src/lib/format.ts` (edit)
```ts
export function formatRelativeDay(at: number, now: number): string;
// "Today" | "Yesterday" | "3 days ago" | "1 week ago"/"2 weeks ago" (<35 d) | "Nov 4" | "Nov 4, 2025"
// formatLastUsed delegates to it; its output and tests unchanged.
export function formatShortDate(ms: number, now: number): string;       // "Nov 4" / "Nov 4, 2025"
export function formatMetricValue(value: number, kind: ValueKind, unit: Unit): string;
// kg → formatWeight withUnit ("262.5 lb"); count → "12 reps"; seconds → formatDurationInput
export function formatChange(first: number, last: number, kind: ValueKind, unit: Unit): { abs: string; pct: string };
```
Volume values use `formatVolume`; UI picks it when `metric === 'volume' && kind === 'kg'`.

### `src/store/progressView.ts` (new, memory only)
```ts
export type ProgressView = 'exercises' | 'bodyweight' | 'prs';
export interface ProgressViewState {
  view: ProgressView; exerciseId?: string; metric?: Metric; range: RangeKey;
  setView(v: ProgressView): void; setExercise(id: string): void; setMetric(m: Metric): void; setRange(r: RangeKey): void;
}
export const useProgressViewStore: UseBoundStore<StoreApi<ProgressViewState>>;
```

### Components
```ts
// src/components/charts/LineChart.tsx
export interface ChartDatum { t: number; y: number; point: Point } // y in display units
export interface LineChartProps {
  data: readonly ChartDatum[];
  height: number;                   // 240 | 180
  zeroBased: boolean;
  formatY: (y: number) => string;
  renderTooltip: (d: ChartDatum) => { title: string; value: string; detail?: string };
  ariaLabel: string;
}
export function LineChart(props: LineChartProps): JSX.Element;
// width via src/hooks/useElementWidth.ts (ResizeObserver; 0 → only sr summary)
// src/components/charts/ChartTooltip.tsx — tooltip card content
// src/components/charts/chart.css — P16 colours
// src/components/charts/metricLabels.ts: export function metricLabel(metric: Metric, type: ExerciseType): string;
// src/components/charts/ExerciseChart.tsx — ChartDatum[] + tooltip text from Point[]; shared by Progress and mini chart
export interface ExerciseChartProps { points: readonly Point[]; metric: Metric; type: ExerciseType; unit: Unit; now: number; height: number }
// src/components/charts/ExerciseMiniChart.tsx — default export for lazy(); props { exercise: Exercise }; reads listCompletedWorkouts itself
// src/components/ui/StatTile.tsx — optional detail?: string
// src/components/ui/ChunkErrorBoundary.tsx — class component (P21)
// src/routes/ProgressTab/ProgressTab.tsx — header "Progress" + SegmentedControl + view switch
// src/routes/ProgressTab/ExercisesView.tsx — composition, memo chain
// src/routes/ProgressTab/ExerciseSelector.tsx — { exercise?; exercises: ReadonlyMap<string, Exercise>; trained; now; onSelect(id) }
// src/routes/ProgressTab/MetricChips.tsx — { metrics; type; value; onChange } wraps ChipGroup ("Chart metric"); nothing if < 2 metrics
// src/routes/ProgressTab/RangeSelector.tsx — SegmentedControl over RANGE_KEYS ("Chart range")
// src/routes/ProgressTab/StatCards.tsx — P9
// src/routes/ProgressTab/RecentSessions.tsx — P12
// src/routes/ExercisesTab/RecordsPanel.tsx — P19
```
Delete `src/routes/ProgressTab.tsx`.

## 2. Tasks

| # | Task | Agent | Files | Depends |
|---|---|---|---|---|
| 7.0 | Install `recharts@3`, `react-is@18.3.1` exact; ESLint restricted import | main | `package.json`, lockfile, `eslint.config.js` | — |
| 7.1a | `isWorkingSet` (+ prs switch), series, range, axis + tests | data-engineer | `src/lib/calc/{volume,prs,series,range,axis}.ts` + tests | — |
| 7.1b | records, `selectorSections`, format additions + tests | data-engineer | `src/lib/calc/records.ts`, `src/lib/exercises.ts`, `src/lib/format.ts` + tests | 7.1a |
| 7.1c | Deterministic fixture generator | scribe | `src/test/fixtures/progressHistory.ts` | — |
| 7.1d | Perf unit test | data-engineer | `src/lib/calc/__tests__/series.perf.test.ts` | 7.1a, 7.1c |
| 7.2a | Chart kit | chart-builder | `src/components/charts/*`, `src/hooks/useElementWidth.ts`, `src/components/ui/{StatTile,ChunkErrorBoundary}.tsx` | 7.0, 7.1a, 7.1b |
| 7.2b | Progress route + store + lazy route | chart-builder | `src/store/progressView.ts`, `src/routes/ProgressTab/*`, `src/App.tsx` | 7.2a |
| 7.2c | Exercise Detail Records + Chart tabs | chart-builder | `src/routes/ExercisesTab/{ExerciseDetail,RecordsPanel}.tsx`, `src/components/charts/ExerciseMiniChart.tsx` | 7.2a |
| 7.3 | RTL + e2e Flow C + perf e2e; `insertRemoteWorkouts` | qa-engineer | `src/routes/ProgressTab/__tests__/progress.test.tsx`, `src/routes/ExercisesTab/__tests__/records.test.tsx`, `e2e/auth/{flow-c,progress-perf}.spec.ts`, `e2e/auth/helpers.ts` | 7.2b, 7.2c |
| 7.4 | Review, PROGRESS, PR | code-reviewer, scribe | `docs/PROGRESS.md` | 7.3 |

### Required unit tests
**series:** 0 workouts → []; workout without exercise / in-progress / warm-up-only → no point; heavy warm-up (300×1 next to 225×5) ignored for every metric; incomplete ignored; duplicate blocks → one point (max across, volume summed); P4 ties, reps ties → heavier; e1rm skips reps > 12, weight counts them; weighted_bodyweight 0 added → no weight/e1rm/volume point but a reps point, +20 kg → weight point; bodyweight_reps reps max and total; duration longest; same startedAt → two points ordered by id; metricsFor/metricKind for all 4 types; no mutation.

**downsample:** n ≤ max → identical reference; n = 2000, max 500 → ≤ 500, first/last kept, global min/max kept (incl. mid spike), strictly increasing t; all equal values; max = 3 throws.

**range:** each key's cutoff; point exactly at cutoff included, 1 ms earlier excluded; Mar 31 − 1M → Feb 28 (2026) / Feb 29 (2028); 3M across DST (now 2026-11-10 → 2026-08-10 same local time); future point included; All includes everything. resolveRange: 0 in range / 3 total → fellBack 3; 1/1 → not; 2 in range → not; 0 total → [] not fellBack. rangeStats 0/1/many; best tie → earliest.

**axis:** [100, 110] → lower bound > 0, 4–5 round ticks containing data; single value padded; zeroBased starts 0; all-equal; floor 0; xDomain single point ±1 day.

**records:** per-type records; heavy warm-up ignored; ties → earliest; weighted_bodyweight 0 added → only reps; set volume = single set; `topSet` P12 rules; `trainedExercises` order + sessionCount, warm-up-only sessions count, in-progress excluded.

**selectorSections:** blank → trained only, recency, archived included; "bench press" → trained matches then untrained non-archived by collator; untrained archived excluded.

**format:** formatRelativeDay each band, year boundary, DST; formatLastUsed unchanged; formatShortDate year rule; formatChange lb (205 → 225: "+20 lb" / "+10%"), negative "−", 0 → "0 lb" / "0%", kg, count, seconds, first = 0 → pct "—"; formatMetricValue each kind.

**fixture:** `buildProgressHistory({ workoutCount = 500, seed = 1, startMs, dayStep = 1 })` → `{ exercises, workouts }`; mulberry32; no `Date.now()`; all 4 types (Bench weight_reps 1 warm-up + 3 working with upward trend + noise; Pull-Up weighted_bodyweight some 0 added; Push-Up bodyweight_reps; Plank duration); some drop sets, ~5% incomplete sets, a duplicate Bench block every 50th workout, one in-progress workout; default ≥ 2000 sets; `workoutCount: 2000` → 2000 Bench points.

**perf:** 2000-workout fixture: series + resolveRange('All') + downsample < 250 ms; output ≤ 500; deterministic.

## 3. Acceptance

### RTL (7.3)
Mock `useElementWidth` / ResizeObserver. Progress: three segments + placeholder copy; no workouts → "No workouts yet" + CTA; defaults to most recently trained; selector blank → trained only, "bench press" → "Not logged yet" section, untrained pick → PRD empty copy; chips per type (duration hidden); Est. 1RM changes Current best; range default 3M; < 2 points → fallback hint + "Change · All"; single point → note and no `.recharts-line-curve`; stats per P9/P10; recent sessions ≤ 10 newest first, top-set text, link `/history/:id`; unit toggle to kg re-renders; `?exercise=<id>` deep link; selection survives tab switch. Exercise Detail: Records cards with values, dates, links; empty copy; Chart tab mini chart (lazy, findBy) + "View progress" → `/progress?exercise=…`. Both themes at 390 px checked manually.

### Build check (main, after 7.2b)
Entry chunk lacks `recharts-surface`; a separate chunk has it. Record both gz sizes in PROGRESS. Entry chunk grows ≤ 5 KB gz vs main.

### E2E Flow C (`e2e/auth/flow-c.spec.ts`, 390×844)
1. Create user, sign in, wait for seeding; get "Barbell Bench Press" id via `readRemoteExercises`.
2. `insertRemoteWorkouts(user, rows)` (supabase-js as that user via RLS; never service-role) adds 4 completed Bench workouts at now − 150 d (185×5), − 60 d (205×5), − 40 d (215×5), − 10 d (warm-up 245×1 + 225×5); weights `fromDisplay(x, 'lb')`. Trigger pull (Settings "Sync now" or reload).
3. Progress → Exercises; selector, type "Bench Press", tap "Barbell Bench Press". Weight chip pressed, range 3M.
4. 3 dots. Current best "225 lb" (245 warm-up excluded). Change "+20 lb" / "+10%". Workouts "4". Last performed "1 week ago".
5. Est. 1RM chip → Current best "262.5 lb".
6. 6M → 4 dots; Change "+46.7 lb" / "+22%".
7. Tap/hover last dot → tooltip shows `formatShortDate(now − 10 d)` and "225 lb × 5".
8. 1M → fallback hint, 4 dots.
9. First recent-session row links to `/history/:id`.
10. Settings → kg, back to Progress (selection remembered): Current best "119.1 kg".
11. Exercises → Barbell Bench Press → Records: "102.1 kg", "119.1 kg", "510 kg", each with date. Chart tab → "View progress" opens Progress with Bench selected.

### Perf e2e (`e2e/auth/progress-perf.spec.ts`, tagged/skippable)
Insert 2000-workout Bench fixture (batches of 500), pull. First dot within 1500 ms of tab tap; All → 3M within 500 ms; dots in All ≤ 500; no long task > 200 ms during range switch.

### Exit
Flow C on owner's phone in both themes; touch tooltip by tap and drag; no visible lag on 2000 points; Progress loads offline after one online visit.

## 4. Risks / open questions
- R-a Recharts 3 bundle (redux-toolkit, immer, reselect ~100–140 KB gz) in the lazy chunk. Fallback `recharts@2.15.x` if 3.x has React 18 / TS 6 type issues.
- R-b iOS standalone touch tooltip persistence; check on device, switch to `trigger="click"` for coarse pointers if needed.
- R-c No hex values in `src/components/charts` (reviewer checks).
- R-d Stale lazy chunk after deploy with old SW → ChunkErrorBoundary.
- R-e jsdom has no layout; chart rendering verified by e2e.
- R-f Remote-inserted e2e workouts have no `isPR`; M7 doesn't read it.
- Q1 Reps ships now (yes). Q2 PRs view in M8 (yes). Q3 compact chart range All. Q4 selection not persisted across reloads. Q5 top set by heaviest weight. Q6 `rangeStats` without change. Q7 Change neutral colour.
