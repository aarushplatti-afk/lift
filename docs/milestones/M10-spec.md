# M10 Spec — Hardening (branch m10-hardening)

Author: architect. Binding for M10 builders. Earlier decisions still apply (M1 D1–D12, M2 E1–E7, M3 W/U, M4 T, M5 M, M6 H, M7 P, M8 B, M9 N1–N22, PLAN Q1–Q7). Most relevant: D5 (only `src/lib/supabase.ts` and `src/sync/**` import supabase-js), D7 (only the main session changes dependencies), D11 (settings defaults are not persisted), D12 (involuntary sign-out keeps the cache), N12/N13 (delete-all resets settings, then re-seeds).

Context: the app is multi-user with open sign-up; every account is private via owner-only RLS.

Questions Q1–Q8 (section 8) were resolved by the main session with the proposed defaults, under the owner's standing autonomy grant; they are reported to the owner at the M10 check-in.

## Scope
In: password reset (deferred from M9); welcome sheet (units, bodyweight, install help, starter PPL templates); Android install button + "How to install" sheet in About; 30-day backup nudge; accessibility pass; iOS keyboard handling; bundle budget gate in CI; correct app version in About, bumped to 1.0.0; app-level error boundary (§8.7); full e2e in CI with a no-console-errors guard; README and manual device checklist; §17 audit.

Out (post-v1, Q4): multi-tab active-workout warning (§11 P1), >6 h end-time prompt (§11 P1), History search/filter, merge import, change password while signed in, delete account.

Not needed: a migration (`onboardedAt` lives in `user_settings.data` jsonb), a Dexie version bump (new meta keys are type-only), any new dependency, remote approval.

## 0. Decisions

### Password reset
- **R1 Flow.** Sign-in → "Forgot password?" → `requestPasswordReset(email)` calls `auth.resetPasswordForEmail(email, { redirectTo: origin + pathname })`. Implicit flow, so the link lands on `…/lift/#access_token=…&refresh_token=…&type=recovery`. On iOS the link opens in Safari, not the installed app (accepted by PRD §19.2).
- **R2 Capture before render.** `src/lib/authRedirect.ts` (pure, no supabase import) replaces `stripAuthRedirectHash`. `captureAuthRedirect()` runs first in `main.tsx`: parses `location.hash` when it starts with `#` but not `#/` and contains `access_token`, `error` or `error_code`; stores the result in a module slot; calls `history.replaceState(null, '', pathname + search + '#/')` so tokens leave the URL and history before HashRouter mounts. Tokens are memory-only, never persisted or logged.
- **R3 Isolated recovery session.** Recovery tokens go to a separate client from `createRecoveryClient()`: `persistSession: false`, `autoRefreshToken: false`, `detectSessionInUrl: false`, `storageKey: 'lift-recovery'`, in-memory storage object. The persisted `lift-auth` session, Dexie cache and outbox are never touched (a recovery link for another account must not wipe this account's unsynced cache).
- **R4 No auto sign-in after reset.** `beginPasswordReset(tokens)` calls `setSession` on the recovery client and returns the email. `completePasswordReset(pw)` calls `updateUser({ password })`, then `signOut({ scope: 'local' })` on the recovery client (errors ignored). The user then signs in normally, email prefilled. In iOS Safari (not standalone) the success screen adds: "If you use Lift from your Home Screen, open it there and sign in with your new password."
- **R5 Other redirects** show a toast once, then clear the slot:
  - `#error…` (expired/used link): "This link is invalid or has expired. Request a new one from the sign-in screen."
  - Signup confirmation (`type=signup`/`email` with tokens): "Email confirmed. Sign in to continue." Session is not adopted (current behaviour).
- **R6 Copy.** The request never reveals whether an account exists. Success: "If an account exists for {email}, we sent a reset link. Open it, set a new password, then sign in here." Errors: offline → "You appear to be offline…"; `over_email_send_rate_limit`/`over_request_rate_limit` → "Too many reset emails. Wait a few minutes and try again."; else generic. New-password errors: < `PASSWORD_MIN_LENGTH` client-side; `same_password` → "Choose a password different from your current one."; `weak_password` → existing copy; invalid session → `invalid_link`.
- **R7 StrictMode safety.** `getAuthRedirect()` does not clear the slot; `clearAuthRedirect()` is called after handling.

### Onboarding
- **O1 Flag.** `SettingsData.onboardedAt?: number` (epoch ms) in synced `user_settings.data`. No migration (mappers spread `row.data` over defaults). Shown once per account across devices; `initialPullDone` gates the app so a second device pulls the flag first.
- **O2 Show condition** (pure `shouldShowOnboarding`): settings hydrated AND `onboardedAt === undefined` AND zero workouts (any status), zero templates, zero bodyweight entries in Dexie. Existing accounts with data never see it; existing empty accounts see it once (Q8).
- **O3 Data ops keep the flag.** Delete-all: server upsert writes `{ ...DEFAULT_SETTINGS, onboardedAt: current ?? now }`; `clearUserDataLocal` re-puts local settings `{ ...DEFAULT_SETTINGS, onboardedAt }` with no enqueue. Import sets `onboardedAt = current ?? backup ?? now`. Flow E equality holds.
- **O4 Sheet.** "Welcome to Lift", lazy-loaded, skippable. Units SegmentedControl (default current unit). Current bodyweight (optional) NumberInput in chosen unit, `,` normalisation, validated with `validateBodyweightKg`; invalid → inline error, blocks "Get started". Checkbox "Add Push, Pull and Leg Day templates", checked by default (Q7). Add to Home Screen (hidden when standalone): iOS "Tap Share, then Add to Home Screen"; Android with captured prompt → "Install app" button; otherwise browser-menu text. Buttons: "Get started" → `completeOnboarding`; "Skip" → `skipOnboarding`; Escape/backdrop = Skip.
- **O5 Write order** in `completeOnboarding`: 1) starter templates, 2) bodyweight `upsertForDate(todayLocal(now), kg)`, 3) `updateSettings({ unit, onboardedAt: now })` last. All via `runWrite`. A throw before step 3 leaves the sheet open with toast "Couldn't save. Try again."
- **O6 Starter templates.** Deterministic ids `starterTemplateId(userId, key) = v5('starter-template:' + key, userNamespace(userId))`. Exercises resolved by `nameKey` against live non-archived local exercises; missing skipped; template with none resolved skipped; template whose id already exists locally skipped. Targets reps only, normal sets, default rest. Templates empty state gets an "Add starter templates" button.

| Key | Name | Exercises (sets × target reps) |
|---|---|---|
| push | Push Day | Barbell Bench Press 3×8, Overhead Press (Barbell) 3×8, Incline Dumbbell Press 3×10, Lateral Raise 3×12, Tricep Pushdown (Cable) 3×12 |
| pull | Pull Day | Deadlift 3×5, Lat Pulldown 3×10, Barbell Row 3×8, Face Pull 3×15, Barbell Curl 3×10, Hammer Curl 3×12 |
| legs | Leg Day | Back Squat 3×8, Romanian Deadlift 3×10, Leg Press 3×10, Lying Leg Curl 3×12, Standing Calf Raise 3×15 |

All names exist in `seedData.ts`.

### Install and backup nudge
- **I1 Install prompt.** `initInstallPrompt()` runs in `main.tsx` before render: captures `beforeinstallprompt` (preventDefault, store event), clears on `appinstalled`. Platform: `standalone` (`display-mode: standalone` or `navigator.standalone`), `ios` (iPhone/iPad/iPod or MacIntel with touch), `android` (Android UA or captured prompt), `other`. Settings → About shows "Install app" only when a prompt was captured, plus a "How to install" row opening `InstallHelpSheet` (§5.5, §5.7).
- **I2 Backup nudge (P1).** Per-device Dexie meta: `lastBackupAt`, `backupNudgeDismissedAt`, `backupTrackingSince`. `ensureBackupTracking(now)` on Workout home mount writes only if missing. Shows when ≥1 workout, no active workout, and `now − max(lastBackupAt, dismissedAt, trackingSince) ≥ 30 d`. Card on Workout home: "It's been 30 days since your last backup." [Export backup] [Not now] (Not now snoozes 30 d). `useBackupExport` calls `markBackupExported` on `'shared' | 'downloaded'`. Sign-out (`wipeLocalData`) resets the meta; `clearUserDataLocal` keeps it.

### Accessibility, performance, rest
- **A1 Contrast (light theme `tokens.css`).** accent `37 99 235` (#2563EB) with on-accent `255 255 255` (deviation from PRD "same accent", Q1); warning `146 90 0`; success `21 122 48`; pr-gold `138 100 0`. Dark unchanged. A test computes WCAG ratios from `tokens.css`: every text token (primary, secondary, accent, danger, success, warning, pr-gold) ≥ 4.5 on bg, surface, surface-2 in both themes; on-accent on accent ≥ 4.5.
- **A2 Text scaling.** `html` font-size `100%`; tailwind `fontSize` tokens to rem (12/14/16/18/24/32 px → 0.75/0.875/1/1.125/1.5/2 rem, matching line-heights); inputs/selects/textareas `font-size: max(16px, 1rem)`. Verify at `html { font-size: 130% }` on 390 px: no horizontal overflow, no clipped primary actions.
- **A3 Motion.** Global `@media (prefers-reduced-motion: reduce)` sets animation/transition durations to 0.01 ms and `scroll-behavior: auto`.
- **A4 Focus.** Global `:focus-visible` 2 px accent outline, 2 px offset. Remove `outline-none` without visible replacement. Dialog and BottomSheet trap focus, close on Escape, return focus to trigger. HistoryList row `aria-label` gains PR count and volume. ExercisesView `Link` nested in `Button` becomes a styled `Link`.
- **A5 Error boundary (§8.7).** `AppErrorBoundary` wraps `Shell`: "Something went wrong" with Copy details (`navigator.clipboard.writeText` of message + stack, select-text fallback), Export backup (`useBackupExport`), Reload (user action).
- **K1 iOS keyboard.** `installKeyboardHandling()` uses `visualViewport`; sets `html[data-keyboard="open"]` when `innerHeight − vv.height > 120`. On `focusin` and vv `resize`, scrolls the focused editable to `block: 'center'` when hidden. TabBar and WorkoutMiniBar carry `data-hide-on-keyboard`, hidden by CSS while open. RestTimerBar stays.
- **S1 Bundle budget.** `scripts/check-bundle-size.mjs dist` gzips (zlib default) the entry `<script type="module">` plus every `<link rel="modulepreload">` in `dist/index.html`, sums, prints kB (1000 bytes), fails > 250 kB, warns > 230 kB. `npm run size`, and in CI after build. New screens (welcome sheet, reset screen, install help) are `lazy()`. Target entry growth ≤ 4 kB gz over 199.5 kB. `build.chunkSizeWarningLimit: 900`.
- **V1 Version.** `vite.config.ts` reads `package.json` and sets `define['import.meta.env.VITE_APP_VERSION'] = JSON.stringify(process.env.VITE_APP_VERSION ?? pkg.version)`. Scribe bumps to `1.0.0`. README: bump patch on every deploy.
- **Z1 Lighthouse.** Lighthouse 12 has no PWA category; §17 "PWA checks" verified by DevTools Manifest installable with no errors + SW-offline e2e + manual Lighthouse mobile run (Performance ≥ 90, Best Practices ≥ 90) on the deployed URL, recorded in PROGRESS (Q2).
- **C1 Console guard.** e2e auto-fixture fails a test on any `pageerror` or `console.error`; allow-list `net::ERR_INTERNET_DISCONNECTED` and `Failed to load resource` in offline specs. Every spec imports `test` from `e2e/fixtures.ts`.
- **C2 CI.** Remove `continue-on-error` from the `integration` job. Owner makes `integration` required after first green run (Q3).

## 1. Contracts

```ts
// src/types/domain.ts
export interface SettingsData { /* existing */ onboardedAt?: number }

// src/db/schema.ts (type only, no version() change) — meta rows
| { key: 'lastBackupAt'; value: number }
| { key: 'backupNudgeDismissedAt'; value: number }
| { key: 'backupTrackingSince'; value: number }

// src/lib/ids.ts
export function starterTemplateId(userId: string, key: StarterKey): string;

// src/lib/starterTemplates.ts (pure)
export type StarterKey = 'push' | 'pull' | 'legs';
export interface StarterTemplateDef { key: StarterKey; name: string; exercises: readonly { name: string; sets: number; targetReps: number }[] }
export const STARTER_TEMPLATES: readonly StarterTemplateDef[];
export function buildStarterExercises(def: StarterTemplateDef, resolve: (name: string) => string | undefined): TemplateExercise[];

// src/lib/onboarding.ts (pure)
export interface OnboardingInputs { settingsHydrated: boolean; onboardedAt?: number; workouts: number; templates: number; bodyweight: number }
export function shouldShowOnboarding(i: OnboardingInputs): boolean;

// src/lib/backupNudge.ts (pure)
export const BACKUP_NUDGE_INTERVAL_MS = 30 * 86_400_000;
export function shouldNudgeBackup(i: { now: number; lastBackupAt?: number; dismissedAt?: number; trackingSince?: number; workouts: number; workoutActive: boolean }): boolean;

// src/db/repos/meta.ts
export interface BackupNudgeMeta { lastBackupAt?: number; dismissedAt?: number; trackingSince?: number }
export function observeBackupNudgeMeta(): Observable<BackupNudgeMeta>;
export function ensureBackupTracking(now: number): Promise<void>;
export function markBackupExported(at: number): Promise<void>;
export function dismissBackupNudge(at: number): Promise<void>;

// src/db/repos/templates.ts
export function addStarterTemplates(now?: number): Promise<number>; // one runWrite over templates (+syncQueue); returns number added

// src/db/repos/onboarding.ts
export interface OnboardingCounts { workouts: number; templates: number; bodyweight: number }
export function observeOnboardingCounts(): Observable<OnboardingCounts>;
export interface OnboardingChoice { unit: Unit; bodyweightKg?: number; addStarterTemplates: boolean }
export interface OnboardingOutcome { bodyweightSaved: boolean; templatesAdded: number }
export function completeOnboarding(choice: OnboardingChoice, now: number): Promise<OnboardingOutcome>;
export function skipOnboarding(now: number): Promise<void>;

// src/lib/authRedirect.ts (no supabase import)
export interface RecoveryTokens { accessToken: string; refreshToken: string }
export type AuthRedirect =
  | { kind: 'recovery'; tokens: RecoveryTokens }
  | { kind: 'signup_confirmed' }
  | { kind: 'error'; code?: string; description?: string };
export function captureAuthRedirect(): void;
export function getAuthRedirect(): AuthRedirect | null;
export function clearAuthRedirect(): void;

// src/lib/supabase.ts
export function createRecoveryClient(): LiftClient; // R3; same secret-key guard as getSupabase

// src/sync/auth.ts
export type ResetRequestResult = { ok: true } | { ok: false; message: string };
export function requestPasswordReset(email: string): Promise<ResetRequestResult>; // withTimeout AUTH_TIMEOUT_MS
export type ResetFailure = 'invalid_link' | 'offline' | 'weak_password' | 'same_password' | 'error';
export type BeginResetResult = { ok: true; email: string } | { ok: false; reason: ResetFailure; message: string };
export function beginPasswordReset(tokens: RecoveryTokens): Promise<BeginResetResult>;
export type CompleteResetResult = { ok: true; email: string } | { ok: false; reason: ResetFailure; message: string };
export function completePasswordReset(newPassword: string): Promise<CompleteResetResult>;

// src/pwa/installPrompt.ts + src/hooks/useInstallPrompt.ts
export type InstallPlatform = 'standalone' | 'ios' | 'android' | 'other';
export function initInstallPrompt(): void; // idempotent
export function getInstallPlatform(): InstallPlatform;
export function canPromptInstall(): boolean;
export function subscribeInstallPrompt(cb: () => void): () => void;
export function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'>;
export function useInstallPrompt(): { platform: InstallPlatform; canPrompt: boolean; promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'> };

// src/lib/platform/keyboard.ts
export function isKeyboardOpen(innerHeight: number, visualHeight: number): boolean; // > 120 px
export function installKeyboardHandling(): () => void;
```

Edits: `settings.ts` `sanitizeSettings` drops `onboardedAt` unless a finite integer > 0. `backup.ts` `settingsSchema` adds `onboardedAt: z.number().int().positive().optional()`. `db/repos/dataOps.ts` `replaceAllLocal` and `clearUserDataLocal` follow O3. `sync/dataOps.ts` delete-all settings upsert follows O3. `stripAuthRedirectHash` and its tests are removed from `viewportFix.ts`.

UI new: `src/routes/Onboarding/{OnboardingGate,WelcomeSheet}.tsx`; `src/routes/ResetPassword/ResetPasswordScreen.tsx` (props `{ tokens: RecoveryTokens; onDone: (email: string | undefined) => void }`); `src/components/{InstallInstructions,InstallHelpSheet,AppErrorBoundary}.tsx`; `src/routes/Settings/AboutSection.tsx`; `src/routes/WorkoutTab/BackupNudgeCard.tsx`.
UI edit: `SignInScreen.tsx` (`AuthMode` adds `'forgot'`; props `onRequestReset(email)`, `initialEmail?`); `AuthGate.tsx`; `App.tsx` (recovery switch, redirect toast, `OnboardingGate`, `AppErrorBoundary`); `SettingsPage.tsx` (uses `AboutSection`); `WorkoutHome.tsx`; `Templates/TemplateList.tsx`; `useBackupExport.ts`.

## 2. Edge cases
- Quota: every onboarding/starter write goes through `runWrite` (N19).
- Decimal/units: onboarding bodyweight accepts `,`, entered in chosen unit, `fromDisplayInput`, stored kg rounded 3 dp, `0 < kg < 700`.
- Timezones: weigh-in uses `todayLocal(now)`.
- Offline: reset request/completion need network (offline copy). Welcome sheet works offline; writes queue.
- Account switch: reset never adopts a session (R3).
- Active workout: no backup nudge; redirect toast never navigates or reloads.

## 3. Tasks

| # | Task | Agent | Files | Depends |
|---|---|---|---|---|
| 10.1a | Onboarding, starter, nudge data layer; O3 in data ops | data-engineer | `src/types/domain.ts`, `src/db/schema.ts`, `src/db/repos/{settings,meta,templates,onboarding,dataOps}.ts`, `src/sync/dataOps.ts` (settings upsert only), `src/lib/{ids,starterTemplates,onboarding,backupNudge,backup}.ts`, tests | — |
| 10.1b | Password reset backend; `main.tsx` capture; local config | supabase-engineer | `src/lib/{authRedirect,supabase,viewportFix}.ts` + tests, `src/sync/auth.ts` + test, `src/main.tsx`, `supabase/config.toml` (`[auth.rate_limit] email_sent = 100`; add `http://127.0.0.1:4173/lift/` to `additional_redirect_urls`), `scripts/with-local-supabase.mjs` (pass Inbucket/Mailpit URL as `SUPABASE_TEST_MAIL_URL`) | — |
| 10.3a | Install prompt, keyboard helper, bundle script, version define, CI | pwa-engineer | `src/pwa/installPrompt.ts` + test, `src/hooks/useInstallPrompt.ts`, `src/lib/platform/keyboard.ts` + test, `scripts/check-bundle-size.mjs`, `package.json` (`size` script only), `.github/workflows/ci.yml` (size step, C2), `vite.config.ts`, `index.html` (meta description) | — |
| 10.1c | Auth UI: forgot mode, reset screen, redirect toasts, App recovery switch | ui-builder | `SignInScreen.tsx`, `src/routes/ResetPassword/*`, `AuthGate.tsx`, `App.tsx`, RTL tests | 10.1b |
| 10.1d | Welcome sheet + gate, install components, AboutSection, BackupNudgeCard, starter CTA, `markBackupExported`, AppErrorBoundary | ui-builder | see UI lists above, RTL tests | 10.1a, 10.3a, 10.1c |
| 10.3b | Wire `initInstallPrompt` + `installKeyboardHandling` in `main.tsx`; keyboard CSS; `data-hide-on-keyboard` | pwa-engineer | `src/main.tsx`, `src/styles/index.css` (keyboard rule only), `TabBar.tsx`, `WorkoutMiniBar.tsx` | 10.1b, 10.3a |
| 10.4a | E2E infra: `createUser(prefix, { onboarded = true })`; `latestEmailLink(email, match)` via Mailpit (skip if unreachable); `e2e/fixtures.ts` console guard; migrate imports | qa-engineer | `e2e/auth/helpers.ts`, `e2e/fixtures.ts`, `e2e/**/*.spec.ts` (imports only) | 10.1a |
| 10.2 | Accessibility pass (A1–A4) | ui-builder | `src/styles/{tokens,index}.css`, `tailwind.config.ts`, `src/components/**`, `HistoryList.tsx`, `ProgressTab/**`, `src/styles/__tests__/contrast.test.ts` | 10.1c, 10.1d, 10.3b |
| 10.3c | Perf verification: build, size, lazy chunks precached, entry delta; lazy `SettingsPage` only if entry > 205 kB | pwa-engineer | `src/App.tsx` (only if needed) | 10.2 |
| 10.4b | New specs + full suite locally and in CI | qa-engineer | `e2e/auth/{onboarding,password-reset,a11y,about}.spec.ts`, `signup.spec.ts` | 10.3c, 10.4a |
| 10.5 | README; version 1.0.0; PROGRESS | scribe | `README.md`, `package.json` (version), `docs/PROGRESS.md` | 10.4b |
| 10.6 | §17 audit, fixes, re-review until PASS | code-reviewer | — | 10.5 |

Waves: {10.1a, 10.1b, 10.3a} → {10.1c → 10.1d, 10.3b, 10.4a} → {10.2} → {10.3c} → {10.4b} → {10.5} → {10.6}.

## 4. Test requirements

**10.1a (fake-indexeddb):** `shouldShowOnboarding` true only when hydrated, no flag, all counts 0. `shouldNudgeBackup`: false with 0 workouts or active workout; boundary exactly 30 d true, 30 d − 1 ms false; uses max of three timestamps; after Not now false for 30 d. `addStarterTemplates`: adds 3 with deterministic ids and exact table contents; second call adds 0; skips archived/missing exercise keeping the rest; template with none resolved skipped; one upsert enqueued per template; two Dexie instances same user → identical ids. `completeOnboarding`: order and outbox entries (settings last); invalid kg → `bodyweightSaved: false`, rest runs; throw in step 1 leaves `onboardedAt` unset. `skipOnboarding` sets only `onboardedAt`. `sanitizeSettings` drops 0, -1, 1.5, NaN. Backup round trip with `onboardedAt`; backup without it valid. `replaceAllLocal` keeps current `onboardedAt`; `clearUserDataLocal` leaves defaults + `onboardedAt`, no outbox entry; sync `deleteAllData` payload includes `onboardedAt`. M9 tests stay green.

**10.1b:** `captureAuthRedirect` handles recovery, signup, error, `#/`, empty hashes; `replaceState` with `#/`; tokens never in `location` afterwards; `getAuthRedirect` stable until `clearAuthRedirect`. `requestPasswordReset` passes `redirectTo = origin + pathname`, maps rate-limit and offline, ok for unknown email. `beginPasswordReset` uses `createRecoveryClient`, never touches `lift-auth` localStorage or Dexie meta, invalid session → `invalid_link`. `completePasswordReset` enforces min length client-side, maps `same_password`/`weak_password`, `signOut({ scope: 'local' })` on recovery client only. ESLint import restriction holds.

**10.3a:** synthetic `beforeinstallprompt` → `canPromptInstall` true, subscribers notified; `promptInstall` returns `userChoice` outcome then unavailable; `appinstalled` clears; platform matrix (standalone, iOS UA, iPadOS MacIntel touch, Android, other). Keyboard: threshold; attribute toggles on vv resize; `scrollIntoView` only for editable below `vv.height`; cleanup removes listeners. Bundle script exits 0 on current dist, 1 with `--budget-kb=1`. `dist` contains the `package.json` version.

**10.1c/10.1d (RTL):** "Forgot password?" in signin mode only; submit shows neutral copy; offline error. Reset screen: verifying → form with email → mismatch and min-length validation → success → Continue calls `onDone(email)`; sign-in prefilled. Invalid link shows request-new-link CTA. Error redirect toast once under StrictMode. OnboardingGate per O2; Get started saves unit, weigh-in, templates; Skip writes flag only; Escape = Skip; invalid weight blocks. Install section hidden standalone, iOS text, Android button calls `promptInstall`. About: Install button only when `canPrompt`; How to install opens sheet; Version row shows `APP_VERSION`. BackupNudgeCard per `shouldNudgeBackup`; Export calls hook and hides; Not now hides. TemplateList empty state adds 3. AppErrorBoundary shows on throwing child; Copy details calls clipboard.

**10.2:** `contrast.test.ts` covers every A1 pair. Dialog and BottomSheet return focus and close on Escape. HistoryList label includes "PR" and volume. No `<a>` inside `<button>` in ExercisesView empty state.

**10.4b (Playwright chromium 390×844, local Supabase):**
- onboarding.spec: new user (`onboarded: false`) sees "Welcome to Lift", picks kg, enters 80, keeps templates, Get started → Settings kg, Bodyweight today 80 kg, Workout home lists Push/Pull/Leg Day; reload or second context does not show sheet; remote `onboardedAt` set and 3 template rows. Second case: Skip, then empty-state "Add starter templates" works.
- password-reset.spec: Forgot password → Mailpit link → `page.goto(link)` → "Set a new password" → mismatch error → save → "Password updated" → Continue → sign in with new password; old rejected; reopening link → invalid-link toast; link opened while signed in as user B with an unsynced change leaves B's cache and session intact.
- a11y.spec: on Workout home, active workout, History, Progress Exercises + Bodyweight, Exercises, Settings, welcome sheet: `ariaSnapshot()` has no unnamed button/link/textbox/checkbox/switch/radio/combobox; at `html { font-size: 130% }` `scrollWidth ≤ 390` and primary actions visible; reduced-motion smoke.
- about.spec: Version equals `package.json` version; synthetic `beforeinstallprompt` shows Install app.
- signup.spec expects the welcome sheet and skips it.
- Full suite green locally and in CI `integration`, zero console errors.

**10.3c:** record entry and total kB gz, delta, Lighthouse Performance and Best Practices, installability.

## 5. Manual device checklist (iPhone iOS 16.4+ installed; Android Chrome)
1. Installs from the Pages URL (iOS Share; Android Install button in About or browser menu). Icon, name, standalone, status bar, safe areas top and tab bar.
2. New account → welcome sheet once; templates and weigh-in land; second device doesn't show it.
3. Forgot password from installed app → email link opens in browser → set new password → back to installed app → sign in.
4. Keyboard: set row near the bottom stays visible; tab bar doesn't ride over the keyboard; same for bodyweight field.
5. Airplane mode: log a full workout and weigh-in, force-quit mid-workout, reopen → Resume banner with correct elapsed time. Reconnect → data on second device, no duplicates.
6. Rest timer accurate after 60 s locked; wake lock on Android; chime after a tap.
7. Both themes legible incl. charts; larger system text (Android) doesn't break layout.
8. Export (iOS Save to Files), delete all, import → identical.
9. Swipe delete on a set and on a weigh-in (iOS).
10. During an active workout a deployed update shows no reload; after finishing the update toast appears.

## 6. §17 acceptance mapping

| §17 item | Verified by |
|---|---|
| All P0 features implemented and passing tests | 10.6 audit vs §5 P0; suites green in CI |
| Installs iOS/Android, full screen, fully offline | Checklist 1, 5; `e2e/offline.spec.ts`; DevTools installable (Z1) |
| Active workout survives force-quit | `e2e/auth/active-workout.spec.ts`; checklist 5 |
| Graphs correct and legible both themes | Flow C/D e2e; calc tests; A1 contrast test; checklist 7 |
| JSON export/import round-trips exactly | `e2e/auth/flow-e.spec.ts`; M9 backup tests |
| Supabase persistence; second device identical; offline sync no loss/dupes | `tests/sync/two-device.test.ts`; `e2e/auth/offline-sync.spec.ts`; checklist 5 |
| RLS verified by test; no service-role key | `npm run test:rls`; `scripts/check-dist-secrets.mjs`; 10.6 grep |
| Lighthouse PWA; no console errors | Z1 manual run recorded in PROGRESS; C1 guard |
| README documents setup, deployment, install | 10.5 |

README sections: local dev and commands; env (`.env.example`, anon/publishable only); Docker + local Supabase; migrations workflow + version-name gotcha; RLS tests; deploy (Pages, secrets, Auth URL allow-list incl. reset redirect); install iOS/Android; backup/restore; password reset (opens in browser; default SMTP rate limit); data schema and sync model; versioning; deviations (A1, Z1, Q decisions, open sign-up); manual device checklist.

## 7. Risks
- R-a Mailpit API paths differ across CLI versions → helper skips with a reason when unreachable.
- R-b Local `email_sent` rate limit + CI retries → `email_sent = 100` locally only.
- R-c Second GoTrueClient "multiple instances" warning → distinct `storageKey` + memory storage; it's `console.warn`, not failing C1.
- R-d Remote default SMTP is heavily rate-limited → documented.
- R-e rem migration pixel shifts → 10.2 re-checks all screens at 390 px, both themes, 100% and 130%.
- R-f Lighthouse variance → median of 3.
- R-g iOS standalone ignores root font-size prefs → 130% check is synthetic on iOS.

## 8. Questions (resolved with defaults)
- Q1 Darken light accent to #2563EB with white on-accent — Yes.
- Q2 DevTools installability + offline e2e as "PWA checks" — Yes.
- Q3 `integration` becomes a required check (owner action) — Yes.
- Q4 Defer multi-tab warning, >6 h prompt, History search to post-v1 — Yes.
- Q5 Manual sign-in after reset — Yes.
- Q6 Default SMTP; owner confirms the redirect allow-list has the exact Pages URL — Yes.
- Q7 Starter templates checkbox checked by default — Yes.
- Q8 Existing empty accounts see the welcome sheet once — Yes.
