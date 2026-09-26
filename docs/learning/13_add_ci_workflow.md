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
- `concurrency` with `cancel-in-progress`: a new commit on the same PR cancels the older, still-running check.
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
