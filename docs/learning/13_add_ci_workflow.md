# 13 Add a CI workflow

**Branch:** `13_add_ci_workflow` (starts from `main`)
**Goal:** GitHub runs the same checks as our end-of-task checklist on every PR, on a clean Linux machine, automatically.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings local `main` up to date after PR #11 (task 12) merged.

```bash
git checkout -b 13_add_ci_workflow
```
**Why:** new task, new branch.

## 2. Check versions and repo settings

```bash
gh repo view --json visibility,defaultBranchRef
```
**Why:** the repo is `PUBLIC`, so GitHub Actions minutes are free, and the default branch is `main`.

```bash
gh api repos/actions/checkout/releases/latest --jq .tag_name
```
**Why:** latest version of an official action. Same for `setup-node` and `upload-artifact`: all **v7**.

```bash
gh api repos/AkshayChavhan/mirror-ai/actions/permissions
```
**Why:** confirms Actions are enabled for the repo (`"enabled": true`).

## 3. Write the workflow

```bash
mkdir -p .github/workflows
```
**Why:** GitHub runs every YAML file in `.github/workflows/`.

`.github/workflows/ci.yml`:
- `on`: `pull_request` into `main`, and `push` to `main`. Every PR is checked, and so is `main` after a merge.
- `permissions: contents: read`: the workflow's token can only read. This is the least privilege it needs.
- `concurrency` with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`: a new commit on the same PR cancels the older, still-running check. Runs on `main` are never cancelled, so every merge gets a finished check. (The rules-reviewer suggested limiting cancelling to PRs.)
- One job on `ubuntu-latest` (`timeout-minutes: 20`), with these steps:

| Step | Why |
|---|---|
| `actions/checkout@v7` | Downloads the repo into the runner |
| `actions/setup-node@v7` with `node-version-file: .nvmrc`, `cache: npm` | Same Node as local (22.23.2), and caches npm downloads between runs |
| `npm ci` | Clean install that exactly follows `package-lock.json`, and fails if it doesn't match `package.json` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen && tsc`. Plain `tsc` would fail on this fresh machine (task 10) |
| `npm test` | Vitest unit tests |
| `npx playwright install --with-deps chromium` | Browser, plus the Linux libraries it needs (`--with-deps`) |
| `npm run test:e2e` | Playwright. Its `webServer` runs `npm run build`, so the build is checked here too |
| `actions/upload-artifact@v7` (`if: failure()`) | When something fails, uploads `test-results/` (Playwright traces) for 7 days. Download it from the run's page |

```bash
ruby -ryaml -e 'y=YAML.load_file(".github/workflows/ci.yml"); puts (y[true]||y["on"]).keys.inspect'
```
**Why:** checks that the YAML parses before pushing. (Ruby's YAML reads `on:` as the boolean `true`, which is a quirk of YAML 1.1, hence `y[true]`.)

## 4. First commit, push, PR

```bash
git add .github/workflows/ci.yml docs/task-list.md docs/learning/13_add_ci_workflow.md
```
**Why:** stages this task's files.

```bash
git commit -m "13_add_ci_workflow Add GitHub Actions CI workflow"
```
**Why:** first commit of the task.

```bash
git push -u origin 13_add_ci_workflow
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 13_add_ci_workflow --title "13_add_ci_workflow Add GitHub Actions CI workflow" --body-file <file>
```
**Why:** opening the PR triggers the workflow's first run (PR #12).

## 5. Test 1: CI is green

```bash
gh run list --commit $(git rev-parse HEAD) --workflow CI --json status,conclusion,databaseId
```
**Why:** finds the CI run for our latest commit. It was polled every 20 seconds until `status` was `completed`.

```bash
gh run view 36225737542 --json jobs --jq '.jobs[0].steps[] | "\(.conclusion) \(.name)"'
```
**Why:** lists each step's result. Every step was `success` in 1 min 20 s (Linux, fresh machine). Upload was `skipped` because nothing failed.

## 6. Test 2: CI goes red on a failing test

```bash
cat > app/planted-ci.test.ts <<'EOF'
// PLANTED: temporary failing test to prove CI turns red (task 13). Removed in the next commit.
import { expect, it } from "vitest";
it("fails on purpose so CI goes red", () => {
  expect(1 + 1).toBe(3);
});
EOF
```
**Why:** plants a failing unit test.

```bash
git add app/planted-ci.test.ts && git commit -m "13_add_ci_workflow Add temporary failing test to verify CI goes red"
```
**Why:** commits it, so CI sees it. Our rules block history rewrites, so this commit stays in the PR history, labeled as temporary.

```bash
git push -u origin 13_add_ci_workflow
```
**Why:** triggers a new CI run on the PR.

```bash
gh run view 36225856432 --log-failed
```
**Why:** shows only the logs of failed steps. Result: **failure**. `Unit tests (Vitest)` failed with `AssertionError: expected 2 to be 3` (`1 failed | 2 passed`). The Chromium and E2E steps were **skipped**, because later steps don't run after a failure, and the upload step ran.

The upload step warned `No files were found with the provided path: test-results/`, because E2E never ran. Fixed by adding `if-no-files-found: ignore` to the upload step.

## 7. Remove the planted test, tick ✅

```bash
rm app/planted-ci.test.ts
```
**Why:** removes the failing test. The final commit also adds `if-no-files-found: ignore`, limits `cancel-in-progress` to PRs, and ticks 13 ✅ in `docs/task-list.md`.

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** end-of-task checklist, run locally too. (`test:e2e` includes the build.)

```bash
git add .github/workflows/ci.yml app/planted-ci.test.ts docs/task-list.md docs/learning/13_add_ci_workflow.md
```
**Why:** stages the removal (`git add` on a deleted file records the deletion) and the other final changes.

```bash
git commit -m "13_add_ci_workflow Remove temporary failing test, quiet empty artifact upload"
```
**Why:** final commit of the task.

```bash
git push -u origin 13_add_ci_workflow
```
**Why:** triggers the last CI run, which must be green again (test 3).

## Gotchas

- **Workflow files need permission:** pushing changes under `.github/workflows/` needs a GitHub token with the `workflow` scope. `gh auth login` includes it by default.
- **YAML `on:` is parsed as `true`** by YAML 1.1 parsers (Ruby, PyYAML). GitHub reads it correctly.
- **Where to see CI:** the PR's **Checks** tab, or `gh run list` / `gh run view <id>` in the terminal.
- **Merging with a red CI is still possible** unless branch protection requires the check. That's an optional repo setting, not part of this task.
