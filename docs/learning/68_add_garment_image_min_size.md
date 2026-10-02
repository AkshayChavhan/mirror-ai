# 68 Add garment image minimum size

**Branch:** `68_add_garment_image_min_size` (starts from `main`)
**Goal:** the admin product form refuses garment images **smaller than 512 px** in width or height, with a clear message, because tiny images give poor try-ons (a 161 × 148 image did).
- Approved by the developer on 2026-10-01.
- No new packages.

## 1. Branch and setup

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #67 (task 67).

```bash
git checkout -b 68_add_garment_image_min_size
```
**Why:** new task, new branch.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 (`.nvmrc`) in a shell where `fnm` isn't on the PATH.

## 2. How it works

- **Where the size comes from:** Cloudinary measures every image while uploading and returns `width` and `height`. `uploadImage` already passed them on, so there's no new image-reading code or package, and any format Cloudinary accepts works.
- **`app/admin/products/actions.ts` → `uploadChosenImage`:** after the upload, if `width < 512 || height < 512`:
  - it **deletes the upload** (`deleteImage(publicId)`, which never throws and logs a failure), so a refused image doesn't stay on Cloudinary;
  - it refuses with "The garment image must be at least 512 × 512 pixels (this one is W × H). Small images give poor try-ons.", showing the real size so the admin knows how far off it is.
  - Exactly 512 is accepted.
- **Order:** in both create and edit, the image is uploaded and measured **before** the 3D model is uploaded (task 67), so a refused image never leaves an orphan model. The model's own check (no upload) still runs first.
- **Edit:** only a newly chosen replacement image is measured. Existing products keep their images.
- **`ProductForm.tsx`:** the image hint now says "at least 512 × 512 pixels, up to 5 MB".

## 3. Tests

- **`app/admin/products/actions.test.ts`:**
  - the fake upload's default size became 800 × 1200 (it was 1 × 1, which the new check would refuse);
  - refused: too narrow (511 × 800), too short (800 × 511) and tiny (161 × 148), each with its size in the message, the upload deleted, and nothing saved;
  - accepted: exactly 512 × 512 and 513 × 2000, with nothing deleted;
  - a too-small replacement on edit is refused and deleted, and the product isn't updated;
  - a refused image stops the request before the 3D model is uploaded, on create and edit (checking the size message, so the test can't pass for another reason);
  - if deleting the refused upload fails, the admin still gets the size message (added after the rules review).
- **`app/admin/products/ProductForm.test.tsx`:** the image hint mentions the minimum (one more check in the "creating" test).

```bash
npx vitest run app/admin/products
```
**Why:** the admin tests while building: `75 passed` (`76` after the review's extra test).

```bash
mutate() { cp "$1" <scratch>/mutant.bak && sed -i '' "$2" "$1" && npx vitest run "$3"; cp <scratch>/mutant.bak "$1"; }
```
**Why:** task 67's mutation helper: plant a bug, run the tests, restore the file. `<scratch>` is any existing temporary folder.

```bash
mutate app/admin/products/actions.ts 's/  if (width < MIN_IMAGE_SIDE || height < MIN_IMAGE_SIDE) {/  if (width <= MIN_IMAGE_SIDE || height <= MIN_IMAGE_SIDE) {/' app/admin/products/actions.test.ts
```
**Why:** mutation 1, off by one: "accepts an image exactly 512 × 512" fails.

```bash
mutate app/admin/products/actions.ts 's/  if (width < MIN_IMAGE_SIDE || height < MIN_IMAGE_SIDE) {/  if (width < MIN_IMAGE_SIDE \&\& height < MIN_IMAGE_SIDE) {/' app/admin/products/actions.test.ts
```
**Why:** mutation 2, refusing only when **both** sides are small: "too narrow" and "too short" fail.

```bash
mutate app/admin/products/actions.ts '/    await deleteImage(publicId); \/\/ never throws/d' app/admin/products/actions.test.ts
```
**Why:** mutation 3, keeping the refused upload: the four tests that check the delete fail. Every file was restored afterwards.

```bash
npm run build && npm run lint; echo "lint exit code: $?"
```
**Why:** build, then lint after it (task 64's ESLint ignore for the copied MediaPipe files): `lint exit code: 0`.

```bash
npm run typecheck && npm test
```
**Why:** `Test Files 61 passed`, `Tests 774 passed` (8 new; the form's hint check was added to an existing test).

```bash
npm run test:e2e 2>&1 | grep -v -i "clerk_db_jwt\|FAPI request"
```
**Why:** the whole E2E suite: `31 passed, 11 skipped` (the skipped specs need CI's seeded database). The `grep -v` hides `@clerk/testing` warnings that can print a short-lived test session token (task 71).
- Task 67's admin E2E sends a non-image "image", so it never reaches the size check and nothing is uploaded.

```bash
bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the git-safety hook's tests: `Failures: 0`.

## 4. Commit, publish, PR, auto-merge

```bash
git add app/admin/products/actions.ts app/admin/products/actions.test.ts app/admin/products/ProductForm.tsx app/admin/products/ProductForm.test.tsx docs/task-list.md docs/learning/68_add_garment_image_min_size.md
```
**Why:** stages this task's files.

```bash
git commit -m "68_add_garment_image_min_size Refuse garment images smaller than 512 px"
```
**Why:** saves the snapshot.

```bash
git push -u origin 68_add_garment_image_min_size
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 68_add_garment_image_min_size --title "68_add_garment_image_min_size Refuse garment images smaller than 512 px" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Let the upload service measure the image.** Cloudinary already returns the size, so checking after the upload avoids a new image library. Check-then-delete keeps the folder clean.
- **Changing a rule can break old test fixtures:** the 1 × 1 fake upload would have made every existing test hit the new check. Give fakes realistic values.
- **Test the boundary on both sides** (511, 512, 513) and each dimension on its own. A single "tiny image" test (161 × 148) would pass even with an off-by-one or `&&` instead of `||`, since both still refuse it. Mutations 1 and 2 show the boundary tests catch them.
