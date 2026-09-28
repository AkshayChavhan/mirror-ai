# 51 Add the cleanup cron

**Branch:** `51_add_cleanup_cron` (starts from `main`)
**Goal:** an hourly Inngest job that deletes try-ons older than 24 h, **with** their Cloudinary images (the person photo and the result). This makes the 24 h privacy promise real (docs/project-plan.md, "Privacy": "nothing about the attempt is kept").
- The task's `What` is done as written: images are found through the rows.
- The extra "sweep Cloudinary folders by age" idea (in "Later") still waits for the developer's decision.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #46 (task 50, the wishlist merge).

```bash
git checkout -b 51_add_cleanup_cron
```
**Why:** new task, new branch.

## 2. The Inngest v4 cron trigger

```bash
grep -n "declare function cron\|const cron" -A8 node_modules/inngest/components/triggers/triggers.d.ts
```
**Why:** `cron(schedule)` returns `{ cron: schedule }`, the trigger for a scheduled function.

```bash
sed -n 88,104p node_modules/inngest/components/InngestFunction.d.ts
```
**Why:** a function's trigger is either `{ event }` or `{ cron }`. Ours is `cron("0 * * * *")`: every hour, on the hour.

## 3. The code

- **`lib/cloudinary.ts`:** `publicIdFromUrl(url)`. Rows keep only the image URL (`https://res.cloudinary.com/<cloud>/image/upload/[v123/]<publicId>.<ext>`), but `deleteImage` needs the public id.
  - It returns `null` for anything else: not https, another host, a video, no extension, or a broken `%` escape.
- **`lib/tryons.ts`:**
  - `listExpiredTryOns(limit)`: `createdAt ≤ now − 24 h`, across all users, oldest first, only `id`, `personUrl` and `resultUrl`. The `createdAt` index (task 30) serves it.
  - `deleteTryOns(ids)`: `deleteMany` by id. Malformed ids are skipped, and nothing valid means no DB call.
- **`lib/cleanup-job.ts`:** `processCleanup(step)`, three steps:
  1. **`find-expired`:** up to **100** rows. Anything left over is picked up next hour.
  2. **`delete-images`:** deletes each row's person photo and result, **5 rows at a time**.
  3. **`delete-rows`:** **only the rows whose images are all gone.** If an image delete fails (`deleteImage` returns `false`), the row **stays**, so the next hour retries it and no photo is left without a row. Kept rows are logged. This step is skipped when nothing was cleaned.
  - **Safety:** only public ids under **`mirror-ai/people/`** or **`mirror-ai/results/`** are ever deleted. A garment image, or a URL that isn't ours, is never touched, and that row can still be removed.
    - That should never happen, so it's logged as an **error**, with a safe hint (the folder, or the host). The photo's full URL is never logged.
  - A DB error in a step throws, so Inngest retries that step (default retries).
- **`cleanupJob`:** `inngest.createFunction({ id: "cleanup-expired-tryons", triggers: [cron("0 * * * *")], concurrency: { limit: 1 } }, …)`.
  - **`concurrency: { limit: 1 }`** means two runs never overlap, even if a slow run is still going when the next hour starts.
  - It uses the same `step.run` adapter as the try-on job, since every step returns plain JSON.
- **`app/api/inngest/route.ts`:** `functions: [tryOnJob, cleanupJob]`. The dev route now reports **`function_count: 3`**: the job, its failure handler, and the cron.

## 4. Tests

- **`lib/cloudinary.test.ts`:** `publicIdFromUrl` with a version, without one, and with an escaped character. `null` for not-a-URL, http, another host, a video, no extension, and a broken escape.
- **`lib/tryons.test.ts`:**
  - `listExpiredTryOns` with a fixed clock (`lte` exactly 24 h back, oldest first, the limit, 3 fields), and a DB error;
  - `deleteTryOns`: valid ids only; nothing valid means no call; a DB error.
- **`lib/cleanup-job.test.ts`** (rows and `deleteImage` mocked, the real `publicIdFromUrl`, a fake `step`):
  - nothing expired, so only `find-expired` runs;
  - two rows: 4 images deleted, then both rows;
  - no result, so only the person photo;
  - **a failed image delete keeps that row**;
  - nothing deleted, so no `delete-rows` step;
  - **a garment image and a foreign URL are never deleted**: an error with a safe hint is logged (never the full URL), and the row is removed;
  - 7 rows get processed in chunks;
  - a DB error rethrows;
  - the id, the hourly cron trigger, and `concurrency: { limit: 1 }`.
- **`app/api/inngest/route.test.ts`:** `function_count: 3`.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run lib/cleanup-job.test.ts lib/cloudinary.test.ts lib/tryons.test.ts app/api/inngest
```
**Why:** runs this task's tests: `66 passed` (10 job, 21 Cloudinary, 32 row and 3 route tests).

```bash
cp lib/cleanup-job.ts /tmp/cj.bak && cp lib/tryons.ts /tmp/tryons.bak
```
**Why:** saves the good files before planting bugs. Each bug below is undone by copying its backup back.

```bash
sed -i '' 's/  return results.every(Boolean);/  return true;/' lib/cleanup-job.ts
```
**Why:** plants a **privacy bug**: rows would be deleted even when their images weren't, orphaning the photos.

```bash
npx vitest run lib/cleanup-job.test.ts
```
**Why:** must fail. Got `2 failed`, including `× KEEPS a row whose image couldn't be deleted…`.

```bash
cp /tmp/cj.bak lib/cleanup-job.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/      if (!publicId || !TRYON_FOLDERS.some((folder) => publicId.startsWith(folder))) {/      if (!publicId) {/' lib/cleanup-job.ts
```
**Why:** plants a **safety bug**: a garment image could be deleted.

```bash
npx vitest run lib/cleanup-job.test.ts
```
**Why:** must fail. Got `1 failed`: `× never deletes a garment image…`.

```bash
cp /tmp/cj.bak lib/cleanup-job.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/      where: { createdAt: { lte: new Date(Date.now() - TRYON_TTL_MS) } },/      where: { createdAt: { lte: new Date() } },/' lib/tryons.ts
```
**Why:** plants a **data-loss bug**: fresh try-ons would count as expired.

```bash
npx vitest run lib/tryons.test.ts
```
**Why:** must fail. Got `1 failed`: `× finds try-ons at least 24 h old…`.

```bash
cp /tmp/tryons.bak lib/tryons.ts
```
**Why:** restores the file. All tests pass.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 358 passed` (24 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `17 passed`.

```bash
npm run build
```
**Why:** confirms the production build on its own too.

## 5. Commit, publish, PR, auto-merge

```bash
git add lib/cleanup-job.ts lib/cleanup-job.test.ts lib/cloudinary.ts lib/cloudinary.test.ts lib/tryons.ts lib/tryons.test.ts app/api/inngest/route.ts app/api/inngest/route.test.ts docs/learning/51_add_cleanup_cron.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "51_add_cleanup_cron Add hourly cleanup of try-ons older than 24 h"
```
**Why:** saves the snapshot.

```bash
git push -u origin 51_add_cleanup_cron
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 51_add_cleanup_cron --title "51_add_cleanup_cron Add hourly cleanup of try-ons older than 24 h" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **The hook matches text:** a Bash command that *contains* `ids.push(id)` (for example, writing a test file with a heredoc) is blocked. Write such files with the editor or Write tool instead.
- **Delete images first, then rows, and only rows whose images are gone.** Rows are the only way the job finds images.
- **Not run for real yet:** it needs the Inngest dev server (task 37's commands) and Cloudinary keys (blocker 26). Locally the dev server shows the hourly schedule, and you can trigger a run by hand there.
- **Rare edge cases for later** (from review):
  - a try-on still `PROCESSING` 24 h after creation could finish between `find-expired` and `delete-rows`, leaving its new result image;
  - 100 rows that permanently fail to delete would fill the oldest-first batch.
  - The folder sweep below would cover both.
- **Still open for the developer:** a folder sweep by upload time would also catch photos that never had a row. See "Later" in the task list.
