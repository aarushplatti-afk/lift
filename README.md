# Lift

A clean, fast, offline-first workout tracker PWA: log sets, reuse templates, review history, and track per-exercise progress and bodyweight. Data is stored in your own Supabase database with a local offline cache.

> Status: under construction. See [docs/PROGRESS.md](docs/PROGRESS.md). Spec: [docs/PRD.md](docs/PRD.md).

## Stack
React 18 + TypeScript + Vite + Tailwind + Zustand + Dexie (IndexedDB) + Supabase + Recharts + vite-plugin-pwa.

## Setup
1. `cp .env.example .env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon key only).
2. `npm install`
3. `npm run dev`

Full dev, deploy, install, and backup docs will be added as milestones land.
