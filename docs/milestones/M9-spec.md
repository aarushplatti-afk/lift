# M9 Spec — Sync hardening and data tools (branch m9-sync-data)

Author: architect. Binding for M9 builders. Earlier decisions still apply: M1 D1–D12, M2 E1–E7, M3 W/U, M4 T, M5 M, M6 H1–H24, M7 P1–P24, M8 B1–B21, and PLAN Q1–Q7. The ones that matter most here:
- **D1:** no local tombstones.
- **D2:** append-only outbox, coalesced at push.
- **D12:** involuntary sign-out keeps the cache.
- **Q2:** delete-all tombstones every row and resets settings.
- **H22:** no PR recompute after pull.

Context: since 2026-11-15 the app is multi-user with open sign-up. Every account is private through owner-only RLS. Delete-all and import affect only the signed-in user's data.

## Scope
In:
- Retry with backoff, error classification, a failed state with Retry/Discard, and a single 401 refresh-and-retry.
- A stale-outbox warning after 24 h, and a richer status indicator.
- A two-device simulation against local Supabase.
- JSON export, zod-validated import with a summary, Import Replace, Delete All and CSV export.
- Storage estimate, `navigator.storage.persist()`, and a blocking quota-exceeded dialog with Export.
- Account & Sync detail and a Data section in Settings.
- Playwright Flow E, delete-all across two devices, the §19.7 offline round trip, and an expired token while offline.

Out:
- Merge import (PRD §5.5 says v1 may ship Replace only).
- Deleting the auth user (PRD §19.5).
- Password reset (moved to M10).
- Backup nudge, "How to install" link, Android install button (M10).
- Realtime.

No migration, no Dexie version bump, no new dependency. zod 4 is already installed and approved; nothing uses it yet, so it is lazy-loaded.

## 0. Decisions (reversible defaults)

- **N1 Error classes.** `classifyError(err, priorAttempts)` returns `'retryable' | 'permanent'`.
  - **Retryable:**
    - network, `TypeError`, timeout
    - 401, 408, 429, 5xx
    - PostgREST `PGRST205`/`PGRST204` (schema not deployed yet)
    - unknown errors (never drop on doubt)
    - `23505` on the first attempt only (priorAttempts 0): it retries once, after the next pull (R3).
  - **Permanent:**
    - `42501`, Postgres classes `22xxx` and `23xxx` (except `23505` on its first attempt)
    - 400, 403, 409, 413, 422.
  - Auth errors (401, `PGRST301`/`PGRST302`/`PGRST303`, or a `/jwt expired/i` message) are detected separately by `isAuthError` (N5).
- **N2 Backoff.** `RETRY_DELAYS_MS = [2000, 5000, 15000, 60000, 120000, 300000]`. `nextDelay(attempts)` uses the post-failure attempt count: 1 gives 2 s, 6 and above give 300 s. No jitter.
  - Offline (`OfflineError`) never counts as an attempt. Entries stay untouched, as today.
- **N3 Failed state.** A permanent error sets `state: 'failed'`, increments `attempts`, and stores `lastError` (human text) and `lastErrorCode`. This fixes the current bug where `recordFailure` never sets the state to `'failed'`.
  - Failed entries are never auto-retried (`listDue` selects due *pending* records).
  - They still block pull overwrite of their record, because `applyServerRecords` counts entries in any state.
  - `SyncStatus.state` is `'error'` while `failedCount > 0`.
- **N4 Superseded failures.** When a record has a due pending entry, `listDue` also returns that record's failed entries. Coalescing absorbs them, so a later successful push removes the stale failure.
  - When a batch fails permanently, it is split into single ops (current behaviour). A retryable batch error records the failure on the whole run and does not split.
- **N5 401 handling.** `withAuthRetry(client, fn)` runs `fn`. On an auth error it calls `client.auth.refreshSession()` once per sync run (5 s timeout), then retries `fn` once.
  - If the refresh fails on the network or times out, the run reports offline.
  - If the refresh is rejected, the run stops and the status becomes `error`, "Session expired. Sign in again to sync." Entries keep their attempt count.
  - The app never forces sign-out (§19.2, D12). An offline cached session still opens the app.
- **N6 Retry timer.** After every loop, the engine schedules `syncNow('retry')` at the earliest pending `nextAttemptAt`, clamped to 1 s–300 s. This only happens when online. Any new run cancels the timer. `SyncReason` gains `'retry'`.
- **N7 Stale outbox.** `observeOutboxCounts` adds `oldestCreatedAt`, the oldest entry in any state (first by `++id`). `SyncStatus.oldestPendingAt` exposes it.
  - `isOutboxStale(oldest, now)` is true when the entry is older than `STALE_OUTBOX_MS = 24 h`.
  - When stale, the header pill gets a warning-colour dot and the label "Not synced". The Settings banner offers Export.
- **N8 Retry and Discard.**
  - **Retry** sets the record's failed entries to `pending` with `nextAttemptAt = now`, then runs `syncNow('manual')`.
  - **Discard** is online only. It fetches the server row by id (`user_id` for settings) first. Then, in one Dexie transaction, it removes all of the record's entries and either applies the server row or deletes the local row if there is no live server row. Copy: "Discard this change? The version on the server will be kept."
  - "Retry all" and "Discard all" appear when there is more than one failed record.
- **N9 Backup format.**
  - Top-level fields: `{ format: 'lift-backup', schemaVersion: 1, exportedAt: ISO, appVersion, userId, exercises, workouts, templates, bodyweight, settings: SettingsData }`.
  - Timestamps are epoch ms and weights are kg, as stored.
  - Records keep `userId` and `updatedAt`, but import ignores both.
  - Only `status: 'completed'` workouts are exported. The active workout and other devices' in-progress workouts are transient.
  - The file is `lift-backup-YYYY-MM-DD.json` (local date), written as `JSON.stringify(b, null, 2)`.
  - Export first runs a sync when online (capped at 10 s); export from the cache goes ahead either way.
- **N10 Cross-account import.** If `backup.userId !== owner`, `remapForUser` derives new ids deterministically:
  - seeded exercises (`!isCustom`) become `seededExerciseId(owner, name)`, so they converge with the new user's seeds
  - custom exercises, workouts and templates become `v5(oldId, userNamespace(owner))`
  - bodyweight becomes `bodyweightId(owner, date)`
  - `exerciseId` and `templateId` references are rewritten; nested block and set ids are kept (they are not primary keys)
  - every `userId` becomes the owner.

  A same-account import keeps every id, which makes the round trip exact.
- **N11 isPR.** Import preserves the stored flags as they are and does not recompute (Flow E: "restored identically"). `false`/`null` is normalised to an absent key (W1). Inconsistent flags in a hand-edited file heal on the next local write touching that exercise (H22).
- **N12 Delete-all transport.** This is a direct server call from `src/sync/dataOps.ts`, not the outbox, so server rows this device never pulled are covered too.
  - For each table in turn (workouts, templates, bodyweight_entries, exercises), it runs `update({ deleted_at: now }).eq('user_id', uid).is('deleted_at', null)`.
  - Then it upserts `user_settings { user_id, data: DEFAULT_SETTINGS }` on `user_id`.
  - Each call goes through `withAuthRetry`. This is safe to repeat.
- **N13 Re-seed after delete-all.** The local clear resets `seedVersion`. The next sync pulls the tombstones (no-ops), and `ensureSeeded` then upserts the same deterministic ids, which revives them with `deleted_at: null`. The result is a fresh account with 98 built-ins and default settings.
- **N14 Both data ops are blocked when:**
  - the device is offline
  - a local workout is active (`activeWorkoutId`). Copy: "Finish or discard your current workout first."
  - for import only: the outbox still has entries after the pre-sync.

  Another device's in-progress workout does not block. It is tombstoned, and its owning device re-pushes it (U5).
- **N15 Exclusivity.** `engine.runExclusive(fn)` waits for the running loop, takes the `lift-sync` lock (in-process fallback), and defers any `syncNow` calls made meanwhile to a single rerun afterwards.
- **N16 Validation strictness.**
  - Unknown keys are stripped. `null` optionals are normalised to absent.
  - Top-level ids use `z.guid()`; nested ids are a string of 1–64 characters.
  - Settings fields are all optional and merged over `DEFAULT_SETTINGS`, so older backups stay valid.
  - The file is rejected if it is over 25 MB, is not JSON, has the wrong `format`, or has `schemaVersion > 1` ("This backup was made by a newer version of Lift.").
- **N17 Download.** On iOS standalone (`navigator.standalone === true`) with `navigator.canShare({ files })`, use `navigator.share({ files })` so the user can "Save to Files". Otherwise use an anchor `download` on a Blob URL. An `AbortError` from share means cancelled, with no toast.
- **N18 Persistent storage.** After every successful finish, call `persist()` if `persisted()` is false (cheap and idempotent). Settings → About shows the status and a "Keep data on this device" button. Nothing extra is stored.
- **N19 Quota.** `isQuotaError` matches the name `QuotaExceededError` (directly or via a Dexie `inner`), code 22, and `NS_ERROR_DOM_QUOTA_REACHED`.
  - `runWrite` and `saveActiveWorkout` call `reportStorageError(err)` and then rethrow.
  - `importReplace` maps quota errors to `storage_full`.
  - App subscribes and shows the blocking `QuotaDialog`.
  - A global `unhandledrejection` listener is the safety net.
- **N20 CSV** is described in section 4. Text cells starting with `= + - @ \t \r` are prefixed with `'` (formula-injection guard).
- **N21 Copy and confirmation.** Delete-all needs the exact, case-sensitive text `DELETE`. Import needs a summary sheet followed by a confirm dialog.
- **N22 Bundle.** `src/lib/backup.ts` (zod) and `src/lib/csv.ts` are loaded with dynamic `import()` from the Data section. The entry chunk grows by 5 kB gz or less.

## 1. Contracts

### `src/types/sync.ts` (edit)
```ts
// OutboxEntry base: add  lastErrorCode?: string;
export interface SyncStatus {
  state: 'synced' | 'syncing' | 'offline' | 'error';
  pendingCount: number; failedCount: number;
  lastSyncedAt?: number; lastError?: string;
  oldestPendingAt?: number;            // N7
}
```

### `src/lib/syncStatus.ts` (new, pure)
```ts
export const STALE_OUTBOX_MS = 86_400_000;
export function isOutboxStale(oldestPendingAt: number | undefined, now: number): boolean;
```

### `src/sync/retry.ts` (new)
```ts
export const RETRY_DELAYS_MS: readonly number[];
export class SyncRequestError extends Error { readonly status?: number; readonly code?: string }
export function classifyError(err: unknown, priorAttempts: number): 'retryable' | 'permanent';
export function isAuthError(err: unknown): boolean;
export function nextDelay(attempts: number): number;
export function describeSyncError(err: unknown): string; // "Duplicate name", "Not allowed by the server", "Value out of range", fallback message
```

### `src/sync/authRetry.ts` (new)
```ts
export class AuthExpiredError extends Error {}
export function createAuthRetry(client: LiftClient): <T>(fn: () => Promise<T>) => Promise<T>; // one refresh per instance (one per sync run)
```

### `src/sync/coalesce.ts` (edit)
`PushOp` gains `attempts: number`, the maximum over its entries.

### `src/sync/push.ts` (edit)
```ts
export function pushOutbox(client: LiftClient, opts: { now: number; force: boolean; authRetry: <T>(fn: () => Promise<T>) => Promise<T> }):
  Promise<{ pushed: number; failed: number; offline: boolean; authExpired: boolean }>;
```
`sendRun` throws `SyncRequestError` carrying `status` and `code`.

### `src/db/repos/outbox.ts` (edit)
```ts
export type FailureOutcome = { kind: 'retryable'; nextAttemptAt: (attempts: number) => number } | { kind: 'permanent' };
export function recordFailure(ids: number[], error: string, code: string | undefined, outcome: FailureOutcome): Promise<void>;
export function listDue(now: number, force: boolean): Promise<OutboxEntry[]>;           // N4
export function observeOutboxCounts(): Observable<{ pending: number; failed: number; oldestCreatedAt?: number }>;
export function nextDueAt(): Promise<number | undefined>;
export interface FailedChange { table: SyncTable; recordId: string; op: 'upsert' | 'delete'; entryIds: number[];
  attempts: number; lastError: string; firstCreatedAt: number; recordName?: string; recordDate?: number | string }
export function listFailedChanges(): Promise<FailedChange[]>;   // joins local name/date for labels
export function retryFailed(table?: SyncTable, recordId?: string): Promise<number>;
```

### `src/db/repos/syncApply.ts` (edit)
```ts
export function discardAndApply<T extends SyncTable>(table: T, recordId: string,
  item: { record: SyncRecordMap[T]; deleted: boolean } | null, userId: string): Promise<void>;
```

### `src/sync/engine.ts` (edit)
```ts
export type SyncReason = 'start' | 'visible' | 'online' | 'offline' | 'write' | 'signin' | 'manual' | 'retry';
export interface SyncEngine {
  syncNow(reason: SyncReason): Promise<void>;
  subscribe(cb: (s: SyncStatus) => void): () => void;
  getStatus(): SyncStatus;
  runExclusive<T>(fn: () => Promise<T>): Promise<T>;   // N15
}
// EngineDeps adds: setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void;
```

### `src/sync/failed.ts` (new)
```ts
export function discardFailedChange(client: LiftClient, table: SyncTable, recordId: string): Promise<{ ok: boolean }>;
```

### `src/store/sync.ts` (edit)
Adds the actions `retryFailed(table?, recordId?)`, `discardFailed(table, recordId)` and `discardAllFailed()`.

### `src/lib/backup.ts` (new, pure; zod)
```ts
export const BACKUP_FORMAT = 'lift-backup'; export const BACKUP_SCHEMA_VERSION = 1; export const BACKUP_MAX_BYTES = 25 * 1024 * 1024;
export interface BackupData { exercises: Exercise[]; workouts: Workout[]; templates: Template[]; bodyweight: BodyweightEntry[]; settings: SettingsData }
export interface LiftBackup extends BackupData { format: 'lift-backup'; schemaVersion: 1; exportedAt: string; appVersion: string; userId: string }
export const backupSchema: z.ZodType<LiftBackup>;
export interface BackupCounts { exercises: number; customExercises: number; workouts: number; templates: number; bodyweight: number }
export interface BackupSummary extends BackupCounts { exportedAt: string; fromOtherAccount: boolean }
export type ParseResult = { ok: true; backup: LiftBackup } | { ok: false; error: string; issues: string[] }; // issues ≤ 5, "workouts[3].exercises[0].sets[2].reps: …"
export function buildBackup(data: BackupData, meta: { userId: string; exportedAt: number; appVersion: string }): LiftBackup;
export function parseBackup(text: string): ParseResult;
export function summarizeBackup(b: LiftBackup, ownerId: string): BackupSummary;
export function remapForUser(b: LiftBackup, ownerId: string): LiftBackup;   // N10; identity when same user
export function backupFileName(now: number): string;
```
Cross-field checks are done with `superRefine`:
- ids unique per collection
- every `exerciseId` in workouts and templates exists in `exercises`
- non-archived exercise names unique by `nameKey`
- bodyweight dates unique, `isLocalDateString`, `validateBodyweightKg(round3)` passes, note no longer than `BW_NOTE_MAX`
- workouts completed with `endedAt ≥ startedAt`; reps, durationSec and order are non-negative integers; weightKg is finite and between 0 and 10000
- name and notes lengths within `NAME_MAX` and `NOTES_MAX`
- enum values valid
- settings pass the same rules as `sanitizeSettings`.

### `src/lib/csv.ts` (new, pure)
```ts
export const CSV_COLUMNS = ['date','workout','exercise','set_order','set_type','weight','reps','notes','unit','duration_sec'] as const;
export function toCsv(workouts: readonly Workout[], exercises: ReadonlyMap<string, Exercise>, unit: Unit): string;
export function csvFileName(now: number): string;  // lift-workouts-YYYY-MM-DD.csv
```

### `src/db/repos/settings.ts` (edit)
Export `sanitizeSettings(data: SettingsData): SettingsData`, which is the existing `sanitize` renamed.

### `src/db/repos/dataOps.ts` (new)
```ts
export class DataOpBlockedError extends Error { constructor(readonly reason: 'active_workout' | 'unsynced_changes') }
export function readSnapshot(): Promise<BackupData & { userId: string }>;       // one read tx; completed workouts only
export function replaceAllLocal(b: LiftBackup, userId: string, now: number): Promise<BackupCounts & { deleted: number }>;
export function assertNoActiveWorkout(): Promise<void>;
export function clearUserDataLocal(userId: string): Promise<void>;
```
`replaceAllLocal` runs as one rw transaction over exercises, workouts, templates, bodyweight, settings, syncQueue and meta:
1. `assertOwner`.
2. Throw if there is an active workout or if `syncQueue.count() > 0`.
3. Delete and enqueue `delete` for every local id missing from the backup, in the order workouts, templates, bodyweight, exercises.
4. Put and enqueue `upsert` with `updatedAt = now` for exercises, then templates, workouts and bodyweight.
5. Put the settings `sanitizeSettings({...DEFAULT_SETTINGS, ...b.settings})` and enqueue them.

`clearUserDataLocal` runs as one rw transaction:
1. `assertOwner`.
2. Clear exercises, workouts, templates, bodyweight, settings, syncQueue and syncState.
3. Delete the meta keys `seedVersion`, `activeWorkoutId` and `restTimer`.
4. Keep `ownerUserId`, `ownerEmail` and `initialPullDone`.

### `src/sync/dataOps.ts` (new)
```ts
export type DataOpError = 'offline' | 'active_workout' | 'unsynced_changes' | 'sync_failed' | 'not_signed_in'
  | 'storage_full' | 'server_error' | 'confirm_mismatch';
export type DataOpResult<T> = ({ ok: true } & T) | { ok: false; error: DataOpError; message: string };
export interface DataOps {
  exportBackup(): Promise<{ backup: LiftBackup; synced: boolean }>;
  exportCsv(): Promise<string>;
  importReplace(backup: LiftBackup): Promise<DataOpResult<{ counts: BackupCounts; failed: number; pending: number }>>;
  deleteAllData(confirmText: string): Promise<DataOpResult<{ failed: number }>>;
}
export function createDataOps(deps: { client: LiftClient; engine: SyncEngine; isOnline: () => boolean; now: () => number }): DataOps;
export function getDataOps(): DataOps;
```

### Platform (new)
```ts
// src/lib/platform/storage.ts
export interface StorageInfo { usageBytes?: number; quotaBytes?: number; persisted?: boolean; canPersist: boolean }
export function getStorageInfo(): Promise<StorageInfo>;
export function requestPersistentStorage(): Promise<boolean | undefined>;  // undefined = unsupported
export function isQuotaError(err: unknown): boolean;
export function formatBytes(n: number): string;                             // "2.3 MB"
// src/lib/platform/download.ts
export function saveTextFile(name: string, mime: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'>;
// src/lib/storageEvents.ts
export function reportStorageError(err: unknown): void;
export function onQuotaExceeded(cb: () => void): () => void;
```

### UI (new or edit)
- New, under `src/routes/Settings/`: `AccountSyncSection.tsx`, `FailedChangesList.tsx`, `StaleSyncBanner.tsx`, `DataSection.tsx`, `ImportSheet.tsx`, `DeleteAllDialog.tsx` and `StorageRows.tsx`.
- New: `src/components/QuotaDialog.tsx`.
- Edit: `src/routes/SettingsPage.tsx`, `src/components/SyncIndicator.tsx` and `src/App.tsx` (mount QuotaDialog).

## 2. Data-loss rules (must hold; each has a test)

**Import**
1. **Validate before any write.** `parseBackup`, `remapForUser` and every precondition finish before the transaction opens. On any failure nothing changes, not even meta.
2. **Order.**
   1. Online check.
   2. Active-workout check.
   3. `syncNow('manual')`.
   4. Abort with `unsynced_changes` if `countOutbox() > 0` (including failed): "Sync or discard pending changes in Account & Sync, then try again."
   5. Inside `runExclusive`: `replaceAllLocal`, which re-checks both preconditions inside the transaction.
   6. `syncNow('manual')`.
   7. Report `failed` and `pending`.
3. **Atomic local swap.** If the transaction throws (quota, owner changed, blocked), Dexie rolls back and the result is `storage_full`, `sync_failed` or `unsynced_changes`.
4. **FIFO.** All deletes are enqueued before all upserts, so a replaced exercise's name is free on the server before the new row arrives (`exercises_user_name_uniq`). Bodyweight ids are per date, so they upsert in place.
5. **Partial push.** Local data already holds the imported state. Retryable failures back off. Permanent failures surface as failed changes. Nothing is dropped. If the app is killed after the transaction, the outbox survives and pushes on the next start.

**Delete all**

6. **Order.**
   1. `confirmText === 'DELETE'`.
   2. Online check.
   3. No active workout.
   4. Inside `runExclusive`: the server tombstones (N12), then `clearUserDataLocal`.
   5. After the lock is released: `syncNow('manual')`, which re-seeds (N13).
7. **Server failure part-way** returns `server_error` ("Couldn't delete everything. Check your connection and try again."). The local cache and outbox stay untouched. Retrying is idempotent. Tombstones that already landed apply on the next pull, which is consistent with the user's intent.
8. **Outbox.** Pending and failed entries are discarded on purpose; they belong to the data being deleted. The lock blocks concurrent pushes.
9. **Other devices** apply the tombstones on their next pull.
   - Entries they had not pushed yet win (local-pending-wins) and reappear.
   - Their active workout is re-pushed (U5).
   - Their seeds re-seed to the same ids.

   The confirm dialog states this.

**Sync**

10. A permanent failure is never auto-dropped. Only an explicit Discard removes it, and the server version is applied in the same transaction.
11. A 401 never marks entries failed and never signs the user out. Being offline with an expired token opens the app from the cache.

## 3. Acceptance requirements

### Sync hardening (9.1 and 9.2)
1. `nextDelay` returns 2000, 5000, 15000, 60000, 120000, 300000 and 300000 for attempts 1 through 7.
2. `classifyError` follows N1:
   - 503, 429, TypeError and an unknown error are retryable
   - 42501, 23514, 22P02, 400 and 413 are permanent
   - 23505 is retryable at priorAttempts 0 and permanent at 1
   - `PGRST205` is retryable.
3. A retryable server error increments `attempts`, sets `nextAttemptAt = now + nextDelay`, and the entry is not sent again before that time unless forced.
4. A permanent error sets `state: 'failed'`, `lastError` and `lastErrorCode`. Later non-forced and forced runs skip it.
5. Inside a batch of 3 where one op is permanent, the batch splits, 2 rows land, and 1 entry is failed. A batch hitting a 5xx is not split and all 3 entries back off.
6. A failed entry plus a newer pending edit of the same record: after a successful push, no outbox entries remain for that record (N4).
7. Retry flips an entry to pending and pushes it. Discard while online applies the server row (or deletes the local row) and removes the entries in one transaction. Discard is disabled offline.
8. A push hitting a 401 refreshes once and retries with a 200, with no attempts added. If the refresh is rejected, the status is error "Session expired. Sign in again to sync.", entries are unchanged, and the user is not signed out.
9. The retry timer fires `syncNow('retry')` at the earliest `nextAttemptAt`, clamped to 1–300 s. It is cancelled by a new run and not scheduled while offline.
10. `oldestPendingAt` tracks the oldest entry. `isOutboxStale` is true at 24 h + 1 ms and false at 24 h.
11. Replaying the same upsert twice (ack lost) yields one server row.
12. Two-device simulation against local Supabase, two Dexie instances, one user:
    - concurrent seeding converges with no duplicates
    - edits converge
    - local-pending-wins holds through a pull
    - a same-date bodyweight entry gives one row
    - import on A converges on B
    - delete-all on A leaves B with only built-ins after sync, and B's unsynced entry reappears on the server (documents rule 9).
13. RLS: user B's bulk `update deleted_at … eq('user_id', A)` affects 0 rows. User A's bulk tombstone affects only A's rows.

### Backup, import and CSV (9.3 and 9.4)
14. `buildBackup(readSnapshot())` then `parseBackup(JSON)` gives `ok` and deep-equals the input.
15. Malformed fixtures are rejected with a message and no write happens:
    - not JSON
    - wrong format
    - schemaVersion 2
    - over 25 MB
    - duplicate id
    - missing exercise reference
    - duplicate live name
    - bad date
    - weight 700
    - reps -1
    - endedAt < startedAt
    - in_progress workout
    - bad enum
    - goal 700.
16. Null optionals, `isPR: false` and unknown keys are normalised away. A backup missing `soundEnabled` gets the default.
17. `remapForUser` with the same user is the identity. With another user it is deterministic (twice gives the same output), seeded exercises map to `seededExerciseId(owner, name)`, every reference is rewritten, and nested ids are unchanged.
18. `replaceAllLocal`:
    - local equals the backup with `updatedAt = now`
    - the outbox holds deletes for removed ids (FIFO before all upserts), one upsert per imported row, and one settings upsert
    - it throws `DataOpBlockedError` for an active workout or a non-empty outbox
    - a quota error mid-transaction leaves Dexie and the outbox exactly as before.
19. `importReplace` returns `offline`, `active_workout` or `unsynced_changes` without writing. When the server rejects a row, the import still succeeds with `failed ≥ 1`.
20. Flow E round trip: export, then Delete all, then import, then Replace. Every exercise, completed workout (including `isPR`), template, bodyweight entry and setting deep-equals the pre-export state, ignoring `updatedAt`. The server rows match as well.
21. Cross-account import (A's file into B) shows all data under B with B's ids. A's rows are untouched.
22. `deleteAllData`:
    - `'delete'` returns `confirm_mismatch`
    - offline or an active workout blocks it
    - on success every server workout, template, bodyweight and custom exercise row has `deleted_at` set, the built-ins are live again (98), `user_settings.data` equals the defaults, and the local outbox is empty
    - a server failure on the third table leaves local data and the outbox untouched.
23. CSV:
    - header equals `CSV_COLUMNS`
    - completed sets of completed workouts only, chronological, then block order, then set order
    - `set_order` is 1-based per block
    - weight is a display value (135 lb shows "135")
    - bodyweight_reps leaves weight blank
    - RFC 4180 quoting, CRLF line endings, UTF-8 BOM
    - formula guard applied.

### Storage and UI (9.5)
24. Settings section order: Units, Appearance, Workout, Bodyweight, Account & Sync, Data, About (section 5).
25. Export writes `lift-backup-YYYY-MM-DD.json` via N17. CSV writes `lift-workouts-YYYY-MM-DD.csv`.
26. Picking an invalid file shows an inline error. A valid file shows a summary sheet:
    - "12 workouts · 98 exercises (3 custom) · 2 templates · 40 weigh-ins · settings"
    - "Exported Nov 15, 2026"
    - "From a different account" when that applies.

    "Replace all data" is disabled offline, with the note "Connect to the internet to import." Confirming opens a second dialog.
27. Delete all is a two-step dialog. The final button stays disabled until the input equals `DELETE`, and the whole flow is disabled offline. Success shows the toast "All data deleted" and the theme resets.
28. The failed changes list shows a label, the error and Retry/Discard per record, plus Retry all/Discard all when there is more than one.
29. The stale banner and the header "Not synced" appear only when stale. They have an aria label.
30. About shows the storage line "Using 2.3 MB of 1.2 GB" when supported, plus the persistence status and button (N18).
31. A quota error in any repo write or the active-workout autosave opens a blocking `QuotaDialog` with "Export backup" and "Close".
32. Everything works at 390 px in dark and light themes. Inputs are at least 16 px. The entry chunk grows by 5 kB gz or less.

## 4. CSV columns
`date,workout,exercise,set_order,set_type,weight,reps,notes,unit,duration_sec`. These are the PRD columns in PRD order, with `unit` and `duration_sec` appended.

| Column | Contents |
|---|---|
| `date` | Local `YYYY-MM-DD HH:mm` of `startedAt` |
| `workout` | Workout name |
| `exercise` | Exercise name, or "Unknown exercise" if missing |
| `set_order` | 1-based position in the block |
| `set_type` | normal, warmup, drop or failure |
| `weight` | `toDisplay(kg, unit)` rounded to 0.1 with no grouping; added weight for weighted_bodyweight; blank if absent |
| `reps` | Integer, or blank |
| `notes` | Exercise-block notes, repeated on each row of the block |
| `unit` | lb or kg |
| `duration_sec` | Integer, or blank |

## 5. Settings layout (390 px)
```
Units | Appearance | Workout | Bodyweight            (unchanged)
ACCOUNT & SYNC
  [warning banner if stale] "Some changes haven't synced for {distance}. Stay online with the app open, or export a backup." [Export backup]
  Signed in as   a@b.com
  Status         Synced / Syncing… / Offline / Sync error   (+ role=alert lastError)
  Pending changes  N
  Failed changes   N            (only if > 0) → FailedChangesList rows: "{Workout · Push Day · Thu, Nov 12}" / error / [Retry] [Discard]; [Retry all] [Discard all]
  Last synced    5 minutes ago
  [Sync now]  [Sign out]        (existing unsynced-changes dialog; body adds "including N rejected" when failed > 0)
DATA
  [Export data]          "A JSON file with all workouts, exercises, templates, weigh-ins and settings."
  [Export workouts as CSV]
  [Import data]          hidden <input type=file accept=".json,application/json"> → ImportSheet (BottomSheet) → confirm Dialog "Replace all data?" ("Everything in this account is replaced by the backup, on all your devices.") [Replace all data](danger) [Cancel]
  [Delete all data](danger) → Dialog 1 "Delete all data?" (lists what goes; notes other devices clear on next sync and unsynced changes there may reappear; built-in exercises come back) [Continue] → Dialog 2 TextInput "Type DELETE to confirm" [Delete everything](danger, disabled until match)
  Buttons show "Working…" and the rest of the section is disabled while an operation runs. Import and Delete are disabled offline with a caption.
ABOUT
  App · Version · Storage "Using X of Y" · "Persistent storage: On | Not enabled" [+ note + "Keep data on this device"]
```
Result toasts:
- "Backup exported"
- "Backup imported"
- "Imported. {n} changes couldn't sync yet. See Account & Sync."
- "All data deleted"
- errors use the message from `DataOpResult`.

## 6. Tasks

| # | Task | Agent | Files | Depends |
|---|---|---|---|---|
| 9.1a | Retry and classification, auth-retry helper, push with failed state, outbox changes, status types, stale helper, plus unit tests (req. 1–6, 8, 10–11 at the fake-client level) | supabase-engineer | `src/sync/{retry,authRetry,push,coalesce}.ts`, `src/db/repos/outbox.ts`, `src/types/sync.ts`, `src/lib/syncStatus.ts`, `src/sync/__tests__/{retry,push,coalesce}.test.ts`, `src/db/__tests__/outbox.test.ts`, `src/sync/__tests__/fakeClient.ts` | — |
| 9.3a | Backup schema, parse, build, summary and remap; CSV; malformed fixtures; tests (req. 14–17, 23) | data-engineer | `src/lib/backup.ts`, `src/lib/csv.ts`, `src/lib/__tests__/{backup,csv}.test.ts`, `src/test/fixtures/backups/*` | — (parallel with 9.1a) |
| 9.1b | Engine: authRetry per run, retry timer, failed/stale status, `runExclusive`; pull through authRetry; Discard plus `discardAndApply`; store actions; tests (req. 7–9) | supabase-engineer | `src/sync/{engine,pull,failed}.ts`, `src/db/repos/syncApply.ts`, `src/store/sync.ts`, `src/sync/__tests__/{engine,pull,failed}.test.ts`, `src/db/__tests__/syncApply.test.ts` | 9.1a |
| 9.3b | Local data-op repo (`readSnapshot`, `replaceAllLocal`, `clearUserDataLocal`, `assertNoActiveWorkout`), `sanitizeSettings` export; tests (req. 18) | data-engineer | `src/db/repos/dataOps.ts`, `src/db/repos/settings.ts`, `src/db/__tests__/dataOps.test.ts` | 9.3a (parallel with 9.1b) |
| 9.5a | Storage, download and storageEvents helpers; quota reporting in `runWrite` and `saveActiveWorkout`; persist request after finish; tests | pwa-engineer | `src/lib/platform/{storage,download}.ts`, `src/lib/storageEvents.ts`, `src/db/repos/outbox.ts` (runWrite catch only), `src/db/repos/workouts.ts` (saveActiveWorkout only), `src/store/activeWorkout.ts` (finish hook only), `src/lib/platform/__tests__/*` | 9.1a (parallel with 9.1b and 9.3b) |
| 9.4 | `src/sync/dataOps.ts` (export, CSV, importReplace, deleteAllData); sign-out failed-count wording support; RLS bulk-tombstone tests; unit tests (req. 19, 22, 13) | supabase-engineer | `src/sync/dataOps.ts`, `src/sync/auth.ts`, `src/sync/__tests__/dataOps.test.ts`, `tests/rls/dataops.test.ts` | 9.1b, 9.3b |
| 9.2 | Two-device simulation against the local stack (req. 12, plus 11 live); include `tests/sync` in the RLS config; ESLint override for `tests/sync` (supabase-js and dynamic dexie) | supabase-engineer | `tests/sync/two-device.test.ts`, `vitest.rls.config.ts`, `eslint.config.js` | 9.4 |
| 9.5b | Settings UI (section 5), SyncIndicator stale state, QuotaDialog plus App mount, lazy-loaded backup and CSV; RTL tests (req. 24–31) | ui-builder | `src/routes/SettingsPage.tsx`, `src/routes/Settings/{AccountSyncSection,FailedChangesList,StaleSyncBanner,DataSection,ImportSheet,DeleteAllDialog,StorageRows}.tsx`, `src/routes/Settings/__tests__/*`, `src/components/{SyncIndicator,QuotaDialog}.tsx`, `src/components/__tests__/SyncIndicator.test.tsx`, `src/App.tsx` | 9.4, 9.5a (parallel with 9.2) |
| 9.6 | E2E tests and new helpers (listed below) | qa-engineer | `e2e/auth/{flow-e,delete-all,offline-sync}.spec.ts`, `e2e/auth/helpers.ts` | 9.5b, 9.2 |
| 9.7 | Review focused on data-loss paths, then PROGRESS and PR | code-reviewer, scribe | `docs/PROGRESS.md` | 9.6 |

Parallel waves, with no shared files inside a wave:
- {9.1a, 9.3a}
- {9.1b, 9.3b, 9.5a}. 9.5a's `outbox.ts` edit is limited to the `runWrite` catch, and 9.1a has finished by then.
- {9.4}
- {9.2, 9.5b}
- {9.6}

Task 9.6 covers these e2e scenarios:
- Flow E (req. 20, including PR badges and settings kg/light).
- Cross-account import (req. 21).
- Delete-all on two contexts (req. 22, rule 9).
- §19.7 offline: a full workout and a weigh-in offline, then online, then the remote rows are checked.
- An expired token while offline: tamper `expires_at` in `localStorage['lift-auth']`, go offline, reload, and the app opens; going online then syncs.
- 401 refresh online.
- Account switch: re-run `e2e/auth/account.spec.ts`.

## 7. Risks
- **R-a** iOS standalone file save via the share sheet needs checking on the owner's phone. The anchor fallback may open a preview instead.
- **R-b** Large imports (more than 2000 workouts) push 100-row jsonb batches. Watch the PostgREST body size; drop the batch to 50 for workouts if a 413 shows up.
- **R-c** Changes made on other devices that had not synced yet reappear after delete-all or import (rule 9). This is accepted and stated in the UI.
- **R-d** A partial server delete-all is visible on other devices until the user retries (rule 7).
- **R-e** `navigator.locks` is missing in jsdom, so tests rely on the in-process fallback in `runExclusive`.
