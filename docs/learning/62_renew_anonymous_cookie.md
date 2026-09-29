# 62 Renew the anonymous cookie on save

**Branch:** `62_renew_anonymous_cookie` (starts from `main`)
**Goal:** a signed-out visitor's wishlist cookie (`mirror_anon_id`, task 47) lasts **1 year from their last save**, not from their first.
- **Before:** the cookie was set only when the id was created. Someone who kept visiting and saving would still lose their list exactly a year after their *first* save.
- **Now:** every save sets the same id again with a fresh 1-year lifetime, so only a year *without saving* lets it expire.
- The developer chose "renew on save" on 2026-09-29.

## 1. Create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #57 (task 61). That PR changed row 61, right next to row 62, so waiting for it avoids a conflict in `docs/task-list.md`.

```bash
git checkout -b 62_renew_anonymous_cookie
```
**Why:** new task, new branch.

```bash
grep -rn "getOrCreateAnonymousId" app lib | grep -v "\.test\."
```
**Why:** checks who calls it. Only `addToWishlistAction` does, after its product checks and only when signed out. So "every call" means "every signed-out save", which is exactly when to renew.

## 2. The change (`lib/anonymous-id.ts`)

```ts
const id = (await getAnonymousId()) ?? randomUUID();
(await cookies()).set(ANONYMOUS_ID_COOKIE, id, {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ONE_YEAR_SECONDS,
});
```
- **Same id, new expiry:** a valid existing id is kept, so it's the same list. Setting a cookie with the same name and path replaces the old one, including its expiry.
- A missing or tampered cookie still gets a new random id, as before.
- The cookie options are unchanged: `httpOnly`, `sameSite: "lax"`, `secure` in production, a 1-year `maxAge`.
- Setting cookies is allowed here because it runs inside a Server Action (Next 16 only allows it in Server Actions and Route Handlers).
- **A save that then fails** (for example a full wishlist, task 57) still renews the cookie. The visitor is clearly active, so that's fine.

## 3. Tests

- **`lib/anonymous-id.test.ts`:** the old test "reuses a valid existing id **without** setting a cookie" became "keeps a valid existing id, and **renews** its cookie for another full year". It checks the exact options, `maxAge: 31_536_000` included. The creation, tampered-cookie, production-HTTPS and unique-id tests still pass unchanged.
- **`e2e/seeded-data.spec.ts`** (CI's seeded database): a browser with a cookie for **its own random id** that **ends tomorrow** saves a garment. Afterwards the cookie has the **same id** and expires **more than 364 days from now**.
  - This checks the real browser, which the mocked unit test can't.
  - The random id keeps its saved item away from the seeded wishlist another spec checks (tests run in parallel against one database).

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run anonymous-id wishlist
```
**Why:** runs the cookie and wishlist tests: `6 passed`, `77 passed`.

```bash
cp lib/anonymous-id.ts <scratch>/anonymous-id.ts.bak && perl -0pi -e 's/  const id = \(await getAnonymousId\(\)\) \?\? randomUUID\(\);\n/  const existing = await getAnonymousId();\n  if (existing) return existing;\n  const id = randomUUID();\n/' lib/anonymous-id.ts && npx vitest run lib/anonymous-id.test.ts; cp <scratch>/anonymous-id.ts.bak lib/anonymous-id.ts
```
**Why:** a mutation check. It puts back the old "reuse without renewing" code, the renewal test catches it (`1 failed`), and the file is restored. `<scratch>` is any temporary folder.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 477 passed`. The count is the same as on `main`, because one test was rewritten, not added.

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh && npm run build
```
**Why:** the rest of the checklist, and all of it passes. E2E locally: `19 passed, 7 skipped`: the seeded specs, including the new one, skip without a test database, and CI runs them.

## 4. Commit, publish, PR, auto-merge

```bash
git add lib/anonymous-id.ts lib/anonymous-id.test.ts app/wishlist/actions.ts app/wishlist/actions.test.ts e2e/seeded-data.spec.ts docs/task-list.md docs/learning/62_renew_anonymous_cookie.md
```
**Why:** stages this task's files.

```bash
git commit -m "62_renew_anonymous_cookie Renew the anonymous wishlist cookie on every save"
```
**Why:** saves the snapshot.

```bash
git push -u origin 62_renew_anonymous_cookie
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 62_renew_anonymous_cookie --title "62_renew_anonymous_cookie Renew the anonymous wishlist cookie on every save" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes, including the new cookie E2E test.

## Gotchas

- **A cookie is replaced by setting it again** with the same name and path. There's no separate "extend" call.
- **Setting a cookie in a Server Action makes Next re-render the current page** (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`; the UI isn't unmounted). Before, that happened only on a visitor's first save; now it happens on every signed-out save. It's harmless: the Save button's "Saved" state is kept (found in review).
- **The action's comment and test name** (`app/wishlist/actions.ts`, `actions.test.ts`) now say the save creates *or renews* the cookie.
- **Playwright cookie times are in seconds** (`expires`), while `Date.now()` is in milliseconds, so the test divides by 1000.
- **E2E tests share one database and run in parallel,** so a test that saves must use its own anonymous id, never the seeded one.
