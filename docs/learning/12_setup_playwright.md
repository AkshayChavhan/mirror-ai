# 12 Set up Playwright

**Branch:** `12_setup_playwright` (starts from `main`)
**Goal:** end-to-end (E2E) tests that drive a real browser against the real app. They're needed for `async` Server Components, which Vitest can't render.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings local `main` up to date after PR #10 (task 11) merged.

```bash
git checkout -b 12_setup_playwright
```
**Why:** new task, new branch.

## 2. Read the guide and check versions

```bash
cat node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md
```
**Why:** the Next 16 guide. It suggests `npm init playwright`, which asks interactive questions and adds example files, so we install directly instead. It also mentions the `webServer` option, which lets Playwright start the app itself.

```bash
npm view @playwright/test version engines.node --json
```
**Why:** latest is 1.63.0, and it needs Node ≥20, which we have.

```bash
curl -s https://unpkg.com/playwright-core@1.63.0/browsers.json
```
**Why:** shows which browser build each Playwright version uses. 1.63.0 uses Chromium revision **1243**.

```bash
ls ~/Library/Caches/ms-playwright
```
**Why:** Playwright stores browsers there, shared by all projects. `chromium-1243` was already there from another project, so nothing needed downloading.

## 3. Install

```bash
npm install -D @playwright/test@1.63.0
```
**Why:** the test runner, with its `playwright` and `playwright-core` dependencies. Dev only.

| Package | Version | Role |
|---|---|---|
| `@playwright/test` | 1.63.0 | E2E test runner and browser automation |

```bash
npx playwright install --list
```
**Why:** lists the browsers Playwright can use. It found `chromium-1243` and `chromium_headless_shell-1243`. If they're missing on a new machine, run `npx playwright install chromium` (about 150 MB).

## 4. Config: `playwright.config.ts`

- `testDir: "./e2e"`: E2E specs live in `e2e/` (Vitest already excludes it, since task 11).
- `projects`: **Chromium only**, for now. Firefox and WebKit would add about 200 MB of downloads.
- `webServer`: before the tests, Playwright runs `npm run build && npm run start -- -p 3100`, waits for `http://localhost:3100`, and stops the server afterwards.
  - It tests the **production build**, the same as users get.
  - Port **3100** avoids clashing with `npm run dev` on 3000.
  - `reuseExistingServer: !process.env.CI` reuses a server that's already running locally. In CI it always starts fresh.
- `use.baseURL` lets tests write `page.goto("/")`.
- `use.trace: "on-first-retry"` records a step-by-step trace when a failed test is retried, for debugging.
- CI only: `retries: 2`, `forbidOnly` (fails if a `test.only` was left in), and the `github` reporter.

## 5. Script and ignore files

In `package.json` → `scripts`:

```json
"test:e2e": "playwright test"
```

`.gitignore` additions (Playwright's output folders):
- `/test-results/` holds screenshots and traces of failed tests.
- `/playwright-report/` holds the HTML report.
- `/blob-report/` holds report data used when merging runs.
- `/playwright/.cache/` holds the component-testing cache.

## 6. Smoke test: `e2e/home.spec.ts`

- `/` returns status 200 and shows an `h1`.
- The page title is `Create Next App`, from `app/layout.tsx` metadata. Task 15 changes it.

## 7. Rules updated (approved in the plan)

- `CLAUDE.md` checklist: "Tests pass" now means `npm test` **and** `npm run test:e2e`.
- `.claude/agents/rules-reviewer.md` check 12 also runs `npm run test:e2e`.

## 8. Tests

```bash
npm run test:e2e
```
**Why:** builds, starts the app on port 3100, and runs the specs in headless Chromium. Got `2 passed`.

```bash
cat > e2e/planted.spec.ts <<'EOF'
import { expect, test } from "@playwright/test";
test("fails on purpose", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Wrong Title", { timeout: 2000 });
});
EOF
```
**Why:** plants a test that must fail.

```bash
npm run test:e2e
```
**Why:** got `✘ fails on purpose`, `Expected: "Wrong Title"`, `Received: "Create Next App"`, `1 failed, 2 passed`, exit 1. Failures are reported clearly.

```bash
npm test
```
**Why:** with a spec file sitting in `e2e/`, Vitest still ran only its own 2 tests, which proves it ignores `e2e/`.

```bash
rm e2e/planted.spec.ts
```
**Why:** removes the planted test. `npm run test:e2e` passes again.

```bash
git show HEAD:package-lock.json > /tmp/lock-old.json
```
**Why:** saves the committed (old) lock file so the next command can compare against it.

```bash
python3 -c "import json; o=json.load(open('/tmp/lock-old.json'))['packages']; n=json.load(open('package-lock.json'))['packages']; print('removed', [k for k in o if k not in n]); print('added', [k for k in n if k not in o])"
```
**Why:** compares the package lists. Only 3 packages were added: `@playwright/test`, `playwright`, and `playwright-core`.

```bash
npm ci --dry-run && npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** end-of-task checklist, now including E2E.

## 9. Commit, push, PR

```bash
git add .gitignore package.json package-lock.json playwright.config.ts e2e/home.spec.ts CLAUDE.md .claude/agents/rules-reviewer.md docs/learning/12_setup_playwright.md docs/task-list.md
```
**Why:** stages only this task's files.

```bash
git commit -m "12_setup_playwright Add Playwright E2E with a home page smoke test"
```
**Why:** saves the snapshot.

```bash
git push -u origin 12_setup_playwright
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 12_setup_playwright --title "..." --body-file <file>
```
**Why:** opens the PR.

## Gotchas

- **Browsers are stored outside the project,** in `~/Library/Caches/ms-playwright`. A new machine or CI needs `npx playwright install chromium`. On Linux CI, add `--with-deps` to install system libraries too (task 13).
- **E2E runs a full `next build`,** so it takes about 10 seconds or more. That's slower than unit tests, and expected.
- **`"devOptional": true` in the lock file:** Next lists `@playwright/test` as an *optional peer dependency*, so npm marks it `devOptional` instead of `dev`. It's harmless and just reflects both roles.
- **Use `npm run test:e2e -- --ui`** for Playwright's visual runner while writing tests. (`--` passes the flag through npm to Playwright.)
