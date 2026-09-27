# 53 Tidy docs (and add phase 2 to the task list)

**Branch:** `53_tidy_docs` (starts from `main`)
**Goal:** put the approved phase 2 tasks into `docs/task-list.md`, and clean up stale notes, so the task list stays the source of truth.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #29 (task 24). All phase 1 tasks (01–29) were done at this point.

```bash
git checkout -b 53_tidy_docs
```
**Why:** adding tasks is a docs change, and our rules say no work happens on `main`. Task 53 (docs housekeeping) is the natural home, so it's done **first**, before task 30.

## 2. Phase 2 in the task list

- The developer approved the breakdown on 2026-09-27 ("All good"), including `inngest@4.21.0` (task 36) and the reviewer change (task 54).
- The new groups are D (database and admin, 30–35), E (try-on flow, 36–45), F (history and wishlist, 46–50), G (privacy and limits, 51–52), and H (housekeeping, 53–54).
- Each row has its branch name, what it covers, and its tests. Page tasks include signed-out redirect E2E tests (from task 24's design).
- `inngest@4.21.0` is named with its version in row 36, so it's pre-approved (workflow rule).

## 3. Blockers and "Later" cleaned up

- **Removed:** notes that were resolved long ago ("Base for `main`", 07 skills, 08 subagent).
- **Added:**
  - **30** needs the developer's `DATABASE_URL`, with the new Atlas password;
  - **52** needs the developer's rate limit.
- **"Later"** now lists the real leftovers: ZeroGPU quotas, sarees, a CatVTON fallback, the Prisma audit decision, and `server-only`. "Set up Inngest" moved into tasks 36–39.

## 4. `CLAUDE.md`

- Replaced the stale "The test framework isn't installed yet…" line (tasks 11–12 installed it) with the actual test commands.

## 5. Checklist

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** end-of-task checklist (docs only, but it always runs).

## 6. Commit, publish, PR, auto-merge

```bash
git add docs/task-list.md CLAUDE.md docs/learning/53_tidy_docs.md
```
**Why:** stages this task's files.

```bash
git commit -m "53_tidy_docs Add phase 2 tasks and tidy stale notes"
```
**Why:** saves the snapshot.

```bash
git push -u origin 53_tidy_docs
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 53_tidy_docs --title "53_tidy_docs Add phase 2 tasks and tidy stale notes" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Text containing the word for publishing a branch** (like the `db:` script name in row 30) gets blocked by the guardrail hook in Bash commands. Edit such files with the Edit tool.
