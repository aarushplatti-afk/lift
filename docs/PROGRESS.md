# Lift — Progress Log

## Done
- Step 0: repo created, PRD moved to docs/PRD.md, Claude Code config (CLAUDE.md, agents, settings, commands).

## In progress
- Step 0: Supabase project creation (needs Supabase MCP), Docker Desktop install, master plan (docs/PLAN.md).

## Blocked
- Local Supabase stack: Docker Desktop not yet installed.

## Decisions
- Hosting: public GitHub repo + GitHub Pages (HashRouter, Vite base `/lift/`).
- Local dev DB: Docker Desktop + `npx supabase start`.
- Tailwind v3.4 (matches PRD `tailwind.config` token approach); React 18 per PRD.
- Extra deps: `zod` (import validation), `uuid` (v5 seed IDs), `@vite-pwa/assets-generator` (icons).
- Defaults per PRD §16: lb, blue accent `#4F8CFF`, name "Lift".
