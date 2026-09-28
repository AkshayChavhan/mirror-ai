# 55 Delete a product's images with it

**Branch:** `55_cleanup_images_on_product_delete` (starts from `main`)
**Goal:** deleting a product also deletes its Cloudinary images: the garment image, **and** the person photos and results of its try-ons.
- Before this, the product row's cascade removed its try-on rows, but their photos stayed on Cloudinary forever. The 24 h cleanup (task 51) finds photos only through try-on rows, so it could never see them.
- This task was added by task 38's review, and approved by the developer on 2026-09-28. Task 41 no longer waits for it.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #48 (task 54).

```bash
git checkout -b 55_cleanup_images_on_product_delete
```
**Why:** new task, new branch.

```bash
grep -rn "deleteProduct" app lib | grep -v "\.test\."
```
**Why:** finds every caller of the old row-only delete. There's one: `deleteProductAction` in `app/admin/products/actions.ts`.

## 2. `lib/product-cleanup.ts`: `deleteProductAndImages(id)`

It runs in order:
1. **Hide the product** (`isActive: false`). The "Try on" action (task 38) refuses hidden products, so **no new try-on can start** once it's hidden (found in review). A request that already passed its check a moment earlier can still finish (see Gotchas).
2. **Load** the product's garment URL and every try-on's `personUrl`/`resultUrl`, all in one query. A malformed id or an unknown product gives `NOT_FOUND`. A DB error gives a friendly `DB_ERROR`, and is logged.
3. **Delete every try-on photo**, **5 at a time**, so a product with many try-ons doesn't send hundreds of Cloudinary calls at once.
   - **If any fails, it stops there:** the garment and the row are kept, and the product stays hidden.
   - It throws the new `ProductError` code **`IMAGES_NOT_DELETED`**, "…It's hidden from shoppers now; please try deleting it again.", and logs it.
   - Rows must never disappear while their photos remain. `deleteImage` treats "not found" as deleted, so retrying is safe.
4. **Delete the garment image.** It isn't personal data, so a failure is logged but doesn't block the delete.
5. **Delete the row** with the existing `deleteProduct(id)`. That cascades to the product's try-ons and wishlist items.

- **Safety:** only ids in the right folder are deleted: `mirror-ai/people/` or `mirror-ai/results/` for try-on photos, `mirror-ai/garments/` for the garment. Anything else is logged and skipped, so one odd URL can't block a delete forever. This is the same rule as the cleanup job.
- **`app/admin/products/actions.ts`:** `deleteProductAction` now calls `deleteProductAndImages(id)`. The admin sees any friendly message, including "try again". On `IMAGES_NOT_DELETED` it also refreshes the list, so the product shows as hidden.

## 3. Tests

- **`lib/product-cleanup.test.ts`** (the DB, `deleteImage` and `deleteProduct` mocked; the real `publicIdFromUrl` and `ProductError`):
  - **the product is hidden first**, before loading (the call order is checked);
  - every try-on photo and the garment are deleted **before** the row (the call order is checked), and a missing result is skipped;
  - no try-ons means just the garment and the row;
  - **a failed try-on photo stops the delete** (the garment and the row are kept), with `IMAGES_NOT_DELETED` and a log line;
  - only a garment failure still deletes the product, and is logged;
  - an image outside its folder is never deleted, and is logged;
  - **12 photos are all deleted, never more than 5 at once**;
  - a malformed id makes no DB or Cloudinary call;
  - an unknown product gives `NOT_FOUND`, deleting nothing;
  - a load error gives `DB_ERROR`, and is logged;
  - an error while hiding gives `DB_ERROR`, deleting nothing;
  - the row delete's own error is passed on.
- **`app/admin/products/actions.test.ts`:** the delete tests now mock `deleteProductAndImages`, plus a new one: `IMAGES_NOT_DELETED` shows its message **and refreshes the list**, since the product is now hidden.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run lib/product-cleanup.test.ts app/admin/products lib/products.test.ts
```
**Why:** runs this task's tests and its neighbours: `91 passed`.
- On the first run, an edited test file had a stray `});`. A Python edit searched for `  });` to find the end of a block, but that text also appears inside the more-indented `    });`. It was fixed by hand.

```bash
cp lib/product-cleanup.ts /tmp/pc.bak
```
**Why:** saves the good file before planting bugs. Each bug below is undone by copying the backup back.

```bash
sed -i '' 's/^  if (failed > 0) {$/  if (false) {/' lib/product-cleanup.ts
```
**Why:** plants a **privacy bug**: the product would be deleted even when photos couldn't be.

```bash
npx vitest run lib/product-cleanup.test.ts
```
**Why:** must fail. Got `1 failed`: `× stops … if a try-on photo can't be deleted…`.

```bash
cp /tmp/pc.bak lib/product-cleanup.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/^  const failed = await deleteTryOnPhotos(photoUrls);$/  const failed = 0;/' lib/product-cleanup.ts
```
**Why:** plants the original bug: try-on photos aren't deleted at all.

```bash
npx vitest run lib/product-cleanup.test.ts
```
**Why:** must fail. Got `4 failed`.

```bash
cp /tmp/pc.bak lib/product-cleanup.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/^  if (!publicId || !folders.some((folder) => publicId.startsWith(folder))) {$/  if (!publicId) {/' lib/product-cleanup.ts
```
**Why:** plants a **safety bug**: an image outside its folder could be deleted.

```bash
npx vitest run lib/product-cleanup.test.ts
```
**Why:** must fail. Got `1 failed`: `× never deletes an image outside its folder…`.

```bash
cp /tmp/pc.bak lib/product-cleanup.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/^    await prisma.product.updateMany({ where: { id }, data: { isActive: false } });$/    \/\/ hide step removed/' lib/product-cleanup.ts
```
**Why:** plants the **race** the review found: without hiding first, new try-ons could start during the delete.

```bash
npx vitest run lib/product-cleanup.test.ts
```
**Why:** must fail. Got `2 failed`.

```bash
cp /tmp/pc.bak lib/product-cleanup.ts
```
**Why:** restores the file. All 12 tests pass.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 384 passed` (13 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `17 passed`.

```bash
npm run build
```
**Why:** confirms the production build on its own too.

## 4. The task list

- 55 ✅.
- The developer's approvals from 2026-09-28 are recorded: **56**, **57** (still needs its number), and two new rows:
  - **58** `@clerk/testing@2.2.39`, for signed-in E2E;
  - **59** housekeeping: the stray `pnpm-lock.yaml`, and the Prisma `npm audit` finding.
- The blocker "41 waits for 55" is removed.
- In "Later", the Prisma audit line moved to task 59, and the task 55 note now says "Done".

## 5. Commit, publish, PR, auto-merge

```bash
git add lib/product-cleanup.ts lib/product-cleanup.test.ts lib/products.ts app/admin/products/actions.ts app/admin/products/actions.test.ts docs/learning/55_cleanup_images_on_product_delete.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "55_cleanup_images_on_product_delete Delete a product's images before its rows"
```
**Why:** saves the snapshot.

```bash
git push -u origin 55_cleanup_images_on_product_delete
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 55_cleanup_images_on_product_delete --title "55_cleanup_images_on_product_delete Delete a product's images before its rows" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Delete photos first, rows last, and stop if any photo delete fails.** Otherwise the photos lose the only thing that points at them.
- **Two tiny races remain.** Hiding first stops *new* try-ons, but two kinds already in flight can still write a photo after step 2's load and before the row delete. That photo would then be left behind. The folder sweep (still to decide) would catch both:
  - a "Try on" request that passed its `isActive` check just before the hide, and is still uploading its photo;
  - a try-on job already running, which saves its result.
- **Hiding first changes what "failed" means:** if photos can't be deleted, the product is left **hidden** rather than untouched. That fits, since the admin was deleting it anyway.
- **When editing a file with a script, don't use indentation as a marker** (`"  });"` also matches inside `"    });"`). Use a unique line, or the editor.
