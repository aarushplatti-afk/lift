---
description: Run the PRD 18.5 milestone loop for milestone N
argument-hint: <milestone number>
---
Run the milestone loop (PRD section 18.5) for milestone $ARGUMENTS from PRD section 13 and docs/PLAN.md.

1. Create/checkout branch `m$ARGUMENTS-<slug>` from an up-to-date main.
2. Use the `architect` agent to produce the milestone plan (exact files, signatures, task list with agents).
3. Delegate tasks to the assigned builder agents in dependency order, giving each the exact PRD sections and files. Contract (types + repo signatures) first. Never run two agents on the same files at once.
4. After each agent: run `npm run typecheck && npm run lint && npm run test` yourself. Two failures on the same task → escalate to opus.
5. Commit each task with a conventional commit.
6. Use `qa-engineer` to write/run tests for the milestone's acceptance criteria.
7. Use `code-reviewer` on `git diff main...HEAD`; fix blockers and re-review until PASS.
8. Use `scribe` to update docs/PROGRESS.md.
9. Push the branch and open a PR with `gh pr create`; merge once CI is green; confirm the Pages deploy.
10. If this is a check-in milestone (1, 3, 6, 8, 10), stop and report: summary, live URL, what to test on the phone.
