# 71 Quiet Clerk testing logs

**Branch:** `71_quiet_clerk_testing_logs` (starts from `main`)
**Goal:** stop `@clerk/testing` printing short-lived development session tokens (`__clerk_db_jwt`) in the **public** CI log, while the signed-in specs keep passing.
- Approved by the developer on 2026-10-01.
- Test-tooling change only, no new packages.

## 1. Branch and setup

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #70 (task 70).

```bash
git checkout -b 71_quiet_clerk_testing_logs
```
**Why:** new task, new branch.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 (`.nvmrc`) in a shell where `fnm` isn't on the PATH.

## 2. Where the token comes from

```bash
grep -n "FAPI request failed" node_modules/@clerk/testing/dist/playwright/index.js
```
**Why:** finds the warning in `@clerk/testing` 2.2.39. Its network handler (registered with `context.route`) prints `[Clerk Testing] FAPI request failed … <url>` when a Frontend API request fails, for example one still in flight when a test ends (`route.fetch: Test ended`). It also prints this when Clerk answers with an error status. **The URL includes `__clerk_db_jwt=<token>`.**

```bash
for run in $(gh run list --branch main --limit 6 --json databaseId --jq '.[].databaseId') 37271127162; do n=$(gh run view $run --log | grep -c "__clerk_db_jwt="); w=$(gh run view $run --log | grep -c "FAPI request failed"); echo "run $run: lines with __clerk_db_jwt= : $n, FAPI warnings: $w"; done
```
**Why:** counts (never prints) the token lines and warnings in the 6 latest `main` runs plus PR #70's CI run (`37271127162`). **1 of the 7 had one**, so it happens intermittently.
- That token is already in a public log (run `36996732227`). It's a short-lived session for the development instance's test user, so the risk is low. The repo owner can delete that run's logs on GitHub if wanted.

## 3. Trying to reproduce it

- The repeated signed-in specs gave `45 passed, 20 skipped`, with **0** token lines and **0** warnings:

```bash
npx playwright test e2e/signed-in.spec.ts e2e/tryon-live.spec.ts e2e/admin-models.spec.ts e2e/tryon-camera.spec.ts e2e/tryon-loading.spec.ts --repeat-each=5 --reporter=list > <scratch>/baseline.log 2>&1; grep -c '__clerk_db_jwt=' <scratch>/baseline.log; grep -c 'FAPI request failed' <scratch>/baseline.log
```
**Why:** runs every signed-in test 5 times, saving the output to a file and printing only counts (so no token can reach the terminal).

- A temporary spec, `e2e/zz-clerk-repro.spec.ts`, signed in and ended the test with Clerk requests in flight. Its final version:

```ts
test("ends with a Clerk request still in flight", async ({ page }) => {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: E2E_USERS.user });
  const sent = page.waitForRequest((request) => request.url().includes("/touch"));
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) void (window as unknown as WithClerk).Clerk.session?.touch(); // a burst
  });
  await sent; // the browser sent it: end the test right here
});
```

- **Three versions:**
  1. one `touch()` with no waiting;
  2. one `touch()`, waiting until it was sent (`waitForRequest`);
  3. the burst of 20 shown above.

```bash
npx playwright test e2e/zz-clerk-repro.spec.ts --repeat-each=8 --reporter=list > <scratch>/repro.log 2>&1; grep -c '__clerk_db_jwt=' <scratch>/repro.log; grep -c 'FAPI request failed' <scratch>/repro.log
```
**Why:** the run for versions 1 and 2 (8 times each).

```bash
npx playwright test e2e/zz-clerk-repro.spec.ts --repeat-each=6 --reporter=list > <scratch>/repro.log 2>&1; grep -c '__clerk_db_jwt=' <scratch>/repro.log; grep -c 'FAPI request failed' <scratch>/repro.log
```
**Why:** the run for version 3 (6 times). **0 warnings in every run.** Clerk's development server answers faster than a test can end, so the failure depends on network timing that can't be forced.

```bash
rm e2e/zz-clerk-repro.spec.ts
```
**Why:** deletes the temporary spec.

## 4. The fix: redact, in every signed-in spec

- **Preventing every warning isn't possible on demand**, so the fix makes sure no token value can be printed, whatever the timing. That's exactly what the row asks for.
- **`scripts/e2e-clerk.ts`** (the existing shared E2E Clerk helper):
  - `redactClerkTokens(text)` replaces each `__clerk_db_jwt=<value>` with `__clerk_db_jwt=<redacted>`, stopping at `&`, `;`, `,`, spaces, quotes and brackets;
  - it also redacts **`__clerk_testing_token=`**. `@clerk/testing`'s retried request carries the testing token, and a Playwright network error can include the request (its "Call log") in its message. The warning prints that message too. Not seen in CI yet, but on the same path (found by the rules-reviewer);
  - `redactClerkTokensInConsole(target = console)` wraps `log`, `info`, `warn`, `error` and `debug` so strings and `Error`s (message and stack) are redacted before printing. It wraps each console only once (a `WeakSet`).
- **The 5 signed-in specs** (`signed-in`, `tryon-live`, `admin-models`, `tryon-camera`, `tryon-loading`) call `redactClerkTokensInConsole()` right after their imports.
  - It works because `@clerk/testing` calls `console.warn` in the same worker process, at the moment it prints.
  - **A guard test** in `scripts/e2e-clerk.test.ts` reads every `e2e/*.spec.ts`. Any spec that imports `@clerk/testing/playwright` must contain the `redactClerkTokensInConsole();` line, so a new signed-in spec can't forget it.
- **Considered, not added:** `context.unrouteAll({ behavior: "wait" })` in `afterEach`, to let in-flight requests finish before a test ends. Without a reproduction I couldn't show it changes anything, and it would add a wait to every signed-in test.

## 5. Tests

- **`scripts/e2e-clerk.test.ts`** (fake tokens only, `dvb_FAKE…`):
  - a URL is redacted with the rest kept;
  - it stops at the next parameter, and handles several tokens;
  - `@clerk/testing`'s whole warning is redacted;
  - the testing token is redacted too, stopping at a cookie's `;`;
  - text without a token is untouched;
  - every console level is redacted, with other arguments passed through;
  - an `Error`'s message and stack are redacted;
  - a second call doesn't wrap twice;
  - the guard: it finds the signed-in specs (at least 5), and each one calls `redactClerkTokensInConsole();`.

```bash
npx vitest run scripts/e2e-clerk.test.ts
```
**Why:** the helper's tests: `15 passed` (7 new) at first, then `22 passed` after the review (the testing-token test and the 6 guard tests).

- **In a real Playwright worker:** two temporary specs printed the same **fake** warning, one without and one with the redaction:

```bash
cat > e2e/zz-redact-control.spec.ts <<'EOF'
import { test } from "@playwright/test";
test("prints a fake Clerk token (control, no redaction)", () => {
  console.warn("[Clerk Testing] FAPI request failed after 4 attempts: https://x.clerk.accounts.dev/v1/client?__clerk_db_jwt=dvb_FAKE_CONTROL (Error: route.fetch: Test ended.)");
});
EOF
cat > e2e/zz-redact-check.spec.ts <<'EOF'
import { test } from "@playwright/test";
import { redactClerkTokensInConsole } from "../scripts/e2e-clerk";
redactClerkTokensInConsole();
test("prints a fake Clerk token (redacted)", () => {
  console.warn("[Clerk Testing] FAPI request failed after 4 attempts: https://x.clerk.accounts.dev/v1/client?__clerk_db_jwt=dvb_FAKE_CHECK (Error: route.fetch: Test ended.)");
});
EOF
```
**Why:** creates the two temporary specs (fake tokens only).

```bash
npx playwright test e2e/zz-redact-control.spec.ts --reporter=list; npx playwright test e2e/zz-redact-check.spec.ts --reporter=list; CI= npx playwright test e2e/zz-redact-check.spec.ts --reporter=github
```
**Why:** the control printed `__clerk_db_jwt=dvb_FAKE_CONTROL`. With the redaction it printed `__clerk_db_jwt=<redacted>`, also through CI's `github` reporter. They ran separately, because the patch lasts for the whole worker process.

```bash
rm e2e/zz-redact-control.spec.ts e2e/zz-redact-check.spec.ts
```
**Why:** deletes them.

```bash
mutate() { cp "$1" <scratch>/mutant.bak && sed -i '' "$2" "$1" && npx vitest run "$3"; cp <scratch>/mutant.bak "$1"; }
```
**Why:** the mutation helper from task 67: plant a bug, run the tests, restore the file.

```bash
mutate scripts/e2e-clerk.ts 's/  return text.replace(CLERK_TOKEN, "$1<redacted>");/  return text;/' scripts/e2e-clerk.test.ts
```
**Why:** mutation 1, no redaction: 5 tests fail.

```bash
mutate scripts/e2e-clerk.ts '/  if (arg instanceof Error) {/,/^  }$/d' scripts/e2e-clerk.test.ts
```
**Why:** mutation 2, errors printed as they are: the `Error` test fails.

```bash
mutate scripts/e2e-clerk.ts '/  redacted.add(target);/d' scripts/e2e-clerk.test.ts
```
**Why:** mutation 3, wrapping twice: the "second time" test fails.

```bash
mutate e2e/tryon-live.spec.ts '/^redactClerkTokensInConsole();$/d' scripts/e2e-clerk.test.ts
```
**Why:** mutation 4, a signed-in spec forgetting the redaction: the guard's "tryon-live.spec.ts turns on token redaction" fails.

```bash
mutate scripts/e2e-clerk.ts 's/(?:__clerk_db_jwt|__clerk_testing_token)=/__clerk_db_jwt=/' scripts/e2e-clerk.test.ts
```
**Why:** mutation 5, the testing token not redacted: its test fails. Every file was restored afterwards.

```bash
npm run build && { npm run lint; echo "lint exit code: $?"; }
```
**Why:** build, then lint after it (task 64's ESLint ignore for the copied MediaPipe files): `lint exit code: 0`.

```bash
npm run typecheck && npm test
```
**Why:** `Test Files 61 passed`, `Tests 795 passed` (14 new).

```bash
npm run test:e2e > <scratch>/e2e.log 2>&1; grep -E '__clerk_(db_jwt|testing_token)=' <scratch>/e2e.log | grep -cv '=<redacted>'
```
**Why:** the whole E2E suite: `31 passed, 11 skipped` (the skipped specs need CI's seeded database), with **0** lines holding an unredacted token. The output goes to a file, so nothing reaches the terminal.

```bash
bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the git-safety hook's tests: `Failures: 0`.

## 6. Commit, publish, PR, auto-merge

```bash
git add scripts/e2e-clerk.ts scripts/e2e-clerk.test.ts e2e/signed-in.spec.ts e2e/tryon-live.spec.ts e2e/admin-models.spec.ts e2e/tryon-camera.spec.ts e2e/tryon-loading.spec.ts docs/task-list.md docs/learning/71_quiet_clerk_testing_logs.md
```
**Why:** stages this task's files.

```bash
git commit -m "71_quiet_clerk_testing_logs Redact Clerk session tokens in E2E output"
```
**Why:** saves the snapshot.

```bash
git push -u origin 71_quiet_clerk_testing_logs
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 71_quiet_clerk_testing_logs --title "71_quiet_clerk_testing_logs Redact Clerk session tokens in E2E output" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Count secrets, don't print them.** Send output to a file and `grep -c`, so checking for a leak can't cause one.
- **When a failure depends on timing you can't control,** make the bad outcome impossible (redaction) rather than chasing the timing.
- **Third-party test tools can log secrets.** Check what they print before trusting a public CI log.
- **A console patch lasts for the whole worker process.** Run a with/without comparison as separate runs, or the control gets patched too.
- **A new signed-in spec must call `redactClerkTokensInConsole()` too.** The guard test fails if it doesn't.
- **The CI half of the row** ("CI log has no `__clerk_db_jwt` values") can only be confirmed on this PR's own CI run. Check it with `gh run view <id> --log | grep '__clerk_db_jwt=' | grep -cv '<redacted>'`.
