# 41 Add the try-on page (gallery upload)

**Branch:** `41_add_tryon_page_upload` (starts from `main`)
**Goal:** the signed-in `/tryon` page (docs/project-plan.md, "Pages and flow"):
- a **garment carousel**;
- a **photo from the gallery**, shrunk in the browser;
- a **preview** with **Retake** or **Try on**, which calls task 38's action.

Task 55 (product-delete cleanup) is done, so this task was unblocked. The camera is task 42, and the loading screen is task 43.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #49 (task 55).

```bash
git checkout -b 41_add_tryon_page_upload
```
**Why:** new task, new branch.

## 2. Read the Next 16 rules

```bash
F=node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md && grep -n -i "PageProps\|searchParams\|Promise" $F
```
**Why:** a page's **`searchParams` is a Promise**: `const { product } = await searchParams`. The value can be a `string`, a `string[]` or `undefined`.

```bash
grep -rn "useActionState" node_modules/next/dist/docs/01-app/02-guides/forms.md
```
**Why:** `useActionState(action, initial)` gives `[state, formAction, pending]`, and the action receives `(prevState, formData)`. Task 38's `createTryOnAction` already has that shape.

## 3. The code

- **`app/tryon/page.tsx`:**
  - **`requireUser()` first.** Task 54's CI guard checks this automatically, and now has 14 guard tests.
  - It loads the visible garments, and sends the browser **only `id`, `name` and `imageUrl`**, not prices, links or admin notes.
  - **`?product=<id>`** (from the landing page's "Try it on" links) preselects that garment. Missing, unknown or repeated values fall back to the first one.
  - It shows an empty state with a link home, or a friendly error.
- **`app/tryon/TryOnStudio.tsx`** (client):
  1. **Pick a garment:** a row of buttons with `aria-pressed`. The selected one gets a **dark border**, and the others a light grey one, so sighted users can see the choice too (found in review).
  2. **Choose a photo:** `<input type="file" accept="image/jpeg,image/png,image/webp">`. It's visually hidden inside a label, and the label shows a **focus ring** (`has-[:focus-visible]:ring-2`), so keyboard users can see where they are (found in review). Accepting only these makes iPhones convert HEIC to JPEG. The file is then **shrunk**, and a **preview** shows as a plain `<img>`: it's a local `blob:` URL, which `next/image` can't handle, and the lint rule is disabled with a comment saying so.
  3. **Try on** builds a `FormData` (`productId` plus the **shrunk** photo) and calls `formAction` inside **`startTransition`**, because an action called outside a `<form>` must run in a transition.
  4. On success it says "We're creating your try-on" in a **`role="status"` line that's always in the page**. Screen readers reliably announce text that appears in an existing live region, but not always a region that appears with its text.
     - Try on, Retake and the garment buttons then **lock**, so there's no double start and no dead end.
     - On an error it shows the action's friendly message.
  5. **Retake** clears the photo. The preview's object URL is freed with `URL.revokeObjectURL` whenever it's replaced.
- **`app/tryon/shrinkPhoto.ts`** (browser): `fitWithin(w, h, 1600)` (never scales up), then `shrinkPhoto(file)` returns a **JPEG at most 1600 px**:
  - `createImageBitmap(file, { imageOrientation: "from-image" })` keeps phone photos upright;
  - it draws onto a canvas **over a white background**, because JPEG has no transparency and a transparent PNG would turn black. Then `toBlob("image/jpeg", 0.9)`.
  - **Why:** phone photos are often over the 5 MB limit (task 38), and the model works near 768×1024 anyway. Redrawing also drops EXIF (GPS) before the photo leaves the phone; the server strips it again (task 38).

## 4. Tests

- **`app/tryon/page.test.tsx`** (auth, products and the studio mocked):
  - sign-in is checked first;
  - **only id, name and image** reach the browser;
  - `?product=` preselects, and no value, an unknown one or a repeated one falls back;
  - the empty state, and the friendly error.
- **`app/tryon/TryOnStudio.test.tsx`** (the action and `shrinkPhoto` mocked; `URL.createObjectURL` stubbed):
  - picking a garment;
  - no Try on button before a photo;
  - choosing a photo shrinks it and shows the preview;
  - **Retake frees the preview**;
  - **Try on sends the chosen garment and the shrunk photo**, shows the status, and locks Try on, Retake and the garments;
  - the status line is in the page from the start (empty);
  - the action's error;
  - an unreadable photo.
- **`app/tryon/shrinkPhoto.test.ts`:**
  - `fitWithin` for portrait, landscape, square, small and exactly-the-limit photos;
  - `shrinkPhoto` with stubbed browser APIs (jsdom can't decode images): upright, **white background drawn first**, fitted size, JPEG 0.9, frees the bitmap, and errors when it can't encode, has no canvas, or gets a non-image.
- **`e2e/tryon.spec.ts`:** signed-out `/tryon?product=…` redirects to `/sign-in`, **keeping the `?product=` choice** for after sign-in.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run app/tryon
```
**Why:** runs this task's tests: `48 passed` (8 page, 8 studio, 10 shrink, plus task 38's 22 action tests).

```bash
cp app/tryon/page.tsx /tmp/tp.bak && cp app/tryon/TryOnStudio.tsx /tmp/ts.bak && cp app/tryon/shrinkPhoto.ts /tmp/sp.bak
```
**Why:** saves the good files before planting bugs. Each bug below is undone by copying its backup back.

```bash
sed -i '' 's/products.map(({ id, name, imageUrl }) => ({ id, name, imageUrl }))/products.map((p) => p)/' app/tryon/page.tsx
```
**Why:** plants a **leak**: whole product records (admin notes and all) sent to the browser.

```bash
npx vitest run app/tryon/page.test.tsx
```
**Why:** must fail. Got `1 failed`: `× passes only each garment's id, name and image…`.

```bash
cp /tmp/tp.bak app/tryon/page.tsx
```
**Why:** restores the file.

```bash
sed -i '' 's/      setPhoto({ file: small, previewUrl: URL.createObjectURL(small) });/      setPhoto({ file, previewUrl: URL.createObjectURL(small) });/' app/tryon/TryOnStudio.tsx
```
**Why:** plants a bug: the original, big photo is uploaded instead of the shrunk one.

```bash
npx vitest run app/tryon/TryOnStudio.test.tsx
```
**Why:** must fail. Got `1 failed`: `× Try on sends the chosen garment and the shrunk photo…`.

```bash
cp /tmp/ts.bak app/tryon/TryOnStudio.tsx
```
**Why:** restores the file.

```bash
sed -i '' 's/  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });/  const bitmap = await createImageBitmap(file);/' app/tryon/shrinkPhoto.ts
```
**Why:** plants a bug: photos could come out sideways.

```bash
npx vitest run app/tryon/shrinkPhoto.test.ts
```
**Why:** must fail. Got `1 failed`: `× redraws the photo upright…`.

```bash
cp /tmp/sp.bak app/tryon/shrinkPhoto.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/^  await requireUser(); \/\/ first.*$/  \/\/ auth removed/' app/tryon/page.tsx
```
**Why:** plants an **auth bug**: the page is open to anyone.

```bash
npx vitest run app/tryon/page.test.tsx app/page-auth.test.ts
```
**Why:** must fail. Got `2 failed`: the page test, **and task 54's CI guard**: "app/tryon/page.tsx must start with requireUser() or requireAdmin()…".

```bash
cp /tmp/tp.bak app/tryon/page.tsx
```
**Why:** restores the file.

```bash
sed -i '' 's/^    context.fillRect(0, 0, width, height);$/    \/\/ background removed/' app/tryon/shrinkPhoto.ts
```
**Why:** plants the PNG bug the review found: no white background.

```bash
npx vitest run app/tryon/shrinkPhoto.test.ts
```
**Why:** must fail. Got `1 failed`.

```bash
cp /tmp/sp.bak app/tryon/shrinkPhoto.ts
```
**Why:** restores the file. All tests pass.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 411 passed` (27 new: 26 here plus the guard's new page).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `18 passed` (1 new).

```bash
npm run build
```
**Why:** confirms the production build on its own too. It lists `ƒ /tryon`.

## 5. Commit, publish, PR, auto-merge

```bash
git add app/tryon/page.tsx app/tryon/page.test.tsx app/tryon/TryOnStudio.tsx app/tryon/TryOnStudio.test.tsx app/tryon/shrinkPhoto.ts app/tryon/shrinkPhoto.test.ts e2e/tryon.spec.ts docs/learning/41_add_tryon_page_upload.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "41_add_tryon_page_upload Add try-on page with gallery upload and preview"
```
**Why:** saves the snapshot.

```bash
git push -u origin 41_add_tryon_page_upload
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 41_add_tryon_page_upload --title "41_add_tryon_page_upload Add try-on page with gallery upload and preview" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Call an action from a button (not a `<form>`) inside `startTransition`**, or React warns and `pending` doesn't update.
- **Accessibility isn't just ARIA.** `aria-pressed` tells screen readers what's selected, but sighted users need to *see* it (a border), and keyboard users need a visible focus.
- **Only send the browser what it shows.** Map Prisma rows to small objects before passing them to a client component.
- **Real uploads need Cloudinary keys** (blocker 26), and a real try-on needs `HF_TOKEN` and the Inngest dev server. Until then, "Try on" shows the upload's friendly error.
- **No rate limit yet** (task 52 waits for the developer's numbers).
