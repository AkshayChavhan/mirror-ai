# 08 Adding the rules-reviewer subagent

**Branch:** `08_adding_rules_reviewer_subagent` (starts from `main`)
**Goal:** a read-only agent that checks a finished task against `CLAUDE.md` before the developer is asked to commit.

## 1. Update `main` and create the branch

```bash
git fetch origin
```
**Why:** downloads GitHub's `main`, which now includes merged PR #6 (task 07).

```bash
git checkout main && git merge --ff-only origin/main
```
**Why:** moves local `main` up to GitHub's. `--ff-only` never creates a merge or overwrites anything.

```bash
git checkout -b 08_adding_rules_reviewer_subagent
```
**Why:** new task branch from the up-to-date `main`.

## 2. Write the agent file

Created `.claude/agents/rules-reviewer.md`. A subagent is a Markdown file with a YAML header:

```markdown
---
name: rules-reviewer
description: Read-only reviewer. Use after a task's changes are finished and before asking the developer to commit. ...
tools: Read, Grep, Glob, Bash
model: opus
---
<instructions>
```

- **`name`:** how you call it ("use the rules-reviewer agent").
- **`description`:** tells Claude *when* to use it.
- **`tools`:** no `Write`/`Edit`, so it can't change files. It has `Bash` only to run checks, and its instructions forbid git commands that change anything. The guardrail hook from task 07 also still applies.
- **`model: opus`:** the stronger model, since reviewing needs careful reading.
- **Body:** 13 checks that mirror `CLAUDE.md`: branch, scope, task list, learning doc, tests, secrets, TypeScript, server/client, try-on in `lib/` only, errors, new packages, checklist, commit message. Output is a table plus `VERDICT: READY TO COMMIT` or `NOT READY (n blocking)`.

## 3. Test it on a planted problem

Created a throwaway `lib/planted.ts` with a fake `hf_...` token, an unexplained `any`, and no test file.

- Claude Code loads agent files **at session start**, so a brand-new agent can't be called by name in the same session (`Agent type 'rules-reviewer' not found`).
- Instead, a general-purpose agent was told to follow `rules-reviewer.md` word for word. This tests the same instructions.

Result: `VERDICT: NOT READY (6 blocking)`. It caught:
- the `hf_` token at `lib/planted.ts:2` (secrets)
- `parse(input: any)` at `:4`, where `npm run lint` failed with `no-explicit-any`
- the file being out of scope for task 08
- no `lib/planted.test.ts`

It changed no files.

It also found a gap in its own instructions: the secrets scan only read `git diff main...HEAD`, so it would miss uncommitted or untracked files. Checks 6 and 7 now scan committed, staged, unstaged, and untracked files.

```bash
rm lib/planted.ts && rmdir lib
```
**Why:** deletes the planted problem. `lib/` was empty and existed only for the test.

## 4. Checks

```bash
npm run lint && npx tsc --noEmit && npm run build
```
**Why:** end-of-task checklist. All pass.

```bash
bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** makes sure task 07's hook still works. `Failures: 0`.

## 5. Commit, push, PR

```bash
git add .claude/agents/rules-reviewer.md docs/learning/08_adding_rules_reviewer_subagent.md docs/task-list.md
```
**Why:** stages only this task's files.

```bash
git commit -m "08_adding_rules_reviewer_subagent Add read-only rules-reviewer subagent"
```
**Why:** saves the snapshot.

```bash
git push -u origin 08_adding_rules_reviewer_subagent
```
**Why:** publishes the branch (allowed by the hook because it's a task branch).

```bash
gh pr create --base main --head 08_adding_rules_reviewer_subagent --title "..." --body-file <file>
```
**Why:** opens the PR. `--body-file` keeps the PR text out of the command line, so the hook doesn't misread words in it as git commands.

## How to use it (next session onward)

- Say "use the rules-reviewer agent", or Claude runs it on its own before asking to commit.
- `/agents` lists it under Project agents.

## Gotchas

- **New agents need a new session** to be callable by name.
- **`/loop` creates `.claude/scheduled_tasks.lock`.** It's session state, so never commit it. Stage files by name.
