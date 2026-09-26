# 18 Update the README

**Branch:** `18_update_readme` (starts from `main`)
**Goal:** replace the create-next-app README with one that explains this project to someone opening the repo for the first time.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #16 (task 17), which auto-merged.

```bash
git checkout -b 18_update_readme
```
**Why:** new task, new branch.

## 2. What the new README covers

- **What it is:** virtual try-on (tops, bottoms, dresses), and that this is a learning project.
- **Status:** early setup, with a link to `docs/task-list.md`.
- **Stack:** what's **in use** vs **planned** (MongoDB/Prisma, Clerk, Cloudinary, the try-on model), so nothing claims to exist before it does.
- **Requirements:** Node 22.23.2 from `.nvmrc`.
- **Getting started:** `git clone`, `cd mirror-ai`, `npm ci`, `npm run dev`, plus `npx playwright install chromium` for E2E.
- **Scripts:** a table matching `package.json`.
- **How work happens:** task branches, CI, protected `main`, auto-merge, and `CLAUDE.md`.
- **Docs:** links to the task list, learning docs, and Phase 0 findings.

## 3. Check it's accurate

```bash
for f in docs/learning docs/task-list.md docs/phase-0-findings.md .nvmrc CLAUDE.md; do [ -e "$f" ] && echo "ok $f" || echo "MISSING $f"; done
```
**Why:** every file the README links to must exist. All `ok`.

```bash
node -p "Object.keys(require('./package.json').scripts).join(' ')"
```
**Why:** lists the real script names (`dev build start lint typecheck test test:watch test:e2e`), so the README's scripts table can't drift from `package.json`.

## 4. Checklist

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** end-of-task checklist. There's no code change, but it always runs. `test:e2e` includes the build.

## 5. Commit, publish, PR, auto-merge

```bash
git add README.md docs/learning/18_update_readme.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "18_update_readme Replace starter README with a project README"
```
**Why:** saves the snapshot.

```bash
git push -u origin 18_update_readme
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 18_update_readme --title "18_update_readme Replace starter README with a project README" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Keep the README in step with reality.** When a planned item ships (for example Prisma in task 20), move it from "Planned" to "In use" in that task's branch.
