# 38 Add the "Try on" action

**Branch:** `38_add_tryon_create_action` (starts from `main`)
**Goal:** the Server Action behind the "Try on" button (lifecycle step 1 in `docs/project-plan.md`). It checks the user, uploads the person photo, saves a `PENDING` try-on, and sends the `tryon/requested` event for the job (task 39). The `/tryon` page that calls it comes in task 41.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #37 (task 37, the Inngest route).

```bash
git checkout -b 38_add_tryon_create_action
```
**Why:** new task, new branch.

## 2. Read the installed APIs first

```bash
grep -n "send<\|send(" node_modules/inngest/components/Inngest.d.ts
```
**Why:** `inngest.send(payload)` resolves when the event was sent, and **throws** otherwise (for example, no `INNGEST_EVENT_KEY` in production, or no dev server running locally). So the action must catch it.

```bash
sed -n 60,110p node_modules/inngest/components/triggers/triggers.d.ts
```
**Why:** `tryOnRequested.create({ tryOnId })` builds the typed event to pass to `send`.

```bash
grep -n -i "file\|size\|validat\|authenticat\|useActionState\|return" node_modules/next/dist/docs/01-app/02-guides/server-actions.md
```
**Why:** the Next 16 security rules for actions:
- authenticate inside the action (a form on a protected page isn't a security boundary);
- treat `FormData` as untrusted;
- **return only what the UI needs**, not database rows.

```bash
grep -n "function destroy" -A3 node_modules/cloudinary/types/index.d.ts
```
**Why:** `uploader.destroy(publicId, { resource_type, invalidate })` deletes an image. It returns `Promise<any>`, so we treat the result as `unknown` and narrow it.

```bash
grep -n "type Angle\|type ImageFlags" -A3 node_modules/cloudinary/types/index.d.ts
```
**Why:** the upload's `transformation` accepts a string `flags` value, which we need for stripping metadata (section 4). `Angle` has no `"exif"` value: `a_exif` is deprecated, and the review found it adds nothing.

```bash
gh api repos/cloudinary/cloudinary_npm/issues/296/comments --jq '.[] | .user.login + ": " + (.body | .[0:700])'
```
**Why:** a Cloudinary staff answer says uploads are **auto-rotated by EXIF orientation by default**. That matters because stripping metadata also drops the orientation.
- From Cloudinary's transformation reference (`fl_force_strip`, `fl_keep_iptc`): transformed *deliveries* strip most metadata, but the **stored original keeps it**.
- `fl_force_strip` "clear[s] all embedded metadata while applying an incoming transformation".

## 3. `lib/tryons.ts`: try-on rows

- **Not the same as `lib/tryon.ts`.** `lib/tryon.ts` calls the model; `lib/tryons.ts` stores rows (plural, like `lib/products.ts`).
- `createTryOn({ userId, productId, personUrl })` checks the types at runtime and saves the row as **`PENDING`**.
- `failTryOn(id, errorMessage)` sets **`FAILED`** with a user-safe message. Task 39 uses it too.
- Errors become `TryOnRecordError` (`INVALID_INPUT` / `NOT_FOUND` / `DB_ERROR`) with a friendly message. The details are logged on the server.

## 4. `lib/cloudinary.ts`: strip metadata, and `deleteImage(publicId)`

**`uploadImage(file, folder, { stripMetadata: true })`** (a new optional third argument):
- It adds the incoming transformation `[{ flags: "force_strip" }]`. An **incoming** transformation runs **before** Cloudinary stores the file, so the original, with its metadata, is never kept.
- `force_strip` removes all EXIF/IPTC/XMP data (**GPS location**, device, time).
- Cloudinary **rotates uploads upright by their EXIF orientation by default**, so the photo isn't left sideways once the orientation is gone.
```bash
node -e 'const u=require("cloudinary/lib/utils"); console.log(u.build_upload_params({folder:"f",transformation:[{flags:"force_strip"}]}).transformation, "|", JSON.stringify(u.build_upload_params({folder:"f"}).transformation))'
```
**Why:** shows what the SDK really sends: `fl_force_strip | ""`. So person photos get the strip, and uploads without the option get no transformation.
- **Why:** `/tryon/[id]` is public by link and shared on WhatsApp (task 44). Without this, anyone with the link could read where a gallery photo was taken.
- Garment uploads (admin) are unchanged.
- **To verify with real keys (blocker 26):** upload a phone photo that has GPS data, then check that the stored image has no EXIF and is upright.

**`deleteImage(publicId)`:**

- Deletes the image with `invalidate: true`, so Cloudinary's CDN stops serving the old URL.
- **It never throws.** It returns `false` (and logs) when the delete fails, so it can be used for best-effort cleanup inside another error. `"not found"` counts as deleted.
- **Why now:** if saving the row fails after the upload, no `TryOn` row points at the photo. The 24 h cleanup (task 51) finds photos through rows, so it would never delete this one, which breaks the privacy promise. Task 51 will reuse this function.

## 5. `app/tryon/actions.ts`: `createTryOnAction`

```bash
mkdir -p app/tryon
```
**Why:** the action sits next to the `/tryon` page that will call it (task 41).

The form fields are `productId` and `photo`. Order matters:
1. **`requireUser()` comes first.** The user id comes from the **session**, never from the form. When signed out, it redirects to sign-in.
2. **Photo and id checks** (no database, no Cloudinary):
   - a photo is present;
   - it's **5 MB or smaller** (checked before reading the bytes);
   - its **first bytes ("magic bytes")** say **JPEG, PNG or WebP**:
     - JPEG: `FF D8 FF`;
     - PNG: `89 50 4E 47 0D 0A 1A 0A`;
     - WebP: `RIFF....WEBP`.
   - `productId` is an ObjectId.
   - `File.type` is **only what the client claims**. Anyone posting to the action directly can label an SVG, which can carry scripts, as `image/jpeg`. So the bytes decide, and the upload is labelled with the real type.
3. **The product exists and `isActive`**, so a hidden garment can't be tried on. This runs before the upload, so a bad product never leaves a photo behind.
4. **Upload** the photo to `mirror-ai/people`, **with `stripMetadata: true`**.
5. **`createTryOn`** saves the row. If that fails, **`deleteImage`** removes the photo.
6. **`inngest.send(tryOnRequested.create({ tryOnId }))`**. If sending fails, the row is marked **`FAILED`** (and kept, so the cleanup cron still deletes the photo), and the user sees "We couldn't start your try-on. Please try again."
7. It returns **only `{ error, tryOnId }`**. Task 41 uses the id to show the loading screen.

- The 6 MB `bodySizeLimit` from task 33 already fits a 5 MB photo.
- **Note for task 41:** phone photos can be over 5 MB, so shrink them in the browser first. Setting `accept="image/jpeg,image/png,image/webp"` also makes iPhones convert HEIC to JPEG.

## 6. Tests

- **`lib/tryons.test.ts`** (Prisma mocked):
  - `PENDING` on create;
  - each bad input (no DB call);
  - DB errors hidden and logged;
  - `failTryOn` data;
  - a malformed id;
  - P2025 → `NOT_FOUND`, other errors → `DB_ERROR`.
- **`lib/cloudinary.test.ts`** (SDK mocked):
  - `stripMetadata` sends `transformation: [{ flags: "force_strip" }]`, and the existing garment upload test still expects no transformation.

  For `deleteImage`:
  - `ok` gives `true`, with `invalidate: true`;
  - `not found` gives `true`;
  - another result gives `false` and is logged;
  - a rejected call gives `false` (never throws);
  - missing env vars and an empty id make no call.
- **`app/tryon/actions.test.ts`** (auth, Cloudinary, products, try-ons and `inngest.send` mocked; the real event):
  - the happy path (the chosen product is looked up, the upload goes to the people folder **with `stripMetadata`**, the row and event are created, and only the id is returned);
  - **a form `userId` is ignored**;
  - sign-in is checked first;
  - 9 bad inputs, all stopped before any DB or upload call, including **an SVG claiming to be a JPEG** and **a PDF claiming to be a PNG**;
  - a WebP of exactly 5 MB is allowed;
  - **a PNG claiming to be a JPEG is uploaded as `image/png`**;
  - an unknown or hidden product;
  - a product DB error;
  - an upload failure;
  - **a save failure deletes the photo**;
  - **a send failure marks `FAILED`**, including when marking fails too;
  - unexpected errors get a generic message.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run app/tryon lib/tryons.test.ts lib/cloudinary.test.ts
```
**Why:** just this task's tests: `44 passed` (39 new plus the 5 existing upload tests).

```bash
cp app/tryon/actions.ts /tmp/tryon-actions.bak
```
**Why:** saves the good file before planting bugs. Each bug below is planted, tested, and then undone by copying this backup back.

```bash
sed -i '' 's/  const type = sniffPhotoType(bytes);/  const type = photo.type as Photo["type"];/' app/tryon/actions.ts
```
**Why:** plants a **security bug**: trust the client's claimed type again.

```bash
npx vitest run app/tryon
```
**Why:** must fail. Got `4 failed`, including `× an SVG claiming to be a JPEG`.

```bash
cp /tmp/tryon-actions.bak app/tryon/actions.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/, { stripMetadata: true }); \/\/ no GPS in shared links/); \/\/ strip removed/' app/tryon/actions.ts
```
**Why:** plants a **privacy bug**: upload without stripping GPS and the other metadata.

```bash
npx vitest run app/tryon
```
**Why:** must fail. Got `3 failed`, including the happy path.

```bash
cp /tmp/tryon-actions.bak app/tryon/actions.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/    await deleteImage(uploaded.publicId);/    \/\/ cleanup removed/' app/tryon/actions.ts
```
**Why:** plants a **privacy bug**: the photo is kept when saving the row fails.

```bash
npx vitest run app/tryon
```
**Why:** must fail. Got `2 failed`, including `× deletes the uploaded photo when saving the try-on fails…`.

```bash
cp /tmp/tryon-actions.bak app/tryon/actions.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/if (!product || !product.isActive)/if (!product)/' app/tryon/actions.ts
```
**Why:** plants a second bug: hidden garments can be tried on.

```bash
npx vitest run app/tryon
```
**Why:** must fail. Got `1 failed`: `× refuses a hidden product…`.

```bash
cp /tmp/tryon-actions.bak app/tryon/actions.ts
```
**Why:** restores the file. All 22 action tests pass.

```bash
npm test
```
**Why:** the whole suite: `Tests 203 passed` (39 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `14 passed` (no new E2E tests, because there's no page yet).

```bash
npm run build
```
**Why:** confirms the production build on its own too.

## 7. Commit, publish, PR, auto-merge

```bash
git add lib/tryons.ts lib/tryons.test.ts lib/cloudinary.ts lib/cloudinary.test.ts app/tryon docs/learning/38_add_tryon_create_action.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "38_add_tryon_create_action Add try-on create action"
```
**Why:** saves the snapshot.

```bash
git push -u origin 38_add_tryon_create_action
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 38_add_tryon_create_action --title "38_add_tryon_create_action Add try-on create action" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Order the steps to avoid orphans.** Validate everything you can before uploading. After the upload, every failure path must either delete the photo or keep a row that points at it.
- **Never take `userId` from the form.** Anyone can post any field to a Server Action.
- **Never trust `File.type`.** Check the magic bytes on the server.
- **Cloudinary keeps the original upload as-is**, metadata included. Only transformed deliveries strip it. For photos of people, strip it at upload with an incoming transformation.
- **The review found a gap in the plan:** deleting a product cascade-deletes its try-on rows but leaves their photos on Cloudinary. It's now **task 55** (waiting for the developer's OK), and **task 41 waits for it**. Task 38 only adds an action that no page calls yet, so no user can create a try-on until task 41.
- **`inngest.send` throws** when Inngest can't be reached, and the action then shows "We couldn't start your try-on. Please try again." `INNGEST_DEV=1` goes on the **Next app** (where `send` runs), with the Inngest dev server running beside it, as in task 37:

```bash
INNGEST_DEV=1 npm run dev
```
**Why:** starts the app in Inngest dev mode, so `send` goes to the local dev server with no keys.

```bash
npx inngest-cli@1.45.1 dev -u http://localhost:3000/api/inngest
```
**Why:** in a second terminal, starts the local Inngest dev server that receives the event (not run in this task).

- **The review also found these for later tasks** (not bugs in task 38):
  - **ObjectIds are not secret.** They're a timestamp, a per-process random value, and a counter, so one shared `/tryon/[id]` link could reveal nearby ids. The public link needs its own random token: **task 56**, before task 44. Task 40's status endpoint should also check that the signed-in user owns the try-on.
  - **Task 39:** claim the row atomically (`PENDING` → `PROCESSING` with a conditional update). Then a late `failTryOn` from this action and the job can't overwrite each other.
  - **Task 51:** consider also sweeping the `mirror-ai/people` folder by upload time. That also catches a photo whose best-effort `deleteImage` failed (added to "Later").
