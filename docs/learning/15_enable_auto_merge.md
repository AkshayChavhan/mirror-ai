# 15 Enable auto-merge

**Branch:** `15_enable_auto_merge` (starts from `main`)
**Goal:** full auto-merge, the developer's choice (option (a)). Every task's PR merges by itself once CI passes, and Claude moves on to the next task without waiting, stopping only when a task needs the developer.

## 1. Check the repo setting

```bash
gh api repos/AkshayChavhan/mirror-ai --jq '{allow_auto_merge, allow_merge_commit, allow_squash_merge, delete_branch_on_merge}'
```
**Why:** GitHub's auto-merge must be allowed at the repo level. It was **already** `true`, so the developer didn't need to change anything.

## 2. First use: PR #14

```bash
gh pr merge 14 --auto --merge
```
**Why:** `--auto` tells GitHub to merge the PR **as soon as** all required checks pass. `--merge` uses a merge commit, the same as every PR so far. PR #14's CI had already passed, so it merged immediately.
- It isn't a bypass. Branch protection (task 14) still decides whether a merge is allowed. With a failing check, auto-merge just waits.

## 3. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in the merged PR #14.

```bash
git checkout -b 15_enable_auto_merge
```
**Why:** new task, new branch.

## 4. Rule changes in `CLAUDE.md`

| Rule | Before | After |
|---|---|---|
| Branch and commit | No commit, publish, merge, or PR without explicit permission | Commit, publish, and PR are part of every task, once the checklist passes and the reviewer says `READY TO COMMIT` |
| Workflow: plan first | Wait for the developer's OK on every plan | Share the plan and go ahead. **Stop only** for a decision, keys, an unlisted package, a blocked action, or anything unclear |
| Workflow: packages | Ask before any package | Packages named with a version in `docs/task-list.md` are pre-approved. Ask for any other |
| Checklist | "Before asking to commit", with a summary for review | "Before committing", plus the reviewer's `READY TO COMMIT`, with the summary in the PR |
| Task list | Take the next ❌ task | Also: if it's blocked on the developer, ask, then continue with the next unblocked task |
| Git extras: merge flow | Claude never merges; the developer merges | Claude runs `gh pr merge <n> --auto --merge`; GitHub merges only when CI passes. Claude never merges directly, bypasses checks, or changes protection. If CI fails, Claude fixes it on the same branch |

Also updated:
- the `rules-reviewer` description ("before committing");
- the `docs/task-list.md` header ("before committing");
- Git extras, branch base: always start from the latest `main`, now that merges are automatic.

Safety kept:
- CI is the gate, enforced by GitHub (task 14). Admins are bound too.
- The rules-reviewer still runs before every commit.
- The guardrail hook still blocks destructive git.
- Claude still stops for anything that needs the developer.

## 5. Task list

- Inserted row 15 (this task). Rows 15–28 became 16–29, and the Blockers numbers were updated to match.

## 6. Tests

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** end-of-task checklist. `test:e2e` includes the build.

The real test is this task's own PR: after `gh pr merge <n> --auto --merge`, it must merge **without any click**, once CI is green (recorded in the PR).

## 7. Commit, publish, PR, auto-merge

```bash
git add CLAUDE.md .claude/agents/rules-reviewer.md docs/task-list.md docs/learning/15_enable_auto_merge.md
```
**Why:** stages this task's files.

```bash
git commit -m "15_enable_auto_merge Switch to full auto-merge workflow"
```
**Why:** saves the snapshot.

```bash
git push -u origin 15_enable_auto_merge
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 15_enable_auto_merge --title "15_enable_auto_merge Switch to full auto-merge workflow" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown file holding the PR description.

```bash
gh pr merge <number> --auto --merge
```
**Why:** queues the merge. GitHub merges once the CI check passes. `<number>` is the PR number printed by `gh pr create`.

```bash
gh pr view <number> --json state,mergedAt
```
**Why:** confirms `MERGED`, with no manual click.

## Gotchas

- **Auto-merge ≠ skipping checks.** It only removes the click. If CI fails, nothing merges.
- **`strict` + auto-merge:** if `main` moves on while a PR waits, GitHub needs the branch updated before merging. `gh pr update-branch <number>` does it, then CI re-runs and auto-merge continues.
- **The hook still reads text.** Commands whose text contains "push" or other blocked words get blocked, even inside Python strings. Use the Edit tool for file edits like that, or `--body-file` for PR text.
- **Turning auto-merge off again:** switch back to option (c) by reverting these `CLAUDE.md` rules. To cancel one queued merge: `gh pr merge <number> --disable-auto`.
