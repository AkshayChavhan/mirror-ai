# 48 Add the wishlist actions

**Branch:** `48_add_wishlist_actions` (starts from `main`)
**Goal:** Server Actions to add a garment to the wishlist and remove one, signed in **or** signed out (decided: "works without login", and duplicates are OK). The `/wishlist` page and the buttons come in task 49.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #43 (task 47, the anonymous-id cookie).

```bash
git checkout -b 48_add_wishlist_actions
```
**Why:** new task, new branch.

```bash
sed -n '/model WishlistItem/,/^}/p' prisma/schema.prisma && grep -n "wishlistItem" node_modules/.prisma/client/index.d.ts | head -3
```
**Why:** the model has `userId?` **or** `anonymousId?`, plus `productId`, with an index on each owner column. The client calls it `prisma.wishlistItem`.

## 2. `lib/wishlist.ts`

- **`WishlistOwner`** is `{ userId }` **or** `{ anonymousId }`. The caller works it out from the session or the cookie, never from input.
- **`addWishlistItem(owner, productId)`** creates a row with **only that owner's column set**. Duplicates are allowed (no unique check), as decided.
- **`removeWishlistItem(owner, itemId)`** runs `deleteMany({ where: { id: itemId, ...owner } })`.
  - **The owner is in the query**, so someone else's item simply doesn't match and nothing is deleted.
  - It returns whether anything was removed.
- A malformed product id gives `INVALID_INPUT`. A malformed item id returns `false`. An empty owner gives `INVALID_INPUT`, with no DB call in any of these cases.
- DB errors become `WishlistError` `DB_ERROR` with a friendly message, and are logged.

## 3. `app/wishlist/actions.ts` ("use server")

```bash
mkdir -p app/wishlist
```
**Why:** the actions sit next to the `/wishlist` page (task 49).

- **`addToWishlistAction(productId)`:**
  1. validates the id, and checks the product **exists and is active** (hidden garments can't be saved);
  2. works out the owner: **Clerk `userId`**, or else **`getOrCreateAnonymousId()`**. This is where the cookie gets created: Next 16 sets cookies only in Server Actions and Route Handlers, never while a page renders. It happens *after* the checks, so a bad request never leaves a cookie;
  3. saves, `revalidatePath("/wishlist")`, and returns `{ error: null }`.
- **`removeFromWishlistAction(itemId)`:**
  - the owner is the Clerk `userId`, or else **`getAnonymousId()`**, which **never creates** a cookie. With no cookie there's nothing to remove;
  - "not yours" and "missing" get the same message: "That item isn't in your wishlist."
- Both return only `{ error }`, and never throw at the UI. `WishlistError` and `ProductError` messages are shown; anything else gets a generic message and is logged.
- **No `requireUser()`:** signed-out visitors are allowed by design. Every action still works out its owner itself (the Next 16 rule for actions).

## 4. Tests

- **`lib/wishlist.test.ts`** (Prisma mocked):
  - add for a user and for a visitor (only their column is set);
  - a malformed product id;
  - an empty user or anonymous id;
  - DB errors hidden and logged;
  - remove with the owner in the `where`;
  - remove with an empty owner (no DB call);
  - no match gives `false`;
  - a malformed id makes no DB call;
  - a DB error becomes `DB_ERROR`.
- **`app/wishlist/actions.test.ts`** (Clerk, cookie, products, lib and cache mocked):
  - **add:** a signed-in user (no cookie); signed out (cookie created); a malformed or non-string id (no lookup, no cookie); an unknown or hidden product (**no cookie**); lookup and save errors (no revalidate); unexpected errors.
  - **remove:** a signed-in user; signed out (**never creates a cookie**); no cookie; not yours; a non-string id; a DB error.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run lib/wishlist.test.ts app/wishlist
```
**Why:** runs this task's tests: `27 passed` (12 lib, 15 actions).

```bash
cp lib/wishlist.ts /tmp/wl.bak && cp app/wishlist/actions.ts /tmp/wla.bak
```
**Why:** saves the good files before planting bugs. Each bug below is undone by copying its backup back.

```bash
sed -i '' 's/    prisma.wishlistItem.deleteMany({ where: { id: itemId, ...fields } }),/    prisma.wishlistItem.deleteMany({ where: { id: itemId } }),/' lib/wishlist.ts
```
**Why:** plants a **security bug**: anyone could delete anyone's item.

```bash
npx vitest run lib/wishlist.test.ts
```
**Why:** must fail. Got `2 failed` (the owner checks for a user and for a visitor).

```bash
cp /tmp/wl.bak lib/wishlist.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/      const anonymousId = await getAnonymousId();/      const anonymousId = await getOrCreateAnonymousId();/' app/wishlist/actions.ts
```
**Why:** plants a bug: "remove" would create a cookie for a visitor who never saved anything.

```bash
npx vitest run app/wishlist
```
**Why:** must fail. Got `2 failed`.

```bash
cp /tmp/wla.bak app/wishlist/actions.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/    if (!product || !product.isActive) return/    if (!product) return/' app/wishlist/actions.ts
```
**Why:** plants a bug: hidden garments could be saved.

```bash
npx vitest run app/wishlist
```
**Why:** must fail. Got `1 failed`: `× refuses a hidden product…`.

```bash
cp /tmp/wla.bak app/wishlist/actions.ts
```
**Why:** restores the file. All 27 tests pass.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 299 passed` (27 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `16 passed`. No new E2E yet: nothing calls the actions until task 49.

```bash
npm run build
```
**Why:** confirms the production build on its own too.

## 5. Commit, publish, PR, auto-merge

```bash
git add lib/wishlist.ts lib/wishlist.test.ts app/wishlist docs/learning/48_add_wishlist_actions.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "48_add_wishlist_actions Add wishlist add and remove actions"
```
**Why:** saves the snapshot.

```bash
git push -u origin 48_add_wishlist_actions
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 48_add_wishlist_actions --title "48_add_wishlist_actions Add wishlist add and remove actions" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **The owner always comes from the server** (the session or the cookie), never from a form field, so nobody can add to or remove from someone else's list.
- **Only create the cookie when saving.** Browsing or removing never creates one.
- **Not done here:**
  - refreshing the cookie's `maxAge` on each save (task 47's notes);
  - **a per-owner item limit.** A bot that never keeps the cookie gets a new id and a new row on every request. That's now **task 57**, waiting for the developer's OK.
- **For task 49:** these actions take a plain `(productId)` / `(itemId)`. `useActionState` calls actions with `(prevState, formData)`, so call them inside `startTransition` (or `.bind`) instead.
- **Until task 50**, items saved while signed out stay on the anonymous id, so after signing in they don't show and can't be removed.
