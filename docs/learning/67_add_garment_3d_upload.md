# 67 Add garment 3D upload

**Branch:** `67_add_garment_3d_upload` (starts from `main`)
**Goal:** admins can attach an optional **rigged 3D model** (`.glb`, Mixamo skeleton) to a garment.
- The server checks it **before anything is uploaded**, stores it on Cloudinary, lets admins replace or remove it, and deletes it with the product.
- Live 3D doesn't use it yet: that's **task 72**, split off by the developer on 2026-10-02 (row 72 added in this branch).
- **Limit: 5 MB** (the developer's choice, 2026-10-02: quick to download on phones).
- No new packages.

## 1. Branch and setup

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #66 (task 66).

```bash
git checkout -b 67_add_garment_3d_upload
```
**Why:** new task, new branch.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 (`.nvmrc`) in a shell where `fnm` isn't on the PATH.

```bash
npx prisma generate
```
**Why:** after adding `modelUrl String?` to `Product` in `prisma/schema.prisma`, it regenerates the typed client so TypeScript knows the new field.
- **No `db push` needed:** MongoDB has no columns, so a new optional field (with no index) needs no database change. Old products simply have no `modelUrl` (read as `null`).

## 2. How it works

### What's in a `.glb` (`lib/garment-model.ts`, pure)

- A `.glb` is **glTF 2.0 binary**: a 12-byte header (`glTF`, version `2`, total length), a **JSON chunk** describing the scene (nodes, meshes, **skins**), and usually a **BIN chunk** (vertices, textures).
- `readGlbJson(bytes)` reads the header and the JSON chunk. It refuses a file whose magic, version or length is wrong (cut short or not a `.glb` at all), or whose JSON is invalid.
- `checkGarmentModel(bytes, category)` throws a **`GarmentModelError`** with a friendly message for the first problem it finds:
  1. not glTF 2.0;
  2. **required** Draco, Meshopt or KTX2 compression: Live 3D's loader has no decoders (extra downloads the security policy would block). Optional compression with a fallback is fine;
  3. **any `uri`** on a buffer or image: everything must be inside the file. That includes `data:` URLs, because the browser loader fetches those and task 66's `connect-src` policy would block them;
  4. **no skinned mesh** (a node with both `mesh` and `skin`);
  5. **missing Mixamo bones** for the category (`REQUIRED_BONES`): Top needs `Hips, Spine, LeftArm, RightArm`; Bottom needs `Hips, LeftUpLeg, RightUpLeg`; Dress needs `Hips, Spine, LeftUpLeg, RightUpLeg`. Names are read with task 65's `normalizeBoneName`, so `mixamorig:Hips` counts. Only bones in a skin's `joints` count.
- `MODEL_FOLDER = "mirror-ai/models"`, `MAX_MODEL_BYTES = 5 MB`.

### Storage (`lib/cloudinary.ts`)

- `uploadModel(bytes, folder)` uploads as a **raw** file (`resource_type: "raw"`), so Cloudinary keeps the bytes exactly. Errors are friendly (`ImageUploadError`: "We couldn't upload the 3D model…"), with details logged.
- `deleteModel(publicId)` works like `deleteImage` (never throws; "not found" counts as deleted). Both now share one private `deleteStored()`.
- `modelPublicIdFromUrl(url)` reads `…/raw/upload/[v123/]<publicId>`. **A raw file's public id is the whole rest of the path, extension included**; an image's isn't.

### The admin form and actions

- `ProductForm.tsx`: **"3D model (.glb, optional)"** (`accept=".glb,model/gltf-binary"`), with a hint saying what it's for and the 5 MB limit. When editing a garment that has one: "Replace 3D model…", "This garment has a 3D model.", and an unticked **"Remove the 3D model"**.
- `actions.ts`, **create:** fields → **the model is checked (not uploaded)** → the image is checked and uploaded → the model is uploaded → saved. If saving fails, the just-uploaded model is deleted again.
- **Edit:**
  - a new model **replaces** the old one, and wins over a ticked Remove;
  - Remove saves `modelUrl: null`;
  - the old file is deleted **only after the save succeeded** (outside the `try`, so the error path can never delete a saved model);
  - if saving fails, only the new upload is deleted;
  - **changing the category** while keeping a model checked for the old one is refused, since the new category may need other bones: choose a new model or remove it.
- `lib/products.ts`: `modelUrl` must be an `https` address, or `null`.
- `lib/product-cleanup.ts`: `deleteGarmentModel(url)` deletes only files in `mirror-ai/models/`, and deleting a product now deletes its model too. Like the garment image, a failure is logged but doesn't block the delete; a try-on photo failure still stops everything.
- `next.config.ts`: one `ADMIN_FORM_LIMIT = "11mb"` (5 MB image + 5 MB model + fields), used twice:
  - `serverActions.bodySizeLimit` (was 6 MB);
  - **`proxyClientMaxBodySize`** (default 10 MB). `proxy.ts` (Clerk) runs on the admin pages too, and Next copies each request body for it, but only the first 10 MB. A form at the limit reached the action cut off: a raw 500 with "Unexpected end of form" in the server log. **Found by the rules-reviewer**, who reproduced it on a running build.
- `docs/project-plan.md`: `modelUrl` added to the Product table (`prisma/schema.test.ts` checks the planned fields).

## 3. Tests

- **`lib/garment-model.test.ts`** (real `.glb` bytes built by a small helper):
  - accepts each category, with or without the Mixamo prefix, and bytes that are a view into a bigger buffer;
  - refuses a PNG, a too-short file, a cut-short file, text renamed to `.glb`, bad or non-object JSON, and glTF 1.0;
  - refuses required Draco, Meshopt and KTX2, but accepts optional ones;
  - refuses outside, web and `data:` links, but accepts textures stored inside;
  - refuses a mesh without a skin, no skins, or a broken skin index;
  - finds a skin by its real index after junk entries;
  - names the missing bones per category, and ignores stray bone-named nodes outside skins.
- **`lib/cloudinary.test.ts`:** `uploadModel` (raw, exact bytes, views, empty, missing env vars, hidden provider errors), `deleteModel`, `modelPublicIdFromUrl`.
- **`lib/products.test.ts`:** `modelUrl` kept, emptied to `null`, left alone when not given, and refused when not https, not a URL, or not a string.
- **`lib/product-cleanup.test.ts`:** the model is deleted after the photos and before the row; a model failure doesn't block the delete; a photo failure keeps the model; `deleteGarmentModel` never touches other folders, look-alike folders, images or other sites.
- **`app/admin/products/actions.test.ts`:**
  - create checks the model for the right category, uploads and saves it;
  - no model means nothing extra;
  - **a bad model is refused before any upload** (create and edit), and so is one over 5 MB;
  - an unsaved upload is deleted again;
  - edit replaces (deleting the old file after saving), removes, lets a new file win over Remove, and keeps the model when it's unchanged;
  - the category guard (and that a new model or a removal allows the change);
  - a product deleted meanwhile, or the database failing while loading it;
  - a failed save deletes the new model only.
- **`app/admin/products/ProductForm.test.tsx`:** the field, its hint and limit; Replace and Remove only when there's a model.
- **`next.config.test.ts`:** the 11 MB limits, for the action **and** the proxy. **`prisma/schema.test.ts`:** the field list.
- **`e2e/admin-models.spec.ts`** (signed in as the test admin): the field is optional with the right `accept`; a renamed text file and a real but unrigged `.glb` are refused with their messages, staying on `/admin/products/new`; **a form at the size limit** (a 5 MB "image" + a 5 MB "model", over 10 MB together) reaches the checks instead of being cut off by the proxy.
  - **Safe against any database:** each case also sends a non-image "garment image". The model is checked first, so its message shows; if that check ever broke, the action would still stop at the image check, with nothing uploaded or saved.

```bash
npx vitest run lib/garment-model.test.ts lib/cloudinary.test.ts lib/products.test.ts lib/product-cleanup.test.ts app/admin/products next.config.test.ts
```
**Why:** this task's unit tests while building.
- The first run of the action tests had 7 failures, all from one test: its `checkGarmentModel` error **leaked into later tests**, because `vi.clearAllMocks()` clears calls, not implementations. `beforeEach` now sets the mock back to "a good model".

```bash
npx tsc --noEmit -p . >/dev/null 2>&1; echo "tsc exit code: $?"
```
**Why:** a typecheck while building: `0`. In zsh, `${PIPESTATUS[0]}` (bash's name) prints nothing, so check `$?` on its own.

```bash
npx playwright test e2e/admin-models.spec.ts --reporter=list
```
**Why:** the new E2E spec: `3 passed`.
- The first run failed with `getByRole('alert') resolved to 2 elements`: Next's **route announcer** is an alert too. The spec now looks inside the form.
- One run failed with `net::ERR_NETWORK_CHANGED` after 16 minutes: the Mac's network changed (or it slept). A rerun passed.

```bash
npx playwright test e2e/admin-models.spec.ts --reporter=list -g "size limit"
```
**Why:** the size-limit test alone, run **before** the fix to see it fail for the right reason: the server logged `Request body exceeded 10MB for /admin/products/new` and `Error: Unexpected end of form`, and no message appeared. After adding `proxyClientMaxBodySize`, the spec passes with no warning.

```bash
mutate() { cp "$1" <scratch>/mutant.bak && sed -i '' "$2" "$1" && npx vitest run "$3"; cp <scratch>/mutant.bak "$1"; }
```
**Why:** a small shell helper for mutation checks: plant a bug with `sed`, run the tests, restore the file. `<scratch>` is any temporary folder. Check it exists first (`test -d`): a missing folder made task 66's restore `cp` run with an empty path.

```bash
mutate lib/garment-model.ts 's/  const skinned = nodes.some(/  const skinned = true || nodes.some(/' lib/garment-model.test.ts
```
**Why:** mutation 1, with no rig check: the 3 "not rigged" tests fail.

```bash
mutate app/admin/products/actions.ts '/    if (uploadedModel) await deleteGarmentModel(uploadedModel); \/\/ not saved/d' app/admin/products/actions.test.ts
```
**Why:** mutation 2: unsaved uploads are left on Cloudinary, and the create and edit cleanup tests fail.

```bash
mutate app/admin/products/actions.ts '/  if (unusedModel) await deleteGarmentModel(unusedModel);/d' app/admin/products/actions.test.ts
```
**Why:** mutation 3: replaced or removed models are kept, and the Replace and Remove tests fail.

```bash
mutate app/admin/products/actions.ts 's/    if (current.modelUrl \&\& !model \&\& !removeModel \&\& fields.category !== current.category) {/    if (false) {/' app/admin/products/actions.test.ts
```
**Why:** mutation 4, with no category guard: its test fails.

```bash
mutate lib/product-cleanup.ts 's/  if (!publicId || !publicId.startsWith(`${MODEL_FOLDER}\/`)) {/  if (!publicId) {/' lib/product-cleanup.test.ts
```
**Why:** mutation 5, with no folder check: "another folder" and "look-alike folder" fail. Every file was restored afterwards.

```bash
npm run build && npm run lint; echo "lint exit code: $?"
```
**Why:** build, then lint after it (task 64's ESLint ignore for the copied MediaPipe files): `lint exit code: 0`.

```bash
npm run typecheck && npm test
```
**Why:** `Test Files 61 passed`, `Tests 766 passed` (76 new).
- The first full run failed `prisma/schema.test.ts > has the planned Product fields`: it pins the field list, so `modelUrl` went into it and into `docs/project-plan.md`.

```bash
npm run test:e2e 2>&1 | grep -v -i "clerk_db_jwt\|FAPI request"
```
**Why:** the whole E2E suite: `31 passed, 11 skipped` (the skipped specs need CI's seeded database).
- The `grep -v` hides `@clerk/testing` warnings that print a short-lived test session token (task 71 fixes the cause). One full run in task 66 printed one in the terminal; nothing was written to a file.

```bash
bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the git-safety hook's tests: `Failures: 0`.

## 4. Commit, publish, PR, auto-merge

```bash
git add prisma/schema.prisma prisma/schema.test.ts lib/garment-model.ts lib/garment-model.test.ts lib/cloudinary.ts lib/cloudinary.test.ts lib/products.ts lib/products.test.ts lib/product-cleanup.ts lib/product-cleanup.test.ts app/admin/products/actions.ts app/admin/products/actions.test.ts app/admin/products/ProductForm.tsx app/admin/products/ProductForm.test.tsx next.config.ts next.config.test.ts e2e/admin-models.spec.ts docs/project-plan.md docs/task-list.md docs/learning/67_add_garment_3d_upload.md
```
**Why:** stages this task's files.

```bash
git commit -m "67_add_garment_3d_upload Let admins upload a checked 3D model per garment"
```
**Why:** saves the snapshot.

```bash
git -c http.postBuffer=524288000 push -u origin 67_add_garment_3d_upload
```
**Why:** publishes the branch (the bigger buffer is task 64's fix for large pushes; harmless here).

```bash
gh pr create --base main --head 67_add_garment_3d_upload --title "67_add_garment_3d_upload Let admins upload a checked 3D model per garment" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Check before uploading.** Validate every file first, then upload, so a refusal never leaves an orphan on Cloudinary. Delete a fresh upload again if the save fails, and delete an old file only after the save succeeded.
- **A proxy (middleware) also limits request bodies.** Raising `serverActions.bodySizeLimit` isn't enough when `proxy.ts` runs on the page: Next keeps only the first `proxyClientMaxBodySize` (10 MB by default) and the action fails with "Unexpected end of form". Test big forms in the real app, not just the config value.
- **Raw vs image on Cloudinary:** raw files keep their bytes untouched, live under `/raw/upload/`, and their public id includes the extension.
- **Filtering an array shifts its indexes.** glTF refers to skins and nodes by index, so look them up in the raw array.
- **`data:` URLs count as connections** for `fetch`, so a `connect-src` policy blocks them. Refuse them in uploaded models too.
- **`vi.clearAllMocks()` doesn't reset `mockImplementation`.** Set every mock's default in `beforeEach`.
- **Next's route announcer has `role="alert"`.** Scope alert locators (for example to the form).
- **An E2E test that submits a real form needs a safety net.** Make sure a broken check can't upload or save anything real.
- **Known limit (existing behaviour, out of scope):** if the image uploads but a later step fails (the model upload, or the save), the garment image stays on Cloudinary, and the garment folder isn't swept. That could be a future task.
- **For task 72:**
  - the security policy must allow our Cloudinary raw folder (`https://res.cloudinary.com/<cloud>/raw/upload/`);
  - the browser loader detects `.glb` by its magic bytes, so URLs without an extension are fine;
  - Mixamo's skeleton is nested and doesn't rest at the origin, so it needs retargeting (task 65's notes);
  - `lib/garment-model.ts` imports `normalizeBoneName` from `app/tryon/live/skeleton.ts`: the first `lib/` → `app/` import. Moving the bone names into `lib/` there would remove it (a reviewer suggestion).
