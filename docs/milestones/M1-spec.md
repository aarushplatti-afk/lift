# Milestone 1 Implementation Spec (branch m1-foundation)

Written by `architect`. It is binding for M1 builder agents, and it refines docs/PLAN.md §3 M1. Sources: PLAN §3 M1 and §5 (Q1–Q7 accepted), CLAUDE.md, PRD §2, §4, §5.5, §5.7, §6.7, §8.2–8.3, §9.5, §11, §14, §19.

## 0. Global decisions (binding)

- **D1. No local tombstones.**
  - Dexie never stores deleted rows.
  - Domain types carry `userId` and `updatedAt`, but not `deletedAt`.
  - `fromRow` returns a `deleted` flag, and pull deletes that row locally.
- **D2. The outbox is append-only.**
  - `enqueue` always inserts a new entry. Coalescing happens at push time.
  - Push deletes exactly the entry ids it sent, so an edit made during an in-flight push is never lost.
- **D3. Outbox primary key** is Dexie auto-increment `++id` (a number). This gives strict FIFO order.
- **D4. The pull cursor is a keyset** of `(updated_at, id)`.
  - Keep it as the server's ISO string exactly as received, with microseconds intact. Never parse it to a Date.
  - Reason: a plain `updated_at > cursor` with limit 500 skips rows that share one `now()` at a page boundary.
- **D5. The Supabase client is injected** into push, pull and the engine through a `LiftClient` parameter, so tests can use fakes.
  - Only `src/lib/supabase.ts` and `src/sync/**` may import `@supabase/supabase-js`.
  - Only `src/db/**` and `src/hooks/useLiveQuery.ts` may import `dexie`.
  - ESLint `no-restricted-imports` overrides enforce both rules.
- **D6. Live queries use no `dexie-react-hooks`.**
  - Write a small hook in `src/hooks/useLiveQuery.ts` that wraps Dexie 4's `liveQuery`. Signature: `useLiveQuery<T>(query: () => Promise<T>, deps: readonly unknown[], initial: T): T`.
  - `query` is always a repo function.
  - Zustand stores subscribe through repo-provided `observeX()` functions.
- **D7. Dependency installs are done only by the main session.** Agents never edit `package.json` dependencies.
  - Already installed: vite-plugin-pwa, workbox-window, @vite-pwa/assets-generator, fake-indexeddb, supabase CLI.
- **D8. Deterministic ids** (Q1/Q3) live in `src/lib/ids.ts`. It is pure and uses `uuid` v5.
- **D9. Global `uuid primary key` stays.** Per-user v5 namespaces prevent collisions.
  - A deliberate collision fails RLS with 42501, because the UPDATE USING policy applies to ON CONFLICT DO UPDATE.
  - The RLS suite asserts this.
- **D10. `user_settings` keeps the PRD shape**, with no id, created_at or deleted_at.
  - Its pull keyset is `(updated_at, user_id)`.
- **D11. Settings defaults are NOT persisted on first run.**
  - `getSettings()` returns the stored settings, or the defaults if none are stored.
  - Only `updateSettings` writes and enqueues.
- **D12. Sign-out and account switching.**
  - An involuntary sign-out (revoked refresh token) keeps the cache and outbox.
  - Signing back in as the same user resumes where it left off.
  - Signing in as a different user wipes everything first. The sign-in screen warns if the outbox is non-empty.

### Answers to the architect's M1 questions (decided by the main session under the user's blanket authorization, 2026-11-13)

- **Q-A.** `fake-indexeddb` (dev) and `workbox-window` are approved and installed.
- **Q-B.** The in-app password-reset flow is deferred to M9. Until then, use the Supabase dashboard.
- **Q-C.** When a different account signs in, unsynced changes left by a revoked session are discarded after a warning (D12).
- **Q-D.** The CI `integration` job, which runs a local Supabase in GitHub Actions, is accepted. It is not a required check in M1.

## 1.2 Contracts (data-engineer)

**Files:** `src/types/domain.ts`, `src/types/sync.ts`, `src/lib/units.ts`, `src/lib/format.ts`, `src/lib/ids.ts`, tests in `src/lib/__tests__/`, and the ESLint restricted-imports rules.

**`src/types/domain.ts`**

```ts
export type MuscleGroup = 'chest'|'back'|'shoulders'|'biceps'|'triceps'|'quads'|'hamstrings'|'glutes'|'calves'|'core'|'forearms'|'full_body'|'cardio'|'other';
export type Equipment = 'barbell'|'dumbbell'|'machine'|'cable'|'bodyweight'|'kettlebell'|'band'|'other';
export type ExerciseType = 'weight_reps'|'bodyweight_reps'|'weighted_bodyweight'|'duration';
export type SetType = 'normal'|'warmup'|'drop'|'failure';
export type Unit = 'lb'|'kg';
export type ThemePref = 'dark'|'light'|'system';
export interface SyncMeta { userId: string; updatedAt: number } // epoch ms; replaced by server updated_at on pull
export interface Exercise extends SyncMeta { id: string; name: string; muscleGroup: MuscleGroup; equipment: Equipment; type: ExerciseType; isCustom: boolean; archived: boolean; notes?: string; createdAt: number }
export interface WorkoutSet { id: string; order: number; type: SetType; weightKg?: number; reps?: number; durationSec?: number; completed: boolean; completedAt?: number; isPR?: boolean }
export interface WorkoutExercise { id: string; exerciseId: string; order: number; notes?: string; restSeconds?: number; sets: WorkoutSet[] }
export interface Workout extends SyncMeta { id: string; name: string; startedAt: number; endedAt?: number; status: 'in_progress'|'completed'; templateId?: string; notes?: string; exercises: WorkoutExercise[]; createdAt: number }
export interface TemplateSet { type: SetType; targetReps?: number; targetWeightKg?: number }
export interface TemplateExercise { exerciseId: string; order: number; restSeconds?: number; sets: TemplateSet[] }
export interface Template extends SyncMeta { id: string; name: string; exercises: TemplateExercise[]; createdAt: number; lastUsedAt?: number }
export interface BodyweightEntry extends SyncMeta { id: string; date: string /* YYYY-MM-DD local */; weightKg: number; note?: string; createdAt: number }
export interface SettingsData { unit: Unit; theme: ThemePref; defaultRestSeconds: number; restTimerAutoStart: boolean; keepScreenAwakeDuringWorkout: boolean; hapticsEnabled: boolean; soundEnabled: boolean; weightIncrementLb: number; weightIncrementKg: number; bodyweightGoalKg?: number; schemaVersion: number }
export interface Settings extends SettingsData, SyncMeta { id: 'singleton' }
```

**`src/types/sync.ts`**

```ts
export type SyncTable = 'exercises'|'workouts'|'templates'|'bodyweight_entries'|'user_settings';
export interface SyncRecordMap { exercises: Exercise; workouts: Workout; templates: Template; bodyweight_entries: BodyweightEntry; user_settings: Settings }
export type DeletableTable = Exclude<SyncTable,'user_settings'>;
export type OutboxEntry = { id?: number; table: SyncTable; recordId: string; createdAt: number; attempts: number; lastError?: string; state: 'pending'|'failed'; nextAttemptAt: number }
  & ({ op: 'upsert'; payload: SyncRecordMap[SyncTable] } | { op: 'delete'; payload: null });
export interface SyncState { table: SyncTable; lastPulledAt: string|null; lastPulledKey: string|null } // keyset (updated_at, id|user_id)
export interface SyncStatus { state: 'synced'|'syncing'|'offline'|'error'; pendingCount: number; failedCount: number; lastSyncedAt?: number; lastError?: string }
```

**`src/lib/units.ts`** (pure)
- `KG_PER_LB = 0.45359237`
- `lbToKg(lb)` and `kgToLb(kg)`
- `roundKg(kg): number`, rounding to 4 dp
- `toDisplay(kg: number, unit: Unit): number`, rounding to 0.1
- `fromDisplay(value: number, unit: Unit): number`, returning kg to 4 dp
- `parseDecimal(raw: string): number | undefined`: trims, turns a single `,` into `.`, and rejects empty, NaN, negative and Infinity values
- `fromDisplayInput(raw: string, unit: Unit): number | undefined`

**`src/lib/format.ts`**
- `formatWeight(kg: number|undefined, unit: Unit, opts?: { withUnit?: boolean }): string`
- Outputs: `'135'`, `'137.5'`, `'135 lb'`, and `'—'` for undefined.
- Uses `toDisplay`, strips a trailing `.0`, always uses `.` as the decimal separator, and does not use Intl.

**`src/lib/ids.ts`**
- `LIFT_NS` is a fixed literal UUID. Never change it.
- `newId(): string` uses `crypto.randomUUID`.
- `userNamespace(userId: string): string` returns `v5(userId, LIFT_NS)`.
- `seededExerciseId(userId: string, name: string): string` returns `v5(name.trim().toLowerCase(), userNamespace(userId))`.
- `bodyweightId(userId: string, date: string): string` returns `v5(date, userNamespace(userId))`.
- For M8: changing an entry's date means delete plus create, because the id changes with the date.

**Tests**
- 135 lb displays as 135.
- 137.5 survives a round trip.
- 100 kg.
- `'135,5'` parses.
- Invalid input is rejected.
- Ids are deterministic, differ per user, and ignore the case of the name.

## 1.3 Dexie (data-engineer)

**Files:** `src/db/schema.ts`, `src/db/repos/outbox.ts`, `src/db/repos/meta.ts`, `src/db/repos/syncApply.ts`, and `src/db/__tests__/{schema,outbox,syncApply}.test.ts`. The vitest setup already imports `'fake-indexeddb/auto'`.

**`src/db/schema.ts`**

```ts
export class LiftDB extends Dexie { exercises!: Table<Exercise,string>; workouts!: Table<Workout,string>; templates!: Table<Template,string>; bodyweight!: Table<BodyweightEntry,string>; settings!: Table<Settings,'singleton'>; syncQueue!: Table<OutboxEntry,number>; syncState!: Table<SyncState,SyncTable>; meta!: Table<MetaRow,MetaKey> }
version(1).stores({ exercises:'id, name, muscleGroup', workouts:'id, startedAt, status', templates:'id, name, lastUsedAt', bodyweight:'id, &date', settings:'id', syncQueue:'++id, [table+recordId], state, nextAttemptAt', syncState:'table', meta:'key' }) // no boolean index (R6)
export type MetaRow = {key:'ownerUserId';value:string}|{key:'ownerEmail';value:string}|{key:'initialPullDone';value:boolean}|{key:'seedVersion';value:number};
export type MetaKey = MetaRow['key'];
export const LOCAL_TABLE: Record<SyncTable, 'exercises'|'workouts'|'templates'|'bodyweight'|'settings'>;
export function createDb(name?: string): LiftDB;
export const db: LiftDB; // name 'lift'
```

**`src/db/repos/outbox.ts`**
- `runWrite<T>(tables: readonly SyncTable[], fn: () => Promise<T>): Promise<T>` opens a read-write transaction over the mapped local tables plus `syncQueue`. It is the only way repos write.
- `enqueue<T extends SyncTable>(table: T, recordId: string, op: 'upsert', payload: SyncRecordMap[T]): Promise<void>`, with an overload `enqueue(table: DeletableTable, recordId: string, op: 'delete')`.
  - Throws if `Dexie.currentTransaction` is missing or doesn't include `syncQueue`.
  - New entries get attempts 0, state `'pending'`, and `nextAttemptAt = createdAt`.
- `listDue(now: number, force: boolean): Promise<OutboxEntry[]>` returns pending entries ordered by id.
- `removeEntries(ids: number[])`.
- `recordFailure(ids: number[], error: string, now: number)` increments attempts, sets lastError, and sets `nextAttemptAt = now + min(2000·2^(attempts−1), 300000)`.
- `hasPending(table, recordId): Promise<boolean>`.
- `observeOutboxCounts(): Observable<{ pending: number; failed: number }>`.

**`src/db/repos/meta.ts`**
- `getOwner(): Promise<{userId: string; email: string} | undefined>`
- `setOwner(userId, email)`
- `requireUserId(): Promise<string>` throws if there is no owner. Repos use it to stamp `userId`.
- `isInitialPullDone()` and `setInitialPullDone(v)`
- `wipeLocalData(): Promise<void>` clears ALL tables in one transaction, including `syncQueue`, `syncState` and `meta`.

**`src/db/repos/syncApply.ts`**
- `applyServerRecords<T extends SyncTable>(table: T, items: {record: SyncRecordMap[T]; deleted: boolean}[]): Promise<{applied: number; skipped: number}>`
  - Runs in one read-write transaction over the local table plus `syncQueue`.
  - Skips any record with a pending outbox entry (pending-wins).
  - Deletes deleted rows and `put`s the others.
  - For bodyweight, first deletes any local row with the same date but a different id, so the `&date` index can't abort the transaction.
- `getCursor(table)` and `setCursor(table, at, key)`.

**Tests**
- The schema opens, and fixtures survive a round trip (this is the migration stub).
- `enqueue` inside a failing transaction rolls back both writes.
- `enqueue` outside a transaction throws.
- Pending-wins.
- Tombstone delete.
- Bodyweight same-date apply.

## 1.4 Settings (data-engineer)

**Files:** `src/db/repos/settings.ts`, `src/store/settings.ts`, `src/lib/theme.ts`, `src/hooks/useLiveQuery.ts`, and their tests.

**`repos/settings.ts`**
- `DEFAULT_SETTINGS: SettingsData`:

  | Field | Default |
  |---|---|
  | `unit` | `'lb'` |
  | `theme` | `'dark'` |
  | `defaultRestSeconds` | 90 |
  | `restTimerAutoStart` | true |
  | `keepScreenAwakeDuringWorkout` | true |
  | `hapticsEnabled` | true |
  | `soundEnabled` | true |
  | `weightIncrementLb` | 5 |
  | `weightIncrementKg` | 2.5 |
  | `schemaVersion` | 1 |

- `getSettings(): Promise<SettingsData>` returns the stored settings, or the defaults if none are stored.
- `observeSettings(): Observable<SettingsData>`.
- `export type SettingsPatch = Partial<Omit<SettingsData, 'schemaVersion'>>`.
- `updateSettings(patch: SettingsPatch): Promise<void>`:
  - Merges the patch onto the stored settings, or onto the defaults if none are stored.
  - An `undefined` value deletes an optional key.
  - Clamps `defaultRestSeconds` to 15..600 in steps of 15. Increments must be > 0. The goal must be 0 < kg < 700.
  - Writes through `runWrite(['user_settings'])` with a `put` plus an upsert `enqueue`.

**`store/settings.ts`**
- `useSettingsStore` holds `{ settings: SettingsData; hydrated: boolean; update(patch: SettingsPatch): Promise<void> }`.
- `initSettingsStore(): () => void` subscribes to `observeSettings`.

**`lib/theme.ts`**
- `applyTheme(pref: ThemePref): () => void`:
  - Toggles the `dark` class on `<html>` (Tailwind `darkMode: 'class'`).
  - Follows `matchMedia` when the preference is `'system'`.
  - Mirrors the preference to localStorage key `'lift.theme'`.
  - Returns a cleanup function.
- `index.html` gets a small inline pre-paint script that reads `'lift.theme'`. Task 1.10 adds it.
- This task does NOT edit `App.tsx`. Task 1.8 wires up init and theme.

## 1.5 UI shell (ui-builder), as in PLAN 1.5

- **Tokens:** CSS variables in `src/styles/tokens.css` for both themes, plus `tailwind.config.ts`.
- **Components:** in `src/components/ui/`.
- **Routes:** HashRouter routes in `src/routes/`, with the shell in `src/App.tsx`.
- **Sign-in UI:** `src/routes/SignIn/SignInScreen.tsx`, with props `{ onSubmit(email, password): Promise<void>; error?: string; busy: boolean; warning?: string }`.
- **Requirements:** inputs at 16px, safe-area insets, works at 390px.
- **Toast:** must accept an action button, which the update prompt uses.

**1.5b (ui-builder, after 1.4 and 1.9)**
- A Settings stub page with three sections:
  - Units.
  - Appearance.
  - Account & Sync: email, status text, pending count, Sync now, and Sign out with the unsynced-changes block from `signOut()`.
- A sync indicator in the Workout tab header.

## 1.6 SQL (supabase-engineer)

**Files:**
- `supabase/config.toml`
- `supabase/migrations/<ts>_0001_init.sql`
- `src/types/database.ts`, generated AFTER 1.2 is committed
- A `package.json` script `gen:types` = `supabase gen types typescript --local > src/types/database.ts`

**Changes from PRD §19.3**
- **`set_updated_at`:** add `set search_path = ''` (advisor 0011), and `revoke execute on function public.set_updated_at() from public, anon, authenticated`.
- **Privileges, on every table:**
  - `revoke all on table ... from anon;`
  - `revoke truncate, references, trigger on table ... from authenticated;` (TRUNCATE bypasses RLS)
  - `alter default privileges in schema public revoke all on tables from anon;`
- **Checks:**
  - `exercises.muscle_group` and `equipment` use `in (...)` lists that match `domain.ts`.
  - `jsonb_typeof(exercises) = 'array'` on workouts and templates.
  - `jsonb_typeof(data) = 'object'` on user_settings.
  - Keep `0 < weight_kg < 700`.
- **Keep:** the global PKs (D9), the partial unique indexes, and one `owner all` policy per table using `(select auth.uid())`. No FK on `template_id`.
- **Q1/Q3 need no schema change.** The ids are deterministic on the client, and re-logging a deleted bodyweight entry (Q3) upserts the same id and clears `deleted_at`.

**`config.toml` (local only)**
- `site_url` = `http://localhost:5173`, plus `additional_redirect_urls`.
- `enable_signup = true`, and `[auth.email] enable_confirmations = false`.
- Never run `config push` with this local config.

**Run:** `npx supabase db reset`, then `gen:types`, then the advisors. If Docker is unavailable, write the SQL and leave `database.ts` pending. A hand-written `database.ts` is allowed only as a clearly marked temporary stub that must be regenerated.

## 1.7 RLS tests (supabase-engineer)

**Files:**
- `tests/rls/rls.test.ts`
- `vitest.rls.config.ts`
- `scripts/with-local-supabase.mjs`
- A `package.json` script `test:rls` = `node scripts/with-local-supabase.mjs vitest run -c vitest.rls.config.ts`

**Environment**
- The script runs `npx supabase status -o env` and parses `API_URL` and `ANON_KEY`, falling back to `PUBLISHABLE_KEY` on newer CLIs.
- It spawns the child process with `SUPABASE_TEST_URL` / `SUPABASE_TEST_KEY` and `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- Process env overrides Vite's `.env` files, so the same script also wraps `e2e`. Nothing is written to disk.
- Test setup aborts unless the URL host is `127.0.0.1` or `localhost`.

**Auth**
- No service-role key, not even locally.
- Two users sign up through the anon client's `auth.signUp`, with random `rls-a-<uuid>@example.test` addresses.

**Test matrix (all 5 tables)**
- User A can create, read, update and delete its own rows.
- User B:
  - Gets 0 rows when selecting by A's id.
  - Update and delete affect 0 rows, and A re-reads its row unchanged.
  - Insert with `user_id = A` fails with 42501.
  - Upsert onto A's id is rejected.
  - On `user_settings`, upsert with `user_id = A` is rejected.
- Anon: select returns an error or nothing, and insert fails.

## 1.8 Auth (supabase-engineer)

**Files:** `src/lib/supabase.ts`, `src/sync/auth.ts`, `src/store/auth.ts`, `src/vite-env.d.ts` (ImportMetaEnv), `src/App.tsx` (gate and init wiring), `.env.example`.

**`lib/supabase.ts`**
- `export type LiftClient = SupabaseClient<Database>`.
- `isSupabaseConfigured(): boolean`.
- `getSupabase(): LiftClient` is memoized. Auth options: `{ persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'lift-auth' }`.
- Throws if the key starts with `sb_secret_` or decodes to role `service_role`.

**`sync/auth.ts`**
- `export interface AuthIdentity { userId: string; email: string }`.
- `getCachedSession(): Promise<AuthIdentity|null>`:
  - Tries `getSession()` first.
  - If that errors or returns null, BUT localStorage `'lift-auth'` exists AND a meta owner exists, it returns the meta identity.
  - This is the offline / expired-token rule: never force a sign-in while offline if a cached session exists.
- `signIn(email, password): Promise<{ ok: true } | { ok: false; message: string }>`:
  - On success, compares `user.id` with the meta owner. If they differ, runs `wipeLocalData()` BEFORE `setOwner`.
  - Then calls `syncNow('signin')`.
  - Error messages cover offline, bad credentials, and other failures.
- `signOut(opts: { discardUnsynced: boolean }): Promise<{ ok: true } | { ok: false; reason: 'unsynced'; pendingCount: number }>`:
  - Syncs first if online.
  - If changes are still pending and `discardUnsynced` is false, returns the `'unsynced'` block.
  - Otherwise calls `auth.signOut({ scope: 'local' })`, then `wipeLocalData`.
- `onAuthChange(cb: (id: AuthIdentity|null) => void): () => void`.

**`store/auth.ts`**
- `useAuthStore` holds `{ status: 'loading'|'signedOut'|'signedIn'; identity?: AuthIdentity; initialPullDone: boolean; init(): () => void }`.

**Gate in `App.tsx`**

| Condition | Shows |
|---|---|
| Supabase not configured | A config error screen |
| `'loading'` | A splash |
| `'signedOut'` | `SignInScreen`, with a warning if the outbox is non-empty |
| `'signedIn'` but initial pull not done | "Setting up…" with per-table progress, plus Retry when offline |
| Otherwise | The app shell |

- `App.tsx` also calls `initSettingsStore`, `applyTheme`, `startSyncTriggers` (after 1.9) and mounts the update toast.

## 1.9 Sync engine (supabase-engineer)

**Files:** `src/sync/{mappers,coalesce,push,pull,engine,triggers}.ts`, `src/store/sync.ts`, and tests in `src/sync/__tests__/`.

**`mappers.ts`**
- `toRow<T extends SyncTable>(table: T, rec: SyncRecordMap[T]): TablesInsert<T>`:
  - Converts camelCase to snake_case and epoch ms to ISO.
  - Leaves jsonb untouched, so timestamps inside it stay epoch ms.
  - Rounds bodyweight `weight_kg` to 3 dp (R8).
  - Always sets `deleted_at: null`, and omits `updated_at`.
  - For `user_settings`, produces `{ user_id, data: SettingsData }`.
- `fromRow<T extends SyncTable>(table: T, row: Tables<T>): { record: SyncRecordMap[T]; deleted: boolean }`.
  - For `user_settings`, merges `data` over `DEFAULT_SETTINGS`.

**`coalesce.ts`** (pure)
- `interface PushOp { table; recordId; op; payload; entryIds: number[]; seq: number }`.
- `coalesce(entries: OutboxEntry[]): PushOp[]`:
  - The latest entry per record wins.
  - Upsert then delete becomes delete. Delete then upsert becomes upsert.
  - Sorted by the max entry id, which keeps FIFO order (R3).
- `batchRuns(ops: PushOp[], max = 100): PushOp[][]` batches only consecutive ops with the same table and op.

**`push.ts`**
- `pushOutbox(client: LiftClient, opts: { now: number; force: boolean }): Promise<{ pushed: number; failed: number; offline: boolean }>`.
- Upserts use `.upsert(rows, { onConflict: 'id' })`, or `'user_id'` for `user_settings`.
- Deletes use `.update({ deleted_at: iso(now) }).in('id', ids)`.
- On ack, calls `removeEntries` with the exact `entryIds` that were sent.
- On a batch error, retries each op on its own to isolate the bad one, then calls `recordFailure`.
- On a fetch TypeError, stops and reports `offline`.

**`pull.ts`**
- `pullTable(client, table, userId, pageSize = 500): Promise<number>`:
  - Filters with `.eq('user_id', uid).or('updated_at.gt."C",and(updated_at.eq."C",id.gt.K)')` and orders by `updated_at, id`. Values are double-quoted, and an integration test must verify this.
  - Calls `applyServerRecords`, then `setCursor` after each page.
  - Loops until a page has fewer than 500 rows.
- `pullAll(client, userId, onProgress?: (t: SyncTable) => void): Promise<number>` pulls in order: exercises, templates, workouts, bodyweight_entries, user_settings.

**`engine.ts`**
- `type SyncReason = 'start'|'visible'|'online'|'write'|'signin'|'manual'`.
- `interface SyncEngine { syncNow(reason: SyncReason): Promise<void>; subscribe(cb: (s: SyncStatus) => void): () => void; getStatus(): SyncStatus }`.
- `createSyncEngine(deps: { client: LiftClient; now: () => number; isOnline: () => boolean }): SyncEngine`.
- `getSyncEngine(): SyncEngine` is a singleton.
- It runs single-flight: a request during a run sets `rerun = true`, and the run is wrapped in `navigator.locks` `'lift-sync'` when available.
- Each run:
  1. Check online. If offline, set status `'offline'` and return.
  2. Call `auth.getSession()`. With no session, set status `'error'`.
  3. Push, then pull. Never run them concurrently.
  4. On the first run, set `initialPullDone`.
  5. Set `lastSyncedAt`.
- The `'manual'` reason implies `force`.

**`triggers.ts`**
- `startSyncTriggers(engine: SyncEngine): () => void` triggers a sync on:
  - start
  - `visibilitychange` to visible
  - `online`
  - an increase in the pending count from `observeOutboxCounts`, debounced 2000 ms
- `offline` only updates the status.

**`store/sync.ts`**
- `useSyncStore` holds `{ status: SyncStatus; syncNow(): Promise<void> }`, plus `useSyncStatus(): SyncStatus`.
- Counts come from `observeOutboxCounts`.

**Scope**
- **In M1:** everything above, with simple backoff where entries are never dropped.
- **Stubbed until later:**
  - Permanent vs retryable error classification. M1 treats every error as retryable, so `failedCount` stays 0, but the field is wired.
  - Retry/Discard UI.
  - 401 special-casing.
  - The stale-outbox warning after 24 h.
  - Retrying 23505 after a pull.
  - Two-device tests (M9).
  - The 5 s push debounce for in-progress workouts (M3).
  - The seeding hook (M2).
  - Data operations (M9).

**Unit tests**
- Coalesce cases.
- FIFO order.
- An entry added during a push survives.
- A failure increments attempts, and backoff skips the entry unless forced.
- Keyset pull over 1200 rows that share one `updated_at`.
- Tombstones.
- Pending-wins.
- The cursor persists.
- Mapper round trips for all 5 tables.

## 1.10 PWA (pwa-engineer; icons by scribe)

**`vite.config.ts`**

```ts
VitePWA({
  registerType: 'prompt',
  injectRegister: null,
  manifest: {
    name: 'Lift', short_name: 'Lift',
    start_url: '/lift/', scope: '/lift/',
    display: 'standalone', orientation: 'portrait',
    theme_color: '#0B0B0F', background_color: '#0B0B0F',
    icons: [/* 192, 512, 512 maskable */],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
    navigateFallback: '/lift/index.html',
    // no runtimeCaching: Supabase responses are never cached
  },
  devOptions: { enabled: false },
})
```

**`index.html`**
- `viewport-fit=cover`.
- `apple-mobile-web-app-capable`, and status-bar-style `black-translucent`.
- A 180px `apple-touch-icon`, plus `theme-color`.
- The pre-paint theme script.

**Icons**
- Go in `public/icons/`, generated by the assets-generator config `pwa-assets.config.ts`.

**`src/pwa/updatePrompt.ts`**
- `useUpdatePrompt(): { visible: boolean; apply(): void; dismiss(): void }`.
- Uses `registerSW` from `virtual:pwa-register`, with `onNeedRefresh` and `onOfflineReady`.
- `visible` is true only when a refresh is needed AND `!isWorkoutActive()`.
- `isWorkoutActive` is module-private and returns false in M1. M3 replaces it.
- Re-checks the registration on `visibilitychange`.
- `apply` calls `updateSW(true)`, and only when the user taps. It never auto-reloads.

**Toast:** `src/components/UpdateToast.tsx`, which uses the Toast from 1.5.

## 1.11 CI/CD (pwa-engineer)

**`.github/workflows/ci.yml`**
- Runs on `pull_request` and on push to `main`.
- **Job `ci`** (its id and name are both `ci`, the required check for P7):
  1. checkout
  2. setup-node with `node-version-file: .nvmrc` and the npm cache
  3. `npm ci`
  4. typecheck, lint, test
  5. build, with placeholder env: `VITE_SUPABASE_URL=http://127.0.0.1:54321` and `VITE_SUPABASE_ANON_KEY=placeholder`
- **Job `integration`** (not required in M1):
  1. `supabase/setup-cli`
  2. `supabase start`
  3. `npm run test:rls`
  4. `npx playwright install --with-deps chromium && npm run e2e`

**`deploy.yml`**
- Runs on push to `main`, plus `workflow_dispatch`.
- Permissions: `contents: read, pages: write, id-token: write`. Concurrency group `pages`.
- **Build:**
  1. `npm ci && npm run build`, with env from the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` secrets.
  2. A guard step that fails if `dist/` contains `service_role` or `sb_secret_`.
  3. `configure-pages@v5`, then `upload-pages-artifact@v3` with `dist`.
- **Deploy:** `deploy-pages@v4`, environment `github-pages`.

## 1.12 QA acceptance (qa-engineer)

**Setup**
- Playwright runs at 390x844 against `vite preview` (base `/lift/`), wrapped by `with-local-supabase.mjs`.
- Global setup signs up the test users with anon `signUp`.

**Tests**
1. **Sign-in gate.** With no session, the sign-in screen shows. A bad password shows an inline error. Good credentials show the shell with 4 tabs.
2. **Offline reopen.** Sign in, call `context.setOffline(true)`, and reload. The shell shows (not the sign-in screen) and the status reads Offline.
3. **Expired token while offline.** Set `expires_at` in `'lift-auth'` to the past, go offline, and reload. The shell still opens.
4. **Settings round trip.** Switch to kg and the light theme.
   - Within about 3 s, a second anon client signed in as the same user reads the `user_settings` row with those values.
   - After a reload, the values persist and the `dark` class is gone.
5. **Account switch.** User A sets kg and signs out. User B signs in and sees the lb defaults, and Dexie holds no rows from A.
6. **Sign-out with pending changes.** Go offline and change a setting. Sign-out is blocked until the user confirms discarding the changes.
7. **Service worker offline load.** Visit once, go offline, open a new page at `/lift/`, and the app loads.
8. **Update toast.** It never auto-reloads. A unit test with a mocked `registerSW` is enough.

**Also**
- An RTL test that toggling the unit re-renders a `formatWeight` sample.
- Check both themes at 390px.
- `npm run test:rls` passes.

## 1.13 scribe

- **README:** dev setup, env, Docker, `test:rls`, migrations, deploy, secrets, and deviations D1–D12.
- **PROGRESS.md:** record decisions D1–D12.

## Order / parallel groups (disjoint dirs)

- **W1, in parallel:**
  - 1.2 (data-engineer): `src/types/domain.ts`, `src/types/sync.ts`, `src/lib/*`, the ESLint config
  - 1.5 (ui-builder): `src/components/ui`, `src/styles`, `tailwind.config.ts`, `src/routes`, `src/App.tsx`
  - 1.6a (supabase-engineer): `supabase/`
  - pwa-engineer: 1.11 (`.github/`), then 1.10a (`vite.config.ts`, `index.html`, `public/icons`, `pwa-assets.config.ts`)
- **W2, in parallel:**
  - 1.3 (data-engineer): `src/db/`
  - supabase-engineer: 1.6b gen types (`src/types/database.ts`, after 1.2 is committed), then 1.7 (`tests/rls`, `scripts/`, `vitest.rls.config.ts`)
  - 1.10b (pwa-engineer): `src/pwa`, `src/components/UpdateToast.tsx`, after 1.5
- **W3, in parallel:**
  - 1.4 (data-engineer): `src/db/repos/settings.ts`, `src/store/settings.ts`, `src/lib/theme.ts`, `src/hooks/`
  - 1.8 (supabase-engineer): `src/lib/supabase.ts`, `src/sync/auth.ts`, `src/store/auth.ts`, `src/App.tsx`. It must wait until 1.5 has finished with `App.tsx`.
- **W4:** 1.9 (supabase-engineer), then 1.5b (ui-builder).
- **W5:** 1.12 (qa-engineer), then 1.13 (scribe), then code-reviewer.

## Risks

- **Offline console errors.** supabase-js may log "Failed to fetch" refresh errors while offline. Verify this, and handle it by stopping and starting auto-refresh on the offline and online events.
- **Commit-order skew.** A transaction with an earlier `now()` that commits after a later one can be missed by the pull cursor. This is rare for a single user. Revisit in M9, using an overlap window or `clock_timestamp`.
- **PostgREST quoting.** The `or()` quoting of ISO timestamps that contain `+` must be proven against the local stack.
