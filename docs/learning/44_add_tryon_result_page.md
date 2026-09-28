# 44 Add the try-on result page

**Branch:** `44_add_tryon_result_page` (starts from `main`)
**Goal:** the **public** result page (decided 2026-09-26, for WhatsApp sharing): a **before/after slider** and a **download**. Its link uses the random share token from task 56, so the route is **`/tryon/[shareId]`**. The plan (pages table, access note, old list) and task 44's own row are renamed to match.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #51 (task 56, the share token).

```bash
git checkout -b 44_add_tryon_result_page
```
**Why:** new task, new branch.

```bash
ls node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/ | grep -i "not-found"
```
**Why:** `not-found.tsx` in a route folder is what `notFound()` shows for that route.

```bash
grep -n -i "robots" node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md | head -5
```
**Why:** `metadata.robots` sets `<meta name="robots">`. We use it to keep shared links out of search engines.

```bash
grep -n "tryon/\[id\]" docs/project-plan.md docs/task-list.md
```
**Why:** finds where the route was still called `[id]`. The plan's pages table and access note now say `[shareId]`.

## 2. The code

```bash
mkdir -p "app/tryon/[shareId]"
```
**Why:** the folder `[shareId]` is the dynamic part of the URL. The quotes stop zsh reading `[…]` as a filename pattern.

- **`app/tryon/[shareId]/page.tsx`** is public, so there's no `requireUser()`. It's added to **`PUBLIC_PAGES`** in the CI guard (task 54), with its reason.
  - `const { shareId } = await params`, then **`getSharedTryOn(shareId)`** (task 56). Only a real token works; an ObjectId or anything else is `null` without a DB call.
  - **`DONE`:** the heading "Trying on: <product>", the **before/after slider**, and **Download the result**.
  - **`PENDING`/`PROCESSING`:** "still being created". **`FAILED`:** "didn't work". Neither shows photos.
  - **Unknown or older than 24 h:** `notFound()`, which shows **`not-found.tsx`**: "This try-on isn't available … deleted after 24 hours", with a link home. The status is 404.
  - **A DB error:** a friendly alert, not a 404. The `catch` starts with `unstable_rethrow` (task 49), so `notFound()` and other Next signals still work.
  - **`metadata.robots = { index: false, follow: false, noimageindex: true }`**, so search engines index neither the page nor its images. **`referrer: "no-referrer"`** means the private link isn't sent to other sites, such as Cloudinary when the photos load (found in review).
- **`BeforeAfter.tsx`** (client): the result sits on top of the photo and is revealed with `clip-path: inset(0 X% 0 0)`, driven by a **native range input**. That works with mouse, touch and keyboard, with a label and `aria-valuetext` ("80% after").
  - Both photos are plain `<img>` straight from Cloudinary, **never through Next's image cache**, which can't be emptied (task 46).
  - The alt texts are neutral ("Before: the original photo", "After: wearing <product>"), because friends open shared links too, not just the person in the photo.
- **`lib/cloudinary.ts`:** `downloadUrl(url)` adds **`fl_attachment`** after `/image/upload/`. Browsers ignore `<a download>` for images on another site, so Cloudinary is asked to send it as a download instead. It returns `null` for URLs that aren't Cloudinary's.

## 3. Tests

- **`app/tryon/[shareId]/page.test.tsx`** (`getSharedTryOn`, `notFound` and the slider mocked):
  - the lookup uses the link's token;
  - `DONE` shows the heading, the slider (the before and after URLs), and the **download link with `fl_attachment`**;
  - `PENDING`, `PROCESSING` and `FAILED` show messages with no photos or download;
  - **an unknown link, or an ObjectId, is a 404**;
  - a DB error shows a friendly alert, not a 404;
  - **`robots` is noindex (with `noimageindex`) and `referrer` is `no-referrer`**.
- **`BeforeAfter.test.tsx`:** both images with their alt text and Cloudinary sources; the slider starts at 50%; moving it to 80% updates `clip-path` and `aria-valuetext`.
- **`not-found.test.tsx`:** the explanation and the link home.
- **`lib/cloudinary.test.ts`:** `downloadUrl`, plus `null` for not-a-URL and another host.
- **`e2e/tryon-result.spec.ts`** (the real build, no DB needed): `/tryon/<ObjectId>` returns **404**, stays on the URL (**no sign-in redirect**, since it's public), and shows the friendly page.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run "app/tryon/[shareId]" lib/cloudinary.test.ts app/page-auth.test.ts
```
**Why:** runs this task's tests and its neighbours: `50 passed`.
- The first run had 3 failures in *my test*: a double-escaped regex looked for a literal backslash. Fixed with `getByText(text, { exact: false })`.

```bash
cp "app/tryon/[shareId]/page.tsx" /tmp/rp.bak && cp app/page-auth.test.ts /tmp/pa.bak
```
**Why:** saves the good files before planting bugs. Each bug below is undone by copying its backup back.

```bash
sed -i '' 's/^  robots: { index: false, follow: false, noimageindex: true },.*$/  \/\/ robots removed/' "app/tryon/[shareId]/page.tsx"
```
**Why:** plants a privacy bug: shared links could be indexed.

```bash
npx vitest run "app/tryon/[shareId]/page.test.tsx"
```
**Why:** must fail. Got `1 failed`.

```bash
cp /tmp/rp.bak "app/tryon/[shareId]/page.tsx"
```
**Why:** restores the file.

```bash
sed -i '' 's/            href={downloadUrl(tryOn.resultUrl) ?? tryOn.resultUrl}/            href={tryOn.resultUrl}/' "app/tryon/[shareId]/page.tsx"
```
**Why:** plants a bug: "Download" would just open the image.

```bash
npx vitest run "app/tryon/[shareId]/page.test.tsx"
```
**Why:** must fail. Got `1 failed`.

```bash
cp /tmp/rp.bak "app/tryon/[shareId]/page.tsx"
```
**Why:** restores the file.

```bash
sed -i '' 's/^  if (!error \&\& !tryOn) notFound();.*$/  \/\/ 404 removed/' "app/tryon/[shareId]/page.tsx"
```
**Why:** plants a bug: an unknown link would look like a try-on still in progress.

```bash
npx vitest run "app/tryon/[shareId]/page.test.tsx"
```
**Why:** must fail. Got `1 failed`.

```bash
cp /tmp/rp.bak "app/tryon/[shareId]/page.tsx"
```
**Why:** restores the file.

```bash
sed -i '' '/^  "tryon\/\[shareId\]\/page.tsx": /d' app/page-auth.test.ts
```
**Why:** removes the page from `PUBLIC_PAGES`. The guard must then treat it as unprotected.

```bash
npx vitest run app/page-auth.test.ts
```
**Why:** must fail. Got `1 failed`: "app/tryon/[shareId]/page.tsx calls requireUser()/requireAdmin() first". The guard catches public pages that nobody listed on purpose.

```bash
cp /tmp/pa.bak app/page-auth.test.ts
```
**Why:** restores the file. All tests pass.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 435 passed` (15 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `19 passed` (1 new).

```bash
npm run build
```
**Why:** confirms the production build on its own too. It lists `ƒ /tryon/[shareId]`.

## 4. Commit, publish, PR, auto-merge

```bash
git add "app/tryon/[shareId]" app/page-auth.test.ts lib/cloudinary.ts lib/cloudinary.test.ts e2e/tryon-result.spec.ts docs/project-plan.md docs/learning/44_add_tryon_result_page.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "44_add_tryon_result_page Add public try-on result page"
```
**Why:** saves the snapshot.

```bash
git push -u origin 44_add_tryon_result_page
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 44_add_tryon_result_page --title "44_add_tryon_result_page Add public try-on result page" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Public pages must say so:** add them to `PUBLIC_PAGES` (with a reason) and to the plan's table, or CI fails.
- **`<a download>` doesn't work across sites:** use Cloudinary's `fl_attachment`.
- **Personal photos never go through `next/image`** (its cache can't be emptied), and shared pages get `noindex`.
- **Nothing links to this page yet:** the loading screen (task 43) and WhatsApp share (task 45) will. Until then, you'd open `/tryon/<shareId>` by hand.
