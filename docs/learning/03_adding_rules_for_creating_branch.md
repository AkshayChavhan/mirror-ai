# 03 Adding rules for creating branches

**Branch:** `03_adding_rules_for_creating_branch` (starts from `02_adding_rules_for_learning_document`)
**Goal:** one small branch per task, and no commits without the developer's permission.

## 1. Create the task branch

```bash
git checkout -b 03_adding_rules_for_creating_branch
```
**Why:** starts this task's branch on top of 02.

## 2. Add the rule to `CLAUDE.md`

Added the section `# Branch and commit rules (always follow, never skip)`:
- Never work on `main`. Check the branch before changing anything.
- One very small task per branch, named `NN_snake_case_task`.
- Never commit, push, merge, or open a PR without explicit permission. Permission for one commit doesn't carry over to the next.
- Commit message format: `<branch_name> <commit_message>`.

## 3. Commit

```bash
git add CLAUDE.md docs/learning/03_adding_rules_for_creating_branch.md
```
**Why:** stages only this task's files.

```bash
git commit -m "03_adding_rules_for_creating_branch Add branch and commit rules to CLAUDE.md"
```
**Why:** saves the snapshot.

## Handy commands

```bash
git branch --show-current
```
**Why:** prints the branch you're on. Run it before changing anything.

```bash
git branch
```
**Why:** lists local branches. `*` marks the current one.

## Gotchas

- In a repo with no commits, `git checkout -b X` just renames the unborn branch. `main` doesn't exist until something is committed to it.
