# 34 Add admin product delete and hide/show

**Branch:** `34_add_admin_product_delete` (starts from `main`)
**Goal:** from the admin list, an admin can **hide/show** a product (`isActive`) or **delete** it, with a confirmation.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #33 (task 33, the product form).

```bash
git checkout -b 34_add_admin_product_delete
```
**Why:** new task, new branch.

## 2. Server Actions (`app/admin/products/actions.ts`)

- `assertBoundId(id)` is a new shared helper. It checks that a bound id is a **string and a 24-hex ObjectId**. It's now also used by `updateProductAction`.
- `deleteProductAction(id)`: `requireAdmin()` → `assertBoundId` → `deleteProduct` (try-ons and wishlist items cascade, task 21) → `revalidatePath("/admin/products")` → `{ error: null }`.
- `setProductActiveAction(id, isActive)`: `requireAdmin()` → `assertBoundId` → `isActive` must be a real boolean (it comes from the browser) → `updateProduct(id, { isActive })` → revalidate.
- Both return `{ error }` with friendly messages (`toFormState`), and never throw raw errors to the client.
- They return state instead of redirecting, because the admin stays on the list page, and `revalidatePath` refreshes it.

## 3. `ProductRowActions.tsx` (`"use client"`)

- Buttons: **Hide/Show** and **Delete**, with `aria-label`s like "Hide Linen Shirt" / "Delete Linen Shirt".
- `useTransition` disables the buttons while an action runs.
- **Delete asks first** with `window.confirm("Delete "<name>"? This also removes its try-ons and wishlist entries.")`. Next's Server Actions guide says destructive operations deserve stronger handling.
- The error from the action shows inline in a `role="alert"` span. If the call itself fails (for example a network drop), it's caught and shows "Something went wrong. Please try again." instead of crashing to an error boundary.
- The list page renders it next to the Edit link in every row.

## 4. Tests

- **`actions.test.ts`** (+11):
  - delete: admin-first, success + revalidate, a malformed id (no database call), already deleted;
  - hide/show: admin-first, true/false + revalidate, a non-boolean from the browser, a malformed id, and database `NOT_FOUND`/`DB_ERROR` shown as friendly errors (the reviewer's blocking find).
- **`ProductRowActions.test.tsx`** (6):
  - hide calls `(id, false)`, show calls `(id, true)`;
  - **cancelled confirm → no delete**;
  - confirmed → delete;
  - the error is shown;
  - a failed call (network drop) shows a friendly message.
- **`page.test.tsx`:** the row buttons are mocked and placed in each row, with the right name and state.
- **No new E2E test:** the buttons need a signed-in admin (that would need Clerk's testing package, not approved). The existing `e2e/admin-products.spec.ts` already covers this page's signed-out redirect.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** `Tests 139 passed` (17 new).

```bash
cp app/admin/products/ProductRowActions.tsx /tmp/rowactions.bak
```
**Why:** saves the good file before planting a bug.

```bash
python3 -c "p='app/admin/products/ProductRowActions.tsx'; s=open(p).read(); open(p,'w').write(s.replace('    if (!window.confirm(', '    if (false && !window.confirm('))"
```
**Why:** plants the bug: the confirmation is **skipped**, so one click deletes.

```bash
npm test
```
**Why:** must fail. Got `× does NOT delete when the confirmation is cancelled`.

```bash
cp /tmp/rowactions.bak app/admin/products/ProductRowActions.tsx
```
**Why:** restores the file. All tests pass.

```bash
npm run build && npm run test:e2e
```
**Why:** the build passes, and all 12 E2E tests pass (the admin routes still redirect signed-out visitors).

```bash
npm run lint && npm run typecheck && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist.

## 5. Commit, publish, PR, auto-merge

```bash
git add app/admin docs/learning/34_add_admin_product_delete.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "34_add_admin_product_delete Add admin delete and hide/show with confirmation"
```
**Why:** saves the snapshot.

```bash
git push -u origin 34_add_admin_product_delete
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 34_add_admin_product_delete --title "34_add_admin_product_delete Add admin delete and hide/show with confirmation" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Deleting a product doesn't delete Cloudinary images:** not its garment image, and not the photos of its cascade-deleted try-ons. That matters for the 24 h privacy promise, so it's in the task list's "Later" section as **must fix before tasks 38–39**.
- **Prefer "Hide" over "Delete".** Hiding keeps history and wishlist entries, while deleting removes them.
