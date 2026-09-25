# 02 Adding rules for learning documents

**Branch:** `02_adding_rules_for_learning_document` (starts from `01_installation_setup`)
**Goal:** make Claude write a learning doc for every task.

## 1. Create the task branch

```bash
git checkout -b 02_adding_rules_for_learning_document
```
**Why:** each task gets its own branch. It starts from the current branch (01), so it includes 01's work.

## 2. Add the rule to `CLAUDE.md`

Added the section `# Learning docs rule (always follow)`:
- Docs live in `docs/learning/`, named `NN_topic.md` (e.g. `01_installation_setup.md`).
- Every command, even `cd`, goes in a code block with a one-line **Why:**.
- Short but complete: bullets, no missing steps, flags, env vars, or files.
- Record config and code changes, plus gotchas and their fixes.
- Update the doc in the same turn as the work.

**Why `CLAUDE.md` and not `AGENTS.md`:** Claude Code loads `CLAUDE.md` at the start of every session. `next dev` rewrites `AGENTS.md`, so edits there get lost.

## 3. Commit

```bash
git add CLAUDE.md docs/learning/02_adding_rules_for_learning_document.md
```
**Why:** stages only this task's files.

```bash
git commit -m "02_adding_rules_for_learning_document Add learning doc rule to CLAUDE.md"
```
**Why:** saves the snapshot in our `<branch_name> <commit_message>` format.

## Gotchas

- An empty folder isn't tracked by git. `docs/learning/` shows up in git once it contains a file.
