# 33 Add the admin product form

**Branch:** `33_add_admin_product_form` (starts from `main`)
**Goal:** admins can **create** and **edit** products, including uploading the garment image to Cloudinary, through one form and two Server Actions.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #32 (task 32, the admin list).

```bash
git checkout -b 33_add_admin_product_form
```
**Why:** new task, new branch.

## 2. Read the Next 16 Server Actions docs first

```bash
grep -rln -i 'bodySizeLimit' node_modules/next/dist/docs/01-app
```
**Why:** finds the guide and the config reference for Server Actions limits.

```bash
grep -n -i -B3 -A12 'bodySizeLimit' node_modules/next/dist/docs/01-app/02-guides/server-actions.md
```
**Why:** three rules that shaped this task:
- **Body size limit: 1 MB by default.** Garment images can be bigger, so the limit is raised to `6mb` (5 MB image + form fields) in `next.config.ts`.
- **"Render-time gating is not a security boundary"**, meaning a form shown only on an admin page doesn't protect the action behind it. So **each action calls `requireAdmin()` itself**.
- **"Treat `FormData` … as untrusted"**, so it's validated in the action and in `lib/products`.

```bash
grep -v '^$' node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md | sed -n 1,40p
```
**Why:** the exact config shape: `experimental.serverActions.bodySizeLimit`.

## 3. Files

```bash
mkdir -p app/admin/products/new "app/admin/products/[id]/edit"
```
**Why:** routes `/admin/products/new` and `/admin/products/<id>/edit`. `[id]` is a dynamic segment, quoted for the shell.

| File | Role |
|---|---|
| `next.config.ts` | `experimental.serverActions.bodySizeLimit: "6mb"` |
| `app/admin/products/actions.ts` | `"use server"`: `createProductAction` and `updateProductAction` |
| `app/admin/products/ProductForm.tsx` | `"use client"` form with `useActionState` (shows errors and a "Saving…" state) |
| `app/admin/products/new/page.tsx` | `requireAdmin()`, then an empty form |
| `app/admin/products/[id]/edit/page.tsx` | `requireAdmin()`, then `await params` (a **Promise in Next 16**), then `getProduct()` (or `notFound()`), then a prefilled form |
| `app/admin/products/page.tsx` | Adds a "New product" link, plus an "Edit" link per row (`aria-label="Edit <name>"`) |

**Each action:**
1. `await requireAdmin()` comes **first**.
2. Reads the fields:
   - an empty price → `null`;
   - the checkbox `"on"` → `isActive: true`.
   - **Validates them before uploading** (`validateProductInput(fields, true)`), so a typo never leaves an unused image in Cloudinary.
   - For edits, it checks that the bound `id` is a string **and** a valid 24-hex ObjectId before any upload, because it comes back from the browser.
3. Checks the image: required when creating, optional when editing (the old image is kept), must be `image/*`, and ≤5 MB. `file.type` is set by the browser, so Cloudinary's `resource_type: "image"` is the real content check.
4. Uploads the image as a data URI to the `mirror-ai/garments` folder (`uploadImage` from task 26).
5. Calls `createProduct` / `updateProduct` (task 31 validates).
6. On success, `revalidatePath("/admin/products")` + `redirect("/admin/products")`. On an error, it returns `{ error }` with a **friendly** message (from `FormError`, `ProductError`, or `ImageUploadError`). Anything unexpected shows a generic message and is logged.

**A `"use server"` file may only export async functions** (types are fine). So `MAX_IMAGE_BYTES` is **not exported**, because exporting it would break the build.

**Accessibility:**
- The image hint sits **outside** the `<label>` and is linked with `aria-describedby`, so the field's accessible name stays "Garment image".
- The Edit links use `aria-label`, so screen readers hear "Edit Linen Shirt".

## 4. Tests

- **`actions.test.ts`** (Node env; auth, Cloudinary, database, `redirect`, and `revalidatePath` mocked; the **real** `validateProductInput` is kept). 18 cases:
  - the admin check runs before anything else (create and update);
  - a full create: data-URI upload to the folder, parsed fields, revalidate, redirect;
  - empty price → `null`, unticked box → hidden;
  - no image, empty, non-image, or over 5 MB → friendly errors with **no upload**;
  - invalid fields rejected **before** any upload (create and update);
  - a tampered non-string or malformed `id` rejected before any upload;
  - validation and upload messages passed through;
  - unexpected errors → generic message and a log;
  - update keeps the image or replaces it;
  - `NOT_FOUND` passed through.
- **`ProductForm.test.tsx`:** create mode, edit mode (prefilled, image optional), and the action's error shown in `role="alert"`.
- **`new/page.test.tsx`, `[id]/edit/page.test.tsx`:** admin-only (checked before loading), a 404 for an unknown product, and the prefilled form.
- **`page.test.tsx`** (list): Edit and New links.
- **`e2e/admin-products.spec.ts`:** signed-out redirect to `/sign-in` for `/admin/products`, `/new`, and `/<id>/edit`.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** the first run had 3 failures, all about **accessible names**: two because the image label contained its hint text, and one because of the Edit link's hidden text. After the fixes above, plus the review's changes: `Tests 122 passed` (26 new).

```bash
npm run build
```
**Why:** checks the config and the `"use server"` rules compile. The admin routes show as `ƒ` (dynamic), as expected for pages that check login.

```bash
npm run test:e2e
```
**Why:** `12 passed` (2 new redirects).

```bash
cp app/admin/products/actions.ts /tmp/actions.bak
```
**Why:** saves the good file before planting a bug.

```bash
python3 -c "p='app/admin/products/actions.ts'; s=open(p).read(); a='): Promise<ProductFormState> {\n  await requireAdmin();'; open(p,'w').write(s.replace(a, '): Promise<ProductFormState> {\n  // planted: auth removed', 1))"
```
**Why:** plants the bug by removing `await requireAdmin();` from the **first** action (`createProductAction`). `replace(..., 1)` changes only the first match.

```bash
npm test
```
**Why:** must fail. Got `× checks admin access before anything else`. Without it, **anyone could call the action directly**, even without seeing the page.

```bash
cp /tmp/actions.bak app/admin/products/actions.ts
```
**Why:** restores the file. All tests pass.

```bash
npm run lint && npm run typecheck && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist.

## 5. Commit, publish, PR, auto-merge

```bash
git add next.config.ts app/admin e2e/admin-products.spec.ts docs/learning/33_add_admin_product_form.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "33_add_admin_product_form Add admin create/edit product form with image upload"
```
**Why:** saves the snapshot.

```bash
git push -u origin 33_add_admin_product_form
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 33_add_admin_product_form --title "33_add_admin_product_form Add admin create/edit product form with image upload" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Server Actions are public endpoints.** Always authenticate inside the action.
- **`params` is a Promise** in Next 16 pages: `const { id } = await params`.
- **Real use needs** `DATABASE_URL` (task 30), Cloudinary keys in `.env`, and your Clerk user's `publicMetadata.role = "admin"`.
