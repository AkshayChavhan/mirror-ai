# 58 Add signed-in E2E tests with Clerk

**Branch:** `58_add_clerk_testing` (starts from `main`)
**Goal:** Playwright can **sign in** as two Clerk test users, so signed-in pages and the admin rule ("non-admins get a 404") are tested in a real browser.
- Until now, E2E could only test signed-out visitors (redirects to sign-in) and public pages.
- Package: **`@clerk/testing@2.2.39`** (dev dependency), pre-approved in the task list (approved 2026-09-28).
- The developer created the two test users in their Clerk **Development** instance on 2026-09-29.

## 1. Create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** run right after PR #60 (task 63) merged, so `main` is the latest.

```bash
git checkout -b 58_add_clerk_testing
```
**Why:** new task, new branch.

```bash
grep -n '"@clerk\|"@playwright\|"next"' package.json && npm view @clerk/testing@2.2.39 peerDependencies dependencies engines --json
```
**Why:** checks it fits: it needs `@playwright/test` ^1 (we have 1.63) and Node 20.9 or newer (we have 22). It depends on `@clerk/backend` ^3.20.1, the same version `@clerk/nextjs` 7.9.7 uses.

```bash
for k in CLERK_SECRET_KEY NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY; do for f in .env .env.local; do [ -f $f ] && echo "$f $k: $(grep -c "^$k=" $f) line(s), prefix: $(grep "^$k=" $f | sed -E 's/^[^=]+="?((sk|pk)_(test|live))?.*/\1/' | head -1)"; done; done
```
**Why:** checks the Clerk keys **by shape only** (never printing them): both are in `.env`, and they're development keys (`sk_test`, `pk_test`). There's no `.env.local`.

## 2. Install

```bash
npm install -D @clerk/testing@2.2.39
```
**Why:** adds the package as a dev dependency (`"^2.2.39"`; the lockfile pins 2.2.39).

```bash
npm ls @clerk/testing @clerk/backend
```
**Why:** shows `@clerk/testing@2.2.39` uses the **same** `@clerk/backend@3.20.1` as `@clerk/nextjs` ("deduped"), so there's no second copy.

```bash
npm audit
```
**Why:** npm reported "3 high" findings after the install. They're the **same accepted Prisma `deepmerge-ts` finding** documented in the README (task 59). The new package adds none.

## 3. How signing in works

- **Read from the installed package** (`node_modules/@clerk/testing/dist/types/playwright/*.d.ts`):
  - `clerkSetup()` fetches a **Testing Token** once, which gets past Clerk's bot protection in tests;
  - `clerk.signIn({ page, emailAddress })` **finds the user by email and signs them in with a one-time sign-in token** made with `CLERK_SECRET_KEY`.
  - So **no passwords** are needed anywhere: no password secrets, nothing for the developer to add.
- **`clerkSetup()` would load ALL of `.env`** into the test runner by default (it depends on `dotenv`). That would also bring in `DATABASE_URL`, and a placeholder `E2E_DATABASE_URL` copied from `.env.example` would switch on the seeded specs locally.
  - So it's called with **`dotenv: false`**, and the two Clerk keys are loaded by our own helper instead.
- **`scripts/e2e-clerk.ts`:**
  - `E2E_USERS`: `e2e-user+clerk_test@example.com` and `e2e-admin+clerk_test@example.com` (`publicMetadata {"role":"admin"}`). Clerk's `+clerk_test` emails never send real mail, and their code is `424242`.
  - `loadClerkKeys()`: reads `.env.local` then `.env` with Node's built-in **`util.parseEnv`** (no extra package), and copies **only** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` into `process.env`. It never overrides keys that are already set, so CI's secrets win.
  - `assertTestClerkKey()`: refuses anything but a development key (`sk_test_…`), because sign-in tokens must never be made for real users. Its error never repeats the key. (`clerkSetup`'s type comment says production keys are refused too, but the installed code has no such check, so ours is the one that counts.)
- **`e2e/global-setup.ts`:** it seeds the test database (task 60) as before, then:
  - with Clerk keys: it checks the key, runs `clerkSetup({ dotenv: false })` (which sets `CLERK_FAPI` and `CLERK_TESTING_TOKEN`; values set in global setup reach the tests), and logs "Clerk testing token ready";
  - without keys: locally it logs and the signed-in specs skip. **In CI it fails loudly**, so those specs can never be skipped by accident.
  - It used to `return` early when there was no test database. It's now split into two functions, so the Clerk part always runs.
- **`e2e/signed-in.spec.ts`:** it skips without `CLERK_TESTING_TOKEN`. Each test opens `/` (a public page that loads Clerk), runs `clerk.signIn({ page, emailAddress })`, then visits:
  - `/history` as the user: stays there, with the heading "Your try-ons";
  - `/tryon` as the user: the heading "Try it on";
  - `/admin/products` and `/new` as the **non-admin user: HTTP 404**, and no "Products" heading. With the seeded database (CI), also the **edit page of the seeded shirt**;
  - `/admin/products` as the **admin: HTTP 200** and the "Products" heading, plus (CI) the same seeded edit page: **200**.
  - **Why the seeded product:** an edit page for a made-up id is a 404 for everyone ("no such product"), so it couldn't prove the admin check. With a real product, the admin gets the form and the non-admin a 404 (found in review).
  - **`test.use({ trace: "off" })`** at the top of this spec (inside a `describe` Playwright refuses it: "Cannot use({ trace }) in a describe group, because it forces a new worker"): **the repo is public**, and CI uploads `test-results/` when a run fails. A trace from a retried test would contain the test users' **session cookies** (the admin's included) and the testing token (found in review).
- **CI:** `ci.yml` already passes `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from the repo secrets. No new env vars: the testing token is fetched at run time.

```bash
gh secret list
```
**Why:** checks both secrets exist in the repo. GitHub shows only names and dates, never values.
- **`.claude/agents/rules-reviewer.md`, check 14:** "Admin pages also need a non-admin 404 test" is now a firm rule pointing at `e2e/signed-in.spec.ts`, instead of "once signed-in E2E is set up".
- **`docs/task-list.md`:** row 58 ✅, and the blockers for 58 and for 42/43 are removed.

## 4. The tests caught a real setup mistake

The first local run: both user tests passed, but the admin tests were **exactly reversed**. The "user" saw the admin page, and the "admin" got a 404.

```ts
// .check-clerk-users.mts (throwaway, read-only)
import { createClerkClient } from "@clerk/backend";
import { E2E_USERS, assertTestClerkKey, loadClerkKeys } from "./scripts/e2e-clerk.ts";

if (!loadClerkKeys()) throw new Error("No Clerk keys");
assertTestClerkKey(process.env.CLERK_SECRET_KEY ?? "");
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
for (const email of Object.values(E2E_USERS)) {
  const { data } = await clerk.users.getUserList({ emailAddress: [email] });
  console.log(email, "->", data.length, "user(s); publicMetadata:", JSON.stringify(data[0]?.publicMetadata ?? null));
}
```

```bash
node --experimental-strip-types --no-warnings ./.check-clerk-users.mts && rm ./.check-clerk-users.mts
```
**Why:** a throwaway **read-only** script (in the repo root only while it ran, deleted right after). It printed each test user's email and `publicMetadata`, using `@clerk/backend`'s `users.getUserList({ emailAddress })` and our key loader. It never prints the key. It showed `{"role":"admin"}` on `e2e-user` and `{}` on `e2e-admin`: the role was on the wrong account. The developer swapped it in the Clerk dashboard. The script, recreated for a second run (and deleted again), confirmed it, and all 4 tests passed.

## 5. Tests

- **`scripts/e2e-clerk.test.ts`** (throwaway env files in a temp folder, obviously fake keys like `sk_test_x`):
  - only the two Clerk keys are loaded, never `DATABASE_URL` or `E2E_DATABASE_URL`;
  - existing keys are never overridden;
  - `.env.local` beats `.env`;
  - a missing key or file gives `false`;
  - production and empty keys are refused without repeating them;
  - the users are `+clerk_test@example.com` emails.
- **`e2e/signed-in.spec.ts`:** the 4 tests above, run against the developer's Clerk Development instance.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run scripts/e2e-clerk.test.ts
```
**Why:** the helper's unit tests: `8 passed`.

```bash
npx playwright test e2e/signed-in.spec.ts --reporter=line
```
**Why:** runs only the signed-in specs, with a readable line per test. First run: `2 failed` (the swapped role, above). After the fix: `4 passed`.

```bash
npm test
```
**Why:** runs the whole unit suite: `Test Files 48 passed`, `Tests 507 passed` (8 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh && npm run build
```
**Why:** the rest of the checklist, and all of it passes. Locally `test:e2e` now also runs the 4 signed-in specs, because the Clerk keys are in `.env`: `23 passed, 7 skipped` (the seeded specs need CI's database).

## 6. Commit, publish, PR, auto-merge

```bash
git add package.json package-lock.json scripts/e2e-clerk.ts scripts/e2e-clerk.test.ts e2e/global-setup.ts e2e/signed-in.spec.ts .claude/agents/rules-reviewer.md docs/task-list.md docs/learning/58_add_clerk_testing.md
```
**Why:** stages this task's files.

```bash
git commit -m "58_add_clerk_testing Add signed-in E2E tests with Clerk test users"
```
**Why:** saves the snapshot.

```bash
git push -u origin 58_add_clerk_testing
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 58_add_clerk_testing --title "58_add_clerk_testing Add signed-in E2E tests with Clerk test users" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes. CI signs in with the repo's Clerk secrets.

## Gotchas

- **`clerkSetup()` loads all of `.env` unless `dotenv: false`.** Load only what the tests need.
- **Sign in by email, not password,** with `clerk.signIn({ page, emailAddress })`. No passwords to store, but it needs `CLERK_SECRET_KEY` in the test process.
- **`clerk.signIn` needs a page that loads Clerk first**: open `/`, then sign in, then go to the protected page.
- **Metadata on the wrong user** looks like an app bug, with admin and non-admin behaviour exactly swapped. Check the users' `publicMetadata` before touching code.
- **Fake keys in tests:** keep them short and obviously fake (`sk_test_x`), so no secret scanner mistakes them for real ones.
- **No traces for signed-in tests in a public repo.** Traces hold cookies, and CI uploads failed runs' results.
- **A 404 check proves nothing if the page is a 404 for everyone.** Test against something the allowed user *can* open.
