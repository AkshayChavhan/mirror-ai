# 61 Add a Cloudinary folder sweep

**Branch:** `61_add_cloudinary_folder_sweep` (starts from `main`)
**Goal:** the hourly cleanup (task 51) also looks **straight in Cloudinary's try-on folders** and deletes any image older than 25 hours, including photos that no database row points at.
- **Why:** task 51 finds images *through rows*. A photo whose row was never saved and whose best-effort delete also failed has no row, so it would stay in Cloudinary forever. These are photos of real people.
- The developer said "Yes for cloudinary folder sweeps" on 2026-09-29.

## 1. Create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #56 (task 57).

```bash
git checkout -b 61_add_cloudinary_folder_sweep
```
**Why:** new task, new branch.

```bash
cat lib/cleanup-job.ts lib/cloudinary.ts
```
**Why:** reads the hourly job (expired rows, then their images) and the Cloudinary helpers (`deleteImage` never throws; `configure()` checks the env vars).

```bash
grep -n "function resources(\|prefix?: string\|max_results\|next_cursor" node_modules/cloudinary/types/index.d.ts | head
```
**Why:** checks the Admin API's list call in the installed SDK:
- `api.resources(options)` accepts `prefix`, `max_results` and `next_cursor`, and returns `Promise<any>`;
- so the code treats the reply as `unknown` and checks its shape (strict TS, no `any`).

## 2. How it works

- **`lib/cloudinary.ts`: `listImages(prefix, cursor?)`** returns one page of images whose public id starts with `prefix`.
  - It calls `cloudinary.api.resources({ type: "upload", resource_type: "image", prefix, max_results: 500, next_cursor })`.
  - It returns `{ images: [{ publicId, createdAt }], nextCursor }`.
  - Items without a public id or date are skipped. A reply that isn't a list throws, and so do missing env vars; the caller logs it.
  - **Admin API calls count toward an hourly rate limit** (upload and delete calls don't). That's from Cloudinary's docs, not something the installed SDK shows. The sweep makes 2 or more a run: one per page, per folder.
- **`lib/cleanup-job.ts`: `sweepOldImages()`** runs as a new **last step, `sweep-folders`**, in **every** hourly run, even when no row has expired.
  - **Age:** older than **25 hours** (`TRYON_TTL_MS` + 1 h). Every try-on is deleted at 24 h, so older images can't belong to a live try-on. The hour of margin covers a photo uploaded just before its row is saved, and a late run.
  - **Folders:** only `mirror-ai/people/` and `mirror-ai/results/`, the same `TRYON_FOLDERS` list as task 51. **Garments are never listed.** Each image's public id is checked again before deleting, because deleting is final.
  - **Paging:** with a `prefix`, Admin API pages come in **public id order, not by date** (from Cloudinary's docs; the code doesn't depend on the order). So it reads every page, up to **10 per folder** (5,000 images). Each run starts from page 1 again, so past that limit some images would never be checked. That's logged as an error: raise the limit if it ever happens.
  - **Deleting** uses `deleteImage()`, which also clears the CDN cache and counts "not found" as deleted. At most **100 per run**, 5 at a time; the rest wait for the next hour (logged).
  - **It never throws.** A listing error (for example Cloudinary's rate limit, or missing keys) is logged **per folder**, so a failure in `people/` doesn't skip `results/` (found in review). Whatever was found is still deleted, and the next hour tries again. So Inngest doesn't retry a failing Cloudinary over and over.
  - If the row step before it throws (database down), that run ends before the sweep, and the next hour runs both.
  - **Logs:** `console.warn` when it deletes something ("deleted N try-on image(s) older than 25 h": usually strays with no row, sometimes images of expired rows still queued), and `console.error` for failures and leftovers.
- **Interplay with task 51:** if the sweep deletes the image of an expired row still waiting in the queue, the row cleanup's delete then gets "not found", which counts as deleted, and the row goes too.
- **`CleanupOutcome`** is now `{ deleted, kept, swept }`.
- **`docs/project-plan.md` (Privacy):** a line about this safety net. `docs/task-list.md`: row 61 ✅, and the "Later" note says it's done.
- **Two comments were no longer true** (found in review): `lib/product-cleanup.ts` said photos would stay on Cloudinary "forever", and `lib/tryon-job.ts` said the cleanup finds images only via rows. Both now mention the sweep.

## 3. Tests

- **`lib/cloudinary.test.ts` → `listImages`** (SDK mocked, with `api.resources` added to the fake):
  - the exact call (upload, image, prefix, 500 a page) and the mapped result;
  - the cursor is passed, and "no next page" gives `null`;
  - items without a public id or date are skipped;
  - a reply that isn't a list throws;
  - missing env vars throw `ImageUploadError` without calling Cloudinary;
  - a provider error goes through to the caller.
- **`lib/cleanup-job.test.ts` → the folder sweep** (`listImages` and `deleteImage` mocked; `TRYON_TTL_MS` added to the `./tryons` mock):
  - **26 h and 25.1 h old are deleted; 24.9 h and 1 h old are kept**;
  - only the two try-on folders are listed, never garments;
  - an image outside its folder, or with an unreadable date, is skipped;
  - it follows the cursor;
  - it stops at 10 pages per folder and logs it;
  - a listing error in **either** folder is logged, not thrown, and the other folder is still swept;
  - at most 100 deletes per run, and the rest are logged;
  - only deletes that worked are counted, and failures are logged;
  - it runs as the last step of every run and reports `swept`.
- The existing cleanup tests now expect the extra `sweep-folders` step and `swept: 0`.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run lib/cleanup-job.test.ts lib/cloudinary.test.ts
```
**Why:** runs the two changed test files: `49 passed` (first version).

```bash
npx vitest run lib/cleanup-job.test.ts lib/cloudinary.test.ts lib/product-cleanup.test.ts lib/tryon-job.test.ts
```
**Why:** after the review fixes (per-folder errors, comments in two more files): `74 passed`. The first run of the new folder test failed on the `.map` extra arguments (see Gotchas).

```bash
cp lib/cleanup-job.ts <scratch>/cleanup-job.ts.bak && sed -i '' 's/if (publicId.startsWith(folder) \&\& Date.parse/if (Date.parse/' lib/cleanup-job.ts && npx vitest run lib/cleanup-job.test.ts; cp <scratch>/cleanup-job.ts.bak lib/cleanup-job.ts
```
**Why:** mutation check 1. It removes the folder re-check, a test catches it (`skips an image outside the folder…` failed), and it restores the file. `<scratch>` is any temporary folder.

```bash
sed -i '' 's/const SWEEP_AGE_MS = TRYON_TTL_MS + 60 \* 60 \* 1000;/const SWEEP_AGE_MS = TRYON_TTL_MS;/' lib/cleanup-job.ts && npx vitest run lib/cleanup-job.test.ts; cp <scratch>/cleanup-job.ts.bak lib/cleanup-job.ts
```
**Why:** mutation check 2. It drops the hour of margin, which would delete a 24.9 h-old image. The test catches it (`deletes images older than 25 h…` failed), and the file is restored.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 477 passed` (16 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh && npm run build
```
**Why:** the rest of the checklist, and all of it passes. E2E locally: `19 passed, 6 skipped`, because the seeded specs need CI's database. No new E2E test: the sweep is a background job with no page, and E2E tests never call the real Cloudinary.

## 4. Commit, publish, PR, auto-merge

```bash
git add lib/cloudinary.ts lib/cloudinary.test.ts lib/cleanup-job.ts lib/cleanup-job.test.ts lib/product-cleanup.ts lib/tryon-job.ts docs/project-plan.md docs/task-list.md docs/learning/61_add_cloudinary_folder_sweep.md
```
**Why:** stages this task's files.

```bash
git commit -m "61_add_cloudinary_folder_sweep Sweep old try-on images from Cloudinary folders hourly"
```
**Why:** saves the snapshot.

```bash
git push -u origin 61_add_cloudinary_folder_sweep
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 61_add_cloudinary_folder_sweep --title "61_add_cloudinary_folder_sweep Sweep old try-on images from Cloudinary folders hourly" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **`api.resources` with a `prefix` isn't sorted by date,** so "oldest first" isn't possible with it (the Search API can sort by `created_at`, but it's a different, eventually consistent index). Read every page and filter by `created_at` in code.
- **Don't pass a function straight to `.map()`**: `.map(deleteImage)` also passes the index and the whole array as extra arguments. It was harmless here, but a test caught it, so it's now `.map((publicId) => deleteImage(publicId))`.
- **Until the Cloudinary keys are in `.env` (and on the server), the sweep logs an error every hour** ("Missing env vars"). Uploads can't work without the keys either, so this goes away when they're added.
- **Mocked modules need every export the code uses.** The cleanup test mocks `./tryons`, and the new `TRYON_TTL_MS` import would be `undefined` there (making the cutoff `NaN`, so nothing would ever be swept) until it was added to the mock.
- **Nothing has run against the real Cloudinary yet** (the keys come later). The call shape is checked against the installed SDK's types and code, and everything else is unit-tested.
