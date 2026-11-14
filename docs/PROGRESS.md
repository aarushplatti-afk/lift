# Lift — Progress Log

## Done
- Step 0: repo created, PRD moved to docs/PRD.md, Claude Code config (CLAUDE.md, agents, settings, commands).

- Step 0: remote Supabase project `lift` created (ref `pcxohnsjxfbsugajvvpd`, us-east-2, free plan). No migrations applied yet.

## In progress
- Step 0: Docker Desktop install, master plan approval (docs/PLAN.md is drafted and its open questions are resolved), `.env.local` creation (user — blocked for Claude by `.env*` deny rule).

## Blocked
- Local Supabase stack: Docker Desktop not yet installed.

## Decisions
- Hosting: public GitHub repo + GitHub Pages (HashRouter, Vite base `/lift/`).
- Local dev DB: Docker Desktop + `npx supabase start`.
- Tailwind v3.4 (matches PRD `tailwind.config` token approach); React 18 per PRD.
- Extra deps: `zod` (import validation), `uuid` (v5 seed IDs), `@vite-pwa/assets-generator` (icons).
- Client key: modern publishable key (`sb_publishable_…`) in `VITE_SUPABASE_ANON_KEY`, not the legacy anon JWT.
- 2026-11-13, PLAN.md §5 decisions, all accepted by the user:
  - Q1: seeded exercise IDs are `uuidv5(name, uuidv5(userId, LIFT_NS))`, so each user has their own namespace.
  - Q2: Delete-all tombstones every row and resets settings, rather than hard-deleting.
  - Q3: the bodyweight ID is `uuidv5(entry_date, userNamespace)`, so a same-date entry from two devices converges.
  - Q4: settings store `weightIncrementLb` and `weightIncrementKg` separately (defaults 5 and 2.5).
  - Q5: `weighted_bodyweight` math uses the added weight only. Sets with 0 added weight count as reps-only.
  - Q6: PR trophy goes only to the best set per category per exercise per workout, and only if it strictly beats all earlier workouts.
  - Q7: an in-progress workout from another device shows as a passive row with Discard and no Resume.
  - Smaller items: §19.2 overrides §5.6 "no signup". Add `soundEnabled` to settings. Server `updated_at` replaces local `updatedAt` on pull. jsonb timestamps stay epoch ms. Booleans are not indexed in Dexie.
- Defaults per PRD §16: lb, blue accent `#4F8CFF`, name "Lift".
