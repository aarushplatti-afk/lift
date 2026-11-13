# Lift — Claude Code Guide

Source of truth: /docs/PRD.md. Read the relevant PRD sections
before starting any task. If code and PRD disagree, stop and ask.
Build plan: /docs/PLAN.md. Status: /docs/PROGRESS.md.

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
- One branch per milestone (m<N>-<slug>); merge to main via PR after code-reviewer PASS and green CI.
  main is protected; never force-push.
- Do not add dependencies not listed in the PRD without stating why and asking first.
- Hosting: GitHub Pages at /lift/ (HashRouter, Vite base '/lift/').
