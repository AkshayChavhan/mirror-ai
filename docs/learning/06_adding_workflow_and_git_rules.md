# 06 Adding workflow and git rules

**Branch:** `06_adding_workflow_and_git_rules` (starts from `05_adding_code_and_security_rules`)
**Goal:** how each task runs from plan to commit, safe git habits, and a task list that drives branch names.

## 1. Create the task branch

```bash
git checkout -b 06_adding_workflow_and_git_rules
```
**Why:** starts this task's branch on top of 05.

## 2. Add the task list

Created `docs/task-list.md`:
- One row per task: Status, number, branch name, what, tests.
- ❌ = not done. ✅ = done and checked. Switch ❌ to ✅ in the task's own branch **before** the commit.
- Tasks 01–06 are ticked ✅ in this branch, because this is where the list first gets committed.

## 3. Add the rules to `CLAUDE.md`

Added `# Task list rule`:
- Read `docs/task-list.md` before planning or creating a branch.
- New work gets added to the list first.
- Never tick ✅ while a check fails.

Added `# Workflow`:
- Plan first and wait for the developer's OK.
- Stay in scope, and ask when unsure.
- Explain the *why* after each change.
- Ask before adding any package.
- End-of-task checklist: tests, lint, type-check, build, learning doc, and a summary for review.

Added `# Git extras`:
- Branch from the latest approved branch.
- No force-push, `reset --hard`, or deleting branches without permission.
- Claude never merges. The developer reviews PRs and merges them.

Changed a line in `# Branch and commit rules`: branch names now come from `docs/task-list.md`.

## 4. Run the end-of-task checks

```bash
npm run lint
```
**Why:** ESLint checks. They pass.

```bash
npx tsc --noEmit
```
**Why:** type-check. It passes.

```bash
npm run build
```
**Why:** production build. It passes.

## 5. Commit

```bash
git add CLAUDE.md docs/task-list.md docs/learning/06_adding_workflow_and_git_rules.md
```
**Why:** stages only this task's files.

```bash
git commit -m "06_adding_workflow_and_git_rules Add workflow, git, and task list rules"
```
**Why:** saves the snapshot.

## Handy commands

```bash
git log --oneline --all --graph
```
**Why:** shows every branch and commit as a tree. You can see 01 → 02 → … → 06 stacked on each other.
