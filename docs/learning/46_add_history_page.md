# 46 Add the history page

**Branch:** `46_add_history_page` (starts from `main`)
**Goal:** `/history`, the signed-in user's try-ons from the last 24 hours (docs/project-plan.md, "Pages and flow" and "Privacy").
- Tasks 41 and 44 are blocked: they wait for the developer's OK on tasks 55 and 56. Tasks 42 and 43 build on 41, and 45 builds on 44. So this is the next task that can be done.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #41 (task 40, the status endpoint).

```bash
git checkout -b 46_add_history_page
```
**Why:** new task, new branch.

```bash
cat app/page.tsx && sed -n 1,50p app/admin/products/page.test.tsx && cat e2e/admin-products.spec.ts | head -30
```
**Why:** reuses the existing patterns:
- the landing page's error and empty states;
- how the admin page test mocks auth and renders an async Server Component;
- how the E2E checks a signed-out redirect.

## 2. `lib/tryons.ts`: `listRecentTryOns(userId)`

- `findMany({ where: { userId, createdAt: { gt: now − 24 h } }, orderBy: { createdAt: "desc" }, take: 50, select: … })`.
- **`userId` in the query:** only the user's own try-ons.
- **The 24 h filter:** older ones stay hidden even if the cleanup cron (task 51) runs late. It uses the shared `TRYON_TTL_MS`.
- **`select`:** only what the page shows (id, status, result, error message, time, product name).
- **`take: 50`:** a safety cap. The 24 h window keeps the list short anyway.
- The `TryOn` index `userId + createdAt` (task 30) serves exactly this query.

## 3. `app/history/`

```bash
mkdir -p app/history
```
**Why:** `app/history/page.tsx` becomes the `/history` page.

- **`page.tsx`:**
  - calls `requireUser()` **first**, so signed-out visitors go to sign-in before any data is read;
  - each try-on shows the **result image** when `DONE` (`alt="You wearing <product>"`, loaded with **`unoptimized`**, see section 4), or else a text:
    - "Waiting to start…" (`PENDING`);
    - "Creating your try-on…" (`PROCESSING`);
    - the friendly `errorMessage` (`FAILED`);
  - then the product name and "5 min ago" in a `<time dateTime>`;
  - an **empty state** links to `/tryon`, and a **load error** shows "We couldn't load your try-ons. Please try again." (`role="alert"`, and the details are logged by `lib/tryons`);
  - a line tells users that try-ons **and their photos are deleted after 24 hours**.
  - `statusText()` is an **exhaustive `switch`** over the four statuses, so TypeScript flags any status we forget, with no cast.
  - The list sits in `<section aria-label="Try-ons">`, so tests can scope to it. Next's route announcer also has `role="alert"` (see task 35).
- **`timeAgo.ts`:** "just now", "5 min ago" or "3 h ago". Hours are the largest unit, since rows are at most 24 h old.

## 4. Why `unoptimized` (found in review)

```bash
sed -n 790,806p node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md
```
**Why:** by default `next/image` serves images through `/_next/image` and **keeps an optimized copy** on the server (`<distDir>/cache/images`, or the CDN) for at least `minimumCacheTTL`, or longer if Cloudinary's `Cache-Control` says so. The docs say: "There is no mechanism to invalidate the cache". So a user's photo could outlive the 24 h delete.

```bash
sed -n 391,398p node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md
```
**Why:** `unoptimized` turns that off. The browser loads the image **straight from Cloudinary**, where the cleanup (task 51) can really delete it.
- Garment images (landing page, admin) stay optimized: they aren't personal.
- **The result page (task 44) must do the same** for the person photo and the result.

## 5. Tests

- **`app/history/page.test.tsx`** (auth and lib mocked; fake `Date`, fixed "now"):
  - sign-in is checked before loading;
  - the lookup uses the session user, and the 24 h note is shown;
  - a `DONE` item shows its image, name and "5 min ago" with `datetime`;
  - **the image `src` is the Cloudinary URL**, not `/_next/image…`;
  - `PENDING`, `PROCESSING`, `FAILED` (with or without a message) and `DONE` without a result show text and no image;
  - the order is kept;
  - the empty state links to `/tryon`;
  - a load error shows a friendly alert with no `mongodb…` text.
- **`app/history/timeAgo.test.ts`:** the boundaries 0, 59.999 s, 1 min, 59 min, 60 min and 23 h 59 min.
- **`lib/tryons.test.ts`:** with a fixed clock, the exact query (the user, a cutoff 24 h back, newest first, 50, the fields); an empty user id makes no DB call; a DB error becomes `DB_ERROR`.
- **`e2e/history.spec.ts`:** signed-out `/history` redirects to `/sign-in`, and the return URL contains `/history`.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run app/history lib/tryons.test.ts
```
**Why:** this task's tests: `45 passed` (12 page, 6 `timeAgo`, 27 row tests, 3 of them new).

```bash
cp app/history/page.tsx /tmp/history.bak && cp lib/tryons.ts /tmp/tryons.bak
```
**Why:** saves the good files before planting bugs. Each bug below is undone by copying its backup back.

```bash
sed -i '' 's/  const userId = await requireUser(); /  const userId = "user_123"; /' app/history/page.tsx
```
**Why:** plants an **auth bug**: no sign-in check.

```bash
npx vitest run app/history/page.test.tsx
```
**Why:** must fail. Got `1 failed`: `× checks sign-in before loading anything`.

```bash
cp /tmp/history.bak app/history/page.tsx
```
**Why:** restores the file.

```bash
sed -i '' 's/    tryOns = await listRecentTryOns(userId);/    tryOns = await listRecentTryOns("user_other");/' app/history/page.tsx
```
**Why:** plants a **privacy bug**: someone else's try-ons are shown.

```bash
npx vitest run app/history/page.test.tsx
```
**Why:** must fail. Got `1 failed`: `× loads only the signed-in user's try-ons…`.

```bash
cp /tmp/history.bak app/history/page.tsx
```
**Why:** restores the file.

```bash
sed -i '' 's/      where: { userId, createdAt: { gt: new Date(Date.now() - TRYON_TTL_MS) } },/      where: { userId },/' lib/tryons.ts
```
**Why:** plants a **24 h bug**: old try-ons would show if the cron ran late.

```bash
npx vitest run lib/tryons.test.ts
```
**Why:** must fail. Got `1 failed`: `× lists the user's try-ons from the last 24 h…`.

```bash
cp /tmp/tryons.bak lib/tryons.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/^          unoptimized$/          \/\/ unoptimized removed/' app/history/page.tsx
```
**Why:** plants the **cache bug** found in review: photos go through Next's image cache.

```bash
npx vitest run app/history/page.test.tsx
```
**Why:** must fail. Got `1 failed`: `× loads the photo straight from Cloudinary…`.

```bash
cp /tmp/history.bak app/history/page.tsx
```
**Why:** restores the file. All 45 tests pass.

```bash
npm test
```
**Why:** `Tests 259 passed` (21 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `16 passed` (1 new).

```bash
npm run build
```
**Why:** confirms the production build on its own too. It lists `ƒ /history` (rendered per request, since it reads the session).

## 6. Commit, publish, PR, auto-merge

```bash
git add lib/tryons.ts lib/tryons.test.ts app/history e2e/history.spec.ts docs/learning/46_add_history_page.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "46_add_history_page Add history page"
```
**Why:** saves the snapshot.

```bash
git push -u origin 46_add_history_page
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 46_add_history_page --title "46_add_history_page Add history page" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Items don't link anywhere yet.** The result page `/tryon/[id]` comes in task 44, which will use a random share token (task 56). Links get added then.
- **Never let Next optimize personal photos.** Its image cache can't be emptied on demand. Use `unoptimized`.
- **The 24 h promise needs task 51** (the cleanup cron). Until it exists, nothing deletes old rows or photos; this page only hides them.
- **Fake only `Date` in page tests** (`vi.useFakeTimers({ toFake: ["Date"] })`), so React's rendering isn't affected by faked timers.
- **"x min ago" is computed on the server** when the page renders. That's fine for a per-request page, and it avoids timezone differences between server and browser.
