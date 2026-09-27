# 32 Add the admin products list

**Branch:** `32_add_admin_products_list` (starts from `main`)
**Goal:** `/admin/products`, an admin-only table of every product (including hidden ones). It's the first **protected page**, using `requireAdmin()` from task 24.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #31 (task 31, `lib/products.ts`).

```bash
git checkout -b 32_add_admin_products_list
```
**Why:** new task, new branch.

```bash
mkdir -p app/admin/products
```
**Why:** in the App Router, the folder path is the URL. `app/admin/products/page.tsx` becomes `/admin/products`.

## 2. `app/admin/products/page.tsx`

- An **async Server Component**. Its first line is `await requireAdmin()`:
  - signed out → redirected to `/sign-in` (with a return URL);
  - signed in but not an admin → 404.
- Then `listAllProducts()`, shown as a table: **Name, Category** (`UPPER`/`LOWER`/`OVERALL` shown as Top/Bottom/Dress), **Price** (`$29.99`, or `—` when there's none), **Status** (Visible/Hidden).
- **Empty state:** "No products yet."
- **Load error:** the `ProductError`'s friendly message in a `role="alert"` paragraph. The details stay in the server log (task 31).
- `metadata.title`: "Products · Admin · Mirror AI".

## 3. Tests

`app/admin/products/page.test.tsx` (Vitest):
- **Async page trick:** `render(await AdminProductsPage())`. Call the Server Component, then render the JSX it returns. This works because its children aren't async.
- **Mocks:** `@/lib/auth` and `@/lib/products` (the real `ProductError` is kept via `vi.importActual`).
- **Cases:**
  - the access check runs **before** products load (a non-admin's 404 stops everything);
  - a list with a visible and a hidden product;
  - the empty state;
  - the friendly error.

`e2e/admin-products.spec.ts` (real build and real Clerk):
- A signed-out visit to `/admin/products` ends on `/sign-in`, and the URL remembers `/admin/products` for after sign-in.
- It needs no database: `requireAdmin()` redirects before any query.
- **Not covered by E2E:** "a signed-in non-admin gets a 404". That needs a signed-in test user (Clerk's testing package, not approved), so it's covered by the unit test and by `lib/auth.test.ts` instead.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** `Tests 96 passed` (5 new, including a generic-error fallback).

```bash
npm run test:e2e
```
**Why:** `10 passed` (1 new).

```bash
cp app/admin/products/page.tsx /tmp/adminpage.bak
```
**Why:** saves the good page before planting the most dangerous bug.

```bash
sed -i '' 's/^  await requireAdmin();/  \/\/ planted: auth check removed/' app/admin/products/page.tsx
```
**Why:** plants the bug: the admin page is **public**.

```bash
npm test
```
**Why:** must fail. Got `× checks admin access before loading products`.

```bash
npx playwright test e2e/admin-products.spec.ts
```
**Why:** must fail too. The page didn't redirect, tried the (unconfigured) database, and logged `listAllProducts failed: PrismaClientInitializationError`, which also shows the friendly-error path works.

```bash
cp /tmp/adminpage.bak app/admin/products/page.tsx
```
**Why:** restores the page. The unit tests and the E2E test pass again.

```bash
npm run lint && npm run typecheck && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` already covered the build.

## 4. Commit, publish, PR, auto-merge

```bash
git add app/admin e2e/admin-products.spec.ts docs/learning/32_add_admin_products_list.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "32_add_admin_products_list Add admin-only products list page"
```
**Why:** saves the snapshot.

```bash
git push -u origin 32_add_admin_products_list
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 32_add_admin_products_list --title "32_add_admin_products_list Add admin-only products list page" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **To see real data:** set your `DATABASE_URL` (task 30), make yourself an admin (Clerk dashboard → Users → you → **Public metadata** `{"role": "admin"}`), then open `/admin/products`.
- **Protection is per page** (task 24). The planted test shows what happens if `requireAdmin()` is forgotten.
