# M8 Spec — Progress: bodyweight + PRs view (branch m8-bodyweight)

Author: architect. Binding for M8 builders. Earlier decisions still apply (M1 D1–D12, M2 E1–E7, M3 W/U, M4 T, M5 M, M6 H1–H24, M7 P1–P24) and PLAN Q1–Q7. Q3 matters most. **D1 (no local tombstones)** decides how delete and re-log work.

## Scope
In:
- Bodyweight view (PRD §5.3.2): log card (prefilled, date picker, note, upsert); chart with raw dots, bold EWMA trend line, dashed goal line; range selector; neutral-colour stats; entries list with swipe delete + undo and tap to edit; empty state.
- Calc: local-date helpers, EWMA with gap-scaled α (§6.4), bodyweight series and stats, validation 0 < kg < 700.
- `src/db/repos/bodyweight.ts` via the outbox: upsert by date with deterministic id (Q3), delete, restore for undo.
- Settings → Bodyweight: goal weight (set/clear) in display unit.
- PRs view (§5.3.3, P1): records grouped by exercise, search + muscle chips.
- Local-Supabase integration test for revive-after-soft-delete and unique/check constraints.
- Playwright Flow D (same-day upsert, delete + re-log, remote checks, second device, two-device same date) + PRs e2e.

Out: onboarding bodyweight (M10), import/export/CSV (M9), offline e2e beyond one Flow D step (M9), bodyweight in `weighted_bodyweight` math (Q5), goal projections, rep PRs (P2).

No migration, no Dexie bump (`bodyweight: 'id, &date'` exists), no new deps.

## 0. Decisions (reversible defaults)

- **B1 Entry id** `id = bodyweightId(userId, date)` (`src/lib/ids.ts`). Every write for a date reuses it; same user on two devices → same id.
- **B2 Upsert.** `upsertForDate` in one `runWrite(['bodyweight_entries'])`: read existing by id; `put { id, userId, date, weightKg, note?, createdAt: existing?.createdAt ?? now, updatedAt: now }`; `enqueue(..., 'upsert', record)`. Weight and note replace stored values (`note` undefined removes it; log card preloads the existing note). Defensive: a local row with same `date` but different id is deleted and its `delete` enqueued before the upsert.
- **B3 Delete + re-log vs sync.** Delete = local hard delete + enqueue delete → server `deleted_at`. Re-log same date writes same id: before push, `coalesce()` keeps the last op (one upsert); after the tombstone was pushed, the upsert (`onConflict: 'id'`, `toRow` sends `deleted_at: null`) revives the row; `bodyweight_user_date_uniq` not violated. Pulled tombstone while a local re-log is pending is skipped (pending wins in `applyServerRecords`).
- **B4 Undo.** Swipe or sheet delete → toast "Weigh-in deleted" + "Undo" (5 s). `deleteEntry` returns the snapshot. `restoreEntry(snapshot)` puts it back + enqueues upsert only if no row exists for `snapshot.date`; else returns `false`.
- **B5 Date model.** Local `'YYYY-MM-DD'`; `todayLocal(now)` via getFullYear/getMonth/getDate; chart `t = parseLocalDate(date)` (local midnight); `daysBetween` via `Date.UTC` differences (exact across DST). Future dates rejected (`max={today}` + repo check). Min `1900-01-01`. Strict real calendar dates only. Remote rows "tomorrow" locally are still shown.
- **B6 Weight validation.** Input in display unit via `fromDisplayInput(raw, unit)` (accepts `,`), then `roundBodyweightKg` (3 dp). Valid when `0 < kg < 700` after rounding. Errors: blank → Save disabled; `≤ 0` → "Enter a weight above 0"; `≥ 700 kg` → "Weight must be under {formatWeight(700, unit, withUnit)}". Repo re-validates and returns `{ ok: false, error }`. 178.4 lb → 80.921 kg → shows "178.4".
- **B7 Note.** Trimmed; empty → undefined. `BW_NOTE_MAX = 200` (`maxLength` + repo `note_too_long`).
- **B8 Log card** at top. Weight `NumberInput` (decimal; kg value; format `formatWeight(kg, unit)`; parse `fromDisplayInput`; aria-label "Weight in {unit}") + unit suffix. Date `TextInput type="date"` "Date" = `pickedDate ?? todayLocal(now)` with `useNow(60000)`. Note `TextInput` "Note (optional)". Derived prefill: `entryForDate = entries.find(e => e.date === date)`; weight shown = typed if touched else `entryForDate?.weightKg ?? latest?.weightKg`; note = typed if touched else `entryForDate?.note ?? ''`; date change resets touched flags. With `entryForDate`: button "Update" + helper "Already logged {weight} for this day. Saving replaces it."; else "Save". After save: reset touched, toast "Weigh-in saved"; failure toast "Couldn’t save weigh-in". No entries → blank weight.
- **B9 Edit.** Tap row → `BottomSheet` "Edit weigh-in · {formatWorkoutDate(t, now)}" with weight + note (same validation). Footer "Save" (`upsertForDate(entry.date, …)`) and "Delete" (danger, B4). Date not editable.
- **B10 EWMA.** `TREND_ALPHA = 0.1`. Sort asc by date then id. `trend₀ = w₀`; `αᵢ = 1 − (1 − α)^daysBetween(prev, cur)`; `trendᵢ = trendᵢ₋₁ + αᵢ(wᵢ − trendᵢ₋₁)`. Duplicate date → days 0 → trend unchanged. α outside (0, 1] → `RangeError`. Computed over all entries before range filtering; kg full precision.
- **B11 Chart.** New `BodyweightChart` in `src/components/charts`, sharing the kit. Move `xTicks`, `formatTick`, `prefersReducedMotion`, `Y_AXIS_WIDTH` from `LineChart.tsx` into `chartAxis.ts`. `ChartTooltip` generic with an `isDatum` guard. Series: raw `<Line dataKey="raw" className="lift-bw-raw">` no curve stroke, dots r 2.5 (1.5 when > 150), muted `rgb(var(--color-text-secondary) / 0.7)`, active r 5; trend `<Line dataKey="trend" className="lift-bw-trend" type="monotone" dot={false}>` accent 3 px, only with ≥ 2 points; goal `<ReferenceLine y={toDisplay(goalKg)} className="lift-bw-goal" strokeDasharray="6 4">` label "Goal {formatWeight(goal, unit, withUnit)}" top right. y via `yAxis(raw ∪ trend ∪ goal, false)` (goal always in domain). x via `xDomain` + M7 ticks. Colours in `chart.css` only. Height 240; animation as P16. `downsample(points, 500)` after range; stats use full set. Tooltip: title `formatShortDate(t, now)`, value "178.4 lb", detail "Trend 179.1 lb" + " · {note}" (40 chars). sr summary "Bodyweight chart, {n} weigh-ins, from {first} to {last}". Single point: one dot, no trend, note "One weigh-in so far. Log another to see a trend."
- **B12 Ranges.** `RANGE_KEYS`, default 3M, separate memory-only `bodyweightRange`. `resolveRange(points, range, nowDay)`. Fallback hint "Fewer than 2 weigh-ins in this range. Showing all time."
- **B13 Stats.** Row 1: Current, Change. Row 2: Min, Max, Average. Current = latest entry overall → `formatWeight(withUnit)`, detail `formatRelativeDay(t, now)`. Change ("Change · {range}" / "Change · All") over raw shown entries via `formatBodyweightChange`: "↓ 2.4 lb", "↑ 1 lb", "0 lb"; detail signed pct ("−1%"); neutral colour; < 2 → "—" / "Need 2+ weigh-ins". Min/Max/Average over shown entries. `getLatest()` dropped (view uses `listEntries()[0]`).
- **B14 Entries list.** Reverse chrono, all entries regardless of range; first 30 then "Show more" (+30). Row: `formatWorkoutDate(t, now)` + weight right (tabular-nums); line 2 note. `SwipeRow` with `deleteLabel` "Delete weigh-in {date}". Row button aria-label "Edit weigh-in {date}, {weight}" opens B9.
- **B15 Empty.** No entries: log card, then `EmptyState` "No weigh-ins yet" / "Log your first weigh-in to start tracking." CTA "Log weight" focuses the weight input. Chart, range, stats, list hidden.
- **B16 Goal setting.** New Settings section "Bodyweight" (between Workout and Account & Sync) with `GoalWeightField`: `NumberInput` (aria-label "Goal weight in {unit}", placeholder "None") + unit suffix; saves on blur (wrapper `onBlur`) and Enter via `update({ bodyweightGoalKg })`; B6 bounds with inline error, no save on error; ghost "Clear goal" when set → `update({ bodyweightGoalKg: undefined })`; helper "Shown as a dashed line on your bodyweight chart." Bodyweight view shows "Set a goal" link → `/settings` under the chart when no goal.
- **B17 Units.** kg stored; text via `format.ts`, inputs via `fromDisplayInput`.
- **B18 Data flow.** `useLiveQuery(() => listEntries(), [], null)`. `useProgressViewStore` adds `bodyweightRange`, `prsQuery`, `prsMuscle`. Memo chain `bodyweightSeries` → `resolveRange` → chart downsample/display.
- **B19 PRs view.** `listCompletedWorkouts()` + `useExerciseMap()` → `recordsByExercise(workouts, types)` (single pass; equals `exerciseRecords` per exercise). Exercises with ≥ 1 record incl. archived (" · Archived"). Alphabetical (collator). `ExerciseFilterBar` (search `matchesQuery`, muscle chips). Card header: name + muscle label, link `/progress?exercise=:id`. Rows from `recordCards` (extracted from `RecordsPanel.buildCards`): label, value, `formatSetDetail · formatShortDate`, link `/history/:workoutId`. Empty: "No records yet" / "Finish a workout to set your first records." CTA "Start a workout" → `/`. No match: "No matching records" / "Try another search or muscle group." CTA "Clear filters".
- **B20 Two devices.** Same date on two devices → one row, same id; last push wins by server `updated_at`.
- **B21** Tests run with `TZ=America/New_York`; date tests cover 2026-03-08 and 2026-11-01.

## 1. Contracts

### `src/lib/dates.ts` (new)
```ts
export function todayLocal(now?: number): string;               // 'YYYY-MM-DD' local
export function isLocalDateString(s: string): boolean;           // strict, 1900-01-01..9999-12-31
export function parseLocalDate(date: string): number;            // local midnight ms; RangeError if invalid
export function daysBetween(from: string, to: string): number;   // calendar days, DST-safe
```

### `src/lib/calc/trend.ts` (new)
```ts
export const TREND_ALPHA = 0.1;
export function ewma<T extends { date: string; weightKg: number }>(
  entries: readonly T[], alpha?: number,
): { entry: T; trendKg: number }[]; // asc by date then id; input not mutated
```

### `src/lib/calc/bodyweight.ts` (new)
```ts
export const BW_MAX_KG = 700;
export const BW_NOTE_MAX = 200;
export type BodyweightWeightError = 'missing' | 'too_low' | 'too_high';
export function roundBodyweightKg(kg: number): number;
export function validateBodyweightKg(kg: number | undefined): BodyweightWeightError | undefined;
export interface BodyweightPoint { t: number; value: number; trend: number; entry: BodyweightEntry }
export function bodyweightSeries(entries: readonly BodyweightEntry[]): BodyweightPoint[];
export interface BodyweightStats {
  count: number; first?: BodyweightPoint; last?: BodyweightPoint;
  min?: BodyweightPoint; max?: BodyweightPoint; averageKg?: number;
}
export function bodyweightStats(points: readonly BodyweightPoint[]): BodyweightStats; // ties → earliest
```

### `src/lib/format.ts` (edit)
```ts
export function formatBodyweightChange(firstKg: number, lastKg: number, unit: Unit): { value: string; detail: string };
```

### `src/db/repos/bodyweight.ts` (new)
```ts
export type BodyweightWriteError = BodyweightWeightError | 'invalid_date' | 'future_date' | 'note_too_long';
export type BodyweightWriteResult =
  | { ok: true; entry: BodyweightEntry } | { ok: false; error: BodyweightWriteError };
export function listEntries(): Promise<BodyweightEntry[]>;                      // date desc
export function upsertForDate(date: string, weightKg: number, note?: string): Promise<BodyweightWriteResult>;
export function deleteEntry(id: string): Promise<BodyweightEntry | undefined>;
export function restoreEntry(snapshot: BodyweightEntry): Promise<boolean>;
```
Writes via `runWrite(['bodyweight_entries'], …)` + `enqueue`; `requireUserId()` before the transaction; stores rounded kg.

### `src/lib/calc/records.ts` (edit), `src/lib/recordCards.ts` (new)
```ts
export function recordsByExercise(workouts: readonly Workout[], types: ExerciseTypes): Map<string, ExerciseRecords>;
export interface RecordCard { key: keyof ExerciseRecords; label: string; value: string; entry: RecordEntry }
export function recordCards(records: ExerciseRecords, type: ExerciseType, unit: Unit): RecordCard[];
```

### `src/lib/exercises.ts` (edit)
```ts
export function prGroups(
  exercises: ReadonlyMap<string, Exercise>, records: ReadonlyMap<string, ExerciseRecords>,
  query: string, muscle: MuscleGroup | 'all',
): { exercise: Exercise; records: ExerciseRecords }[];
```

### `src/store/progressView.ts` (edit)
Add `bodyweightRange: RangeKey` (default `DEFAULT_RANGE`), `prsQuery: string`, `prsMuscle: MuscleGroup | 'all'` + setters `setBodyweightRange`, `setPrsQuery`, `setPrsMuscle`.

### Components
```ts
// src/components/charts/chartAxis.ts — xTicks, formatTick, prefersReducedMotion, Y_AXIS_WIDTH (moved)
// src/components/charts/ChartTooltip.tsx — generic:
interface ChartTooltipProps<D> { active?: boolean; payload?: readonly { payload?: unknown }[];
  isDatum: (v: unknown) => v is D; render: (d: D) => TooltipText }
// src/components/charts/BodyweightChart.tsx
export interface BodyweightChartProps {
  points: readonly BodyweightPoint[]; goalKg?: number; unit: Unit; now: number; height: number;
}
// src/components/charts/chart.css — .lift-bw-raw / .lift-bw-trend / .lift-bw-goal
// src/routes/ProgressTab/Bodyweight/{BodyweightView,LogWeightCard,BodyweightStats,EntriesList,EditEntrySheet}.tsx
// src/routes/ProgressTab/Bodyweight/useDeleteWithUndo.ts
// src/routes/ProgressTab/PRs/{PRsView,PRGroupCard}.tsx
// src/routes/ProgressTab/ProgressTab.tsx — replace placeholders
// src/routes/Settings/GoalWeightField.tsx — { goalKg?; unit; onSave(kg | undefined) }
// src/routes/SettingsPage.tsx — add "Bodyweight" section
```

## 2. Tasks

| # | Task | Agent | Files | Depends |
|---|---|---|---|---|
| 8.1a | dates, trend, bodyweight calc, `formatBodyweightChange` + tests | data-engineer | `src/lib/dates.ts`, `src/lib/calc/{trend,bodyweight}.ts`, `src/lib/format.ts` + tests | — |
| 8.1b | Bodyweight repo + tests; sync-path tests | data-engineer | `src/db/repos/bodyweight.ts`, `src/db/__tests__/bodyweight.test.ts`, sync/syncApply test additions | 8.1a |
| 8.1c | `recordsByExercise`, `recordCards` extraction, `prGroups` + tests | data-engineer | `src/lib/calc/records.ts`, `src/lib/recordCards.ts`, `src/lib/exercises.ts`, `RecordsPanel.tsx` + tests | — |
| 8.1d | Local-Supabase bodyweight constraint tests | supabase-engineer | `tests/rls/bodyweight.test.ts` | — |
| 8.2a | Chart kit: chartAxis, generic tooltip, BodyweightChart, css | chart-builder | `src/components/charts/*` | 8.1a |
| 8.2b | Bodyweight view + store + ProgressTab wiring | chart-builder | `src/routes/ProgressTab/Bodyweight/*`, `src/store/progressView.ts`, `ProgressTab.tsx` | 8.1b, 8.2a |
| 8.2c | Settings goal field | ui-builder | `src/routes/Settings/GoalWeightField.tsx`, `SettingsPage.tsx` | 8.1a |
| 8.3 | PRs view | chart-builder | `src/routes/ProgressTab/PRs/*` | 8.1c, 8.2b |
| 8.4 | RTL + e2e Flow D + PRs e2e + helpers | qa-engineer | tests, `e2e/auth/{flow-d,prs}.spec.ts`, `e2e/auth/helpers.ts` | 8.2b, 8.2c, 8.3 |
| 8.5 | Review, PROGRESS, PR | code-reviewer, scribe | `docs/PROGRESS.md` | 8.4 |

### Required unit tests
- **dates:** `todayLocal` at 23:59:59.999 and 00:00; 2026-03-08 and 2026-11-01 at 00:30/01:30/03:00; month/year rollover; `isLocalDateString` rejects `2026-02-30`, `2026-2-3`, `''`, `1899-12-31`, accepts `2028-02-29`; parse round trip; `daysBetween` across both DST days = 1, 365/366 across years.
- **trend:** [] → []; single → trend = weight; constant; consecutive days `w0 + 0.1(w1 − w0)`; 3-day gap α = 0.271; 30-day gap α ≈ 0.958; DST gap uses calendar days; unsorted input sorted, not mutated; duplicate date unchanged; α 0 / 1.5 → RangeError; α 1 → raw.
- **bodyweight calc:** `validateBodyweightKg` undefined, 0, 0.0004, 0.001, 699.999, 699.9996, 700, NaN; 178.4 lb round trip; `bodyweightSeries` ordering + trend; `bodyweightStats` 0/1/many, ties → earliest, average.
- **format:** `formatBodyweightChange` up/down/zero kg/lb; pct sign.
- **repo:** new date → id `bodyweightId(owner, date)`, 3 dp, 1 upsert; same date → 1 row, same id, `createdAt` kept, `updatedAt` bumped; note trim/empty/201 chars; invalid weight/date/future → error, no write/outbox; `listEntries` desc; `deleteEntry` snapshot + delete op, missing → undefined no outbox; delete then re-log same date → same id, `coalesce(listDue)` yields one upsert; `restoreEntry` free vs occupied; legacy clash row deleted + delete op before upsert; no owner rejects.
- **sync paths:** `toRow('bodyweight_entries')` `deleted_at: null` + round3; tombstone while local re-log pending → skipped; tombstone with nothing pending → local deleted; live row replaces local different-id row same date.
- **records/prGroups:** `recordsByExercise` deep-equals `exerciseRecords` for every exercise in `buildProgressHistory({ workoutCount: 500 })`; 2000 fixture < 250 ms; `recordCards` labels per type; `prGroups` query, muscle, collator order, archived included, empty excluded.
- **local Supabase:** insert X for D; soft-delete; upsert X `deleted_at: null` → one live row; insert Y for D while X live → 23505; Y after X soft-deleted → OK; `weight_kg` 700 → 23514, 699.999 OK.

## 3. Acceptance

### RTL (8.4)
Segments replace placeholders; empty copy + "Log weight" focuses input; log card save 178.4 → upsertForDate(today, 80.921); prefill from latest; "Update" + helper when date has entry; past date preloads weight/note; validation lb/kg; `max` = today; comma decimal; fallback hint + "Change · All"; stats text; arrows; list order; "Show more" after 30; tap row → sheet (no date field); sheet Save; sheet Delete → toast → Undo; SwipeRow delete same handler; BodyweightChart gets goalKg; "Set a goal" link; Settings goal saves on blur in kg, error at 1543.3 lb, "Clear goal", unit toggle; PRs groups, search, muscle chip, empty / no-match / Clear filters, record link `/history/:id`, header link `/progress?exercise=:id`. Manual 390 px both themes.

### E2E Flow D (`e2e/auth/flow-d.spec.ts`, 390×844, local Supabase)
1. Create user, sign in, wait for seeding. Compute `today`, `today−3` in page; ids via `bodyweightId(user.id, date)`.
2. Progress → Bodyweight → "Log your first weigh-in to start tracking."
3. 178.4 → Save. One dot, single-point note, list row "178.4 lb" today, Current "178.4 lb". Remote: 1 row, expected id, `entry_date = today`, weight 80.921, `deleted_at` null.
4. Input shows 178.4, button "Update". 177.6 → Update. 1 list row; Dexie 1 row; remote 1 row same id, 80.558.
5. Date today−3, 179 → Save. Two dots, `.lift-bw-trend` present. Change "↓ 1.4 lb".
6. Today's row → Delete → toast expires. Remote today `deleted_at` set.
7. Re-log today 176.8 → remote today exactly 1, same id, `deleted_at` null, 80.195. 2 rows total.
8. Delete today−3 → Undo → back. After Sync now remote today−3 `deleted_at` null.
9. Offline: log today−1 at 177 → list updates. Online, Sync now → remote row appears.
10. Settings goal 170 → blur. Remote `bodyweightGoalKg ≈ 77.111`. Progress shows `.lift-bw-goal` + "Goal 170 lb". Clear goal → line gone, remote key absent.
11. Second device: 3 rows, today 176.8 lb, Dexie one row for today. Device B logs today 175 → remote 79.379. Device A Sync now → 175 lb. Remote 1 row for today.
12. Settings → kg: "79.4 kg".

### E2E PRs (`e2e/auth/prs.spec.ts`)
1. `insertRemoteWorkouts`: Bench 205×5 and 225×5 (warm-up 245×1), Pull-Up +20 kg×5. Pull.
2. Progress → PRs. Bench "225 lb", "262.5 lb", "1,125 lb" with dates; Pull-Up "+44.1 lb".
3. Search "pull" → Pull-Up only. Clear, "Chest" chip → Bench only.
4. Record row → `/history/:id`. Header link → Exercises view with Bench selected.

### Exit
Flow D on owner's phone both themes incl. iOS date picker and swipe delete + undo; same-date entry from two devices → one row; PRs list no lag on 2000-workout fixture.

## 4. Risks / open questions
- R-a iOS date input clear → '' → Save disabled; check on device.
- R-b Delete-vs-edit race across devices: last writer wins. Accepted.
- R-c Goal far from data flattens chart (goal always in domain).
- R-d Recharts `Line className` targeting for raw dots; fallback `Scatter`.
- R-e `recordsByExercise` only kept if profiling justifies; otherwise single pass only.
- Q1 Change uses raw entries. Q2 future dates blocked. Q3 list shows all entries, paged 30. Q4 sheet can't change date. Q5 PRs alphabetical. Q6 bodyweight delete has undo. Q7 `getLatest` dropped.
