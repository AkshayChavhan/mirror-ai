# 49 Add the wishlist page

**Branch:** `49_add_wishlist_page` (starts from `main`)
**Goal:** the public `/wishlist` page (signed out or in), plus the buttons that use task 48's actions: **Remove** on the page, and **Save** on each product card. Task 48's doc and PR said the buttons come here.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #44 (task 48, the wishlist actions).

```bash
git checkout -b 49_add_wishlist_page
```
**Why:** new task, new branch.

```bash
cat app/ProductCard.tsx app/admin/products/ProductRowActions.tsx && sed -n 1,40p app/ProductCard.test.tsx && grep -n "body\|nav\|header\|Link" app/layout.tsx
```
**Why:** reuses the existing patterns. The card's layout and links, and the admin buttons' `useTransition` plus friendly-error handling. There's no site header yet, so after saving, the Save button itself links to `/wishlist`.

```bash
sed -n 1,45p app/admin/products/ProductRowActions.test.tsx
```
**Why:** how the existing button tests mock an action and wait for the transition (`waitFor`).

## 2. `lib/wishlist.ts`: `listWishlist(owner)`

- `findMany({ where: { ...owner, product: { isActive: true } }, orderBy: { createdAt: "desc" }, take: 100, select: … })`.
- **Only the owner's items**, from the same `userId`/`anonymousId` rule as task 48.
- **Hidden garments drop out** (`isActive: true`), like on the landing page.
- **`select`** returns only what the page shows. `take: 100` is a safety cap until task 57 limits how many can be saved.

## 3. The page and the buttons

- **`app/wishlist/page.tsx`** is public, so there's no `requireUser()`.
  - The owner is the Clerk `userId`, or else **`getAnonymousId()`**. That call only **reads** the cookie, which is allowed while a page renders; creating it isn't.
  - **No owner** (a new visitor with no cookie) shows the empty state **without a database call**.
  - Each item shows the garment photo, its name (`h2`), its price, **Try it on** (`/tryon?product=…`), **Buy** (new tab, `rel="noopener noreferrer"`) and **Remove**.
  - An empty state links to `/`, and a load error shows "We couldn't load your wishlist. Please try again."
    - **`unstable_rethrow(err)` comes first** in the `catch`. `cookies()` and `auth()` sit inside the `try`, and Next's own control-flow errors, such as its render-time signals from `cookies()`, must reach Next, not this catch.
    - Database errors (`WishlistError`) are already logged by `lib/wishlist`. **Anything else**, such as Clerk failing, is logged here: `[wishlist page] Unexpected error:`. This was found in review.
  - Garment images stay optimized by `next/image`, since they aren't personal photos (unlike task 46).
- **`app/wishlist/RemoveButton.tsx`** (client) calls `removeFromWishlistAction(itemId)` inside `startTransition`.
  - The action refreshes `/wishlist`, so the item disappears.
  - The button is disabled while removing, and shows the action's friendly error, or "Something went wrong" if the request itself fails.
- **`app/SaveButton.tsx`** (client), on each **`ProductCard`**, calls `addToWishlistAction(productId)`.
  - On success it shows **"Saved · View wishlist"** (`role="status"`), linking to `/wishlist`. Its label, "Save <name> to wishlist", matches Remove's style.
  - On an error it shows the message and keeps the button.
  - It works signed out: the action creates the anonymous cookie.
- The actions take a plain id, so they're called inside `startTransition`, not through `useActionState` (task 48's note).

## 4. Tests

- **`lib/wishlist.test.ts`:** `listWishlist` for a user and for a visitor (owner, `isActive`, order, cap, fields); an empty owner makes no DB call; a DB error.
- **`app/wishlist/page.test.tsx`** (Clerk, cookie, lib and `RemoveButton` mocked):
  - a signed-in user's list, with no cookie read;
  - signed out, the list comes from the cookie;
  - **no cookie gives the empty state with no DB call**;
  - an item's photo, price, links and remove button;
  - no price or buy link when missing;
  - a DB error shows a friendly alert and is **not logged twice**;
  - **a Clerk failure** shows the friendly alert with no `mongodb` text, **and is logged**.
- **`app/wishlist/RemoveButton.test.tsx`:** removes by id; the action's error; a request failure; **disabled while pending**.
- **`app/SaveButton.test.tsx`:** saves, then shows "Saved" plus the link and no button; an error keeps the button; a request failure.
- **`app/ProductCard.test.tsx`:** the card places a Save button for its product (`SaveButton` mocked).
- **`e2e/wishlist.spec.ts`** (the real build):
  - `/wishlist` returns 200 with **no redirect** (it's public);
  - it shows the heading and the empty state with its link;
  - **no `mirror_anon_id` cookie** is created just by viewing.
  - It needs no database, so it works in CI.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run app/wishlist app/SaveButton.test.tsx app/ProductCard.test.tsx lib/wishlist.test.ts
```
**Why:** runs this task's tests: `56 passed`.
- The first run had **2 failures** that weren't real bugs: `beforeEach(() => mock.mockResolvedValue(…))` **returns** the mock, and **Vitest runs a function returned from `beforeEach` as cleanup**. So the rejected-promise mock was called after the test.
- Fixed with block bodies `beforeEach(() => { … })`.

```bash
cp app/wishlist/page.tsx /tmp/wlp.bak && cp lib/wishlist.ts /tmp/wl.bak && cp app/SaveButton.tsx /tmp/save.bak
```
**Why:** saves the good files before planting bugs. Each bug below is undone by copying its backup back.

```bash
sed -i '' 's/  if (userId) return { userId };/  \/\/ signed-in check removed/' app/wishlist/page.tsx
```
**Why:** plants a bug: a signed-in user would see the anonymous list.

```bash
npx vitest run app/wishlist/page.test.tsx
```
**Why:** must fail. Got `3 failed`.

```bash
cp /tmp/wlp.bak app/wishlist/page.tsx
```
**Why:** restores the file.

```bash
sed -i '' 's/      where: { ...fields, product: { isActive: true } },/      where: { ...fields },/' lib/wishlist.ts
```
**Why:** plants a bug: hidden garments would still be listed.

```bash
npx vitest run lib/wishlist.test.ts
```
**Why:** must fail. Got `2 failed`.

```bash
cp /tmp/wl.bak lib/wishlist.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/        setSaved(result.error === null);/        setSaved(true);/' app/SaveButton.tsx
```
**Why:** plants a bug: "Saved" would show even when saving failed.

```bash
npx vitest run app/SaveButton.test.tsx
```
**Why:** must fail. Got `1 failed`: `× shows the action's friendly error and keeps the button`.

```bash
cp /tmp/save.bak app/SaveButton.tsx
```
**Why:** restores the file.

```bash
cp app/wishlist/page.tsx /tmp/wlp.bak
```
**Why:** saves the page again, now that it has the review fix.

```bash
sed -i '' 's/^    if (!(err instanceof WishlistError)) console.error("\[wishlist page\] Unexpected error:", err);$/    \/\/ logging removed/' app/wishlist/page.tsx
```
**Why:** plants the bug the review found: a non-database failure would be shown but never logged.

```bash
npx vitest run app/wishlist/page.test.tsx
```
**Why:** must fail. Got `1 failed`: `× shows the friendly message AND logs it…`.

```bash
cp /tmp/wlp.bak app/wishlist/page.tsx
```
**Why:** restores the file. All tests pass again.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 318 passed` (19 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `17 passed` (1 new).

```bash
npm run build
```
**Why:** confirms the production build on its own too. It lists `ƒ /wishlist`, rendered per request because it reads the session and the cookie.

## 5. Commit, publish, PR, auto-merge

```bash
git add lib/wishlist.ts lib/wishlist.test.ts app/wishlist app/SaveButton.tsx app/SaveButton.test.tsx app/ProductCard.tsx app/ProductCard.test.tsx e2e/wishlist.spec.ts docs/learning/49_add_wishlist_page.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "49_add_wishlist_page Add wishlist page with save and remove buttons"
```
**Why:** saves the snapshot.

```bash
git push -u origin 49_add_wishlist_page
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 49_add_wishlist_page --title "49_add_wishlist_page Add wishlist page with save and remove buttons" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Vitest runs a function returned from `beforeEach` as cleanup.** Write `beforeEach(() => { … })` with a block body, never `beforeEach(() => mock.mockX(…))`.
- **Start a `catch` with `unstable_rethrow(err)` when its `try` can call Next APIs that throw on purpose** (Next 16 docs):
  - `redirect()` and `notFound()` always do;
  - `cookies()` and `headers()` only do on routes that must be static (`dynamic = "error"`) or use Partial Prerendering.
  - It's cheap and future-proof, so this page uses it.
- **Reading the cookie is fine in a page; creating it isn't.** The page only calls `getAnonymousId()`.
- **Until task 50**, items saved while signed out stay under the anonymous id, so they don't show after signing in.
- **No site header yet.** The "View wishlist" link after saving is the way in. A nav bar could be a later task.
