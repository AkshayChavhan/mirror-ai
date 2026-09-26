# 14 Add branch protection

**Branch:** `14_add_branch_protection` (starts from `main`)
**Goal:** GitHub refuses to merge into `main` unless CI passes, even for the repo owner.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings local `main` up to date after PR #12 (task 13) merged.

```bash
git checkout -b 14_add_branch_protection
```
**Why:** new task, new branch. The protection itself is a GitHub setting, not a file. The branch holds this doc and the task-list update.

## 2. Check the current state

```bash
gh api repos/AkshayChavhan/mirror-ai/branches/main/protection
```
**Why:** shows the current rules. It returned `Branch not protected (HTTP 404)`.

```bash
gh api repos/AkshayChavhan/mirror-ai/commits/main/check-runs --jq '.check_runs[] | "\(.name) | app_id=\(.app.id) | \(.conclusion)"'
```
**Why:** the protection rule must name the CI check **exactly**. This prints `Lint, typecheck, unit + E2E tests | app_id=15368 | success`. `15368` is the GitHub Actions app, and pinning it means only a real Actions run can satisfy the check.

## 3. The rules (`protection.json`)

```json
{
  "required_status_checks": {
    "strict": true,
    "checks": [{ "context": "Lint, typecheck, unit + E2E tests", "app_id": 15368 }]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "required_conversation_resolution": false
}
```
- `required_status_checks.checks`: the CI job must pass before merging.
- `strict: true`: the PR branch must include the latest `main`, so CI tested what will actually land.
- `enforce_admins: true`: the rules apply to the owner too (option (a), recommended).
- `required_pull_request_reviews` with `0` approvals: changes must go **through a PR** (no direct commits to `main`), but no approval is needed. A solo developer can't approve their own PR.
- `allow_force_pushes: false`, `allow_deletions: false`: `main`'s history can't be rewritten, and `main` can't be deleted.
- `restrictions: null`: no per-user limit on who can merge (it's a personal repo).

## 4. Apply it (the developer runs this)

Claude Code's permission system blocks Claude from changing repository access rules. It counts as granting permissions, so the developer ran this in their own terminal (copy and paste all of it):

```bash
gh api -X PUT repos/AkshayChavhan/mirror-ai/branches/main/protection --input - <<'EOF'
{
  "required_status_checks": { "strict": true, "checks": [{ "context": "Lint, typecheck, unit + E2E tests", "app_id": 15368 }] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "dismiss_stale_reviews": false, "require_code_owner_reviews": false },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "required_conversation_resolution": false
}
EOF
```
**Why:** `PUT` replaces the protection settings of `main`. `--input -` reads the JSON body from standard input, and the `<<'EOF' … EOF` heredoc supplies it inline, so no separate file is needed. The quotes around `'EOF'` stop the shell from changing anything inside. GitHub replies with the saved settings.

To use it for another repo, change `AkshayChavhan/mirror-ai` (owner/repo), `main` (branch), and the check name in `"context"` to that repo's CI job name. Find the name with the `check-runs` command in step 2.

Alternative without the terminal: GitHub → repo **Settings** → **Branches** → **Add branch ruleset** (or classic rule) for `main`, then tick the same options.

## 5. Test 1: read the settings back

```bash
gh api repos/AkshayChavhan/mirror-ai/branches/main/protection --jq '{strict: .required_status_checks.strict, checks: [.required_status_checks.checks[].context], enforce_admins: .enforce_admins.enabled, pr_required: (.required_pull_request_reviews != null), approvals: .required_pull_request_reviews.required_approving_review_count, force_pushes: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled}'
```
**Why:** reading the settings is allowed (only changing them is blocked). It picks out just the fields we set. Result: `strict: true`, `checks: ["Lint, typecheck, unit + E2E tests"]`, `enforce_admins: true`, `pr_required: true`, `approvals: 0`, `force_pushes: false`, `deletions: false`. All as intended.

## 6. Test 2: a failing PR can't be merged

```bash
git checkout -b 14_temp_blocked_merge_check main
```
**Why:** a throwaway branch from `main`. Its name starts with `NN_` so the guardrail hook allows pushing it.

```bash
cat > app/planted-protection.test.ts <<'EOF'
// PLANTED: temporary failing test to prove branch protection blocks the merge (task 14). This PR is closed, never merged.
import { expect, it } from "vitest";

it("fails on purpose so the merge is blocked", () => {
  expect(1 + 1).toBe(3);
});
EOF
```
**Why:** plants a failing test.

```bash
git add app/planted-protection.test.ts && git commit -m "14_temp_blocked_merge_check Add failing test to verify merge is blocked"
```
**Why:** commits it on the throwaway branch only.

```bash
git push -u origin 14_temp_blocked_merge_check
```
**Why:** publishes it so it can get a PR.

```bash
gh pr create --base main --head 14_temp_blocked_merge_check --title "[TEMP - DO NOT MERGE] 14 verify branch protection blocks failing PRs" --body-file <file>
```
**Why:** opens PR #13, which triggers CI. `<file>` is a placeholder for a Markdown file holding the PR description. `--body-file` keeps that text out of the command line, where the guardrail hook would read it.

```bash
gh pr checks 13 --json state
```
**Why:** polled until the CI check finished. Result: `FAILURE`.

```bash
gh pr view 13 --json mergeStateStatus,mergeable
```
**Why:** asks GitHub whether the PR can be merged. Result: `"mergeStateStatus": "BLOCKED"`, so **protection works**.
- `mergeable: "MERGEABLE"` only means "no merge conflicts". `mergeStateStatus` is the field that includes branch protection.
- We did **not** try to merge it. Claude never merges, and if protection had been wrong, that would have put a failing test into `main`.

```bash
gh pr close 13 --comment "Test finished: CI failed and GitHub reported mergeStateStatus BLOCKED, so branch protection works. Closing without merging."
```
**Why:** closes the test PR without merging it.

```bash
git checkout 14_add_branch_protection
```
**Why:** back to the task branch.

## 7. Clean up the throwaway branch (the developer runs these)

The guardrail hook (task 07) blocks Claude from deleting branches, so the developer runs these:

```bash
git push origin --delete 14_temp_blocked_merge_check
```
**Why:** deletes the throwaway branch on GitHub.

```bash
git branch -D 14_temp_blocked_merge_check
```
**Why:** deletes it locally. `-D` (force) is needed because it was never merged, which `-d` refuses.

## 8. Commit, push, PR

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** end-of-task checklist (no code changed, but the checklist always runs). `npm run test:e2e` runs `next build` itself, so it covers the build step.

```bash
git add docs/learning/14_add_branch_protection.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "14_add_branch_protection Protect main: require CI, PRs, and rules for admins"
```
**Why:** saves the snapshot.

```bash
git push -u origin 14_add_branch_protection
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 14_add_branch_protection --title "14_add_branch_protection Protect main: require CI, PRs, and rules for admins" --body-file <file>
```
**Why:** this PR is the first one held to the new rules. It can only be merged once its own CI passes.

## Gotchas

- **Only a real, finished check counts.** The check is pinned to the GitHub Actions app (`app_id 15368`), so nothing else can mark it as passed.
- **`strict: true` means an up-to-date branch.** If `main` moves on while a PR is open, GitHub shows **Update branch**. Click it (it merges `main` into the PR), and CI runs again.
- **Admins are bound too** (`enforce_admins: true`). In a real emergency, the owner can turn it off in **Settings → Branches**, then back on.
- **If the CI job is renamed,** the required check name must be updated too. Otherwise every PR waits forever for a check that never reports.
