# 50 Move the anonymous wishlist to the account on sign-in

**Branch:** `50_add_wishlist_merge_on_sign_in` (starts from `main`)
**Goal:** items saved while signed out (under the anonymous cookie, task 47) move to the user's account after they sign in (decided in docs/project-plan.md, "WishlistItem").

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #45 (task 49, the wishlist page).

```bash
git checkout -b 50_add_wishlist_merge_on_sign_in
```
**Why:** new task, new branch.

## 2. When should the move happen?

```bash
grep -rn -i "useEffect" node_modules/next/dist/docs/01-app/01-getting-started/*mutating* node_modules/next/dist/docs/01-app/02-guides/server-actions.md
```
**Why:** the Next 16 docs allow calling a Server Action "from … `useEffect` wrapped in `startTransition`", including "when the component mounts".

```bash
grep -n -i "delete(" node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md
```
**Why:** `(await cookies()).delete(name)` removes a cookie. Like `set`, it only works in a Server Action or Route Handler.

- **The problem:** a page render can't delete cookies, and shouldn't write to the database. Renders can repeat, for example on prefetch.
- **The choice:** the move runs in a **Server Action**. `/wishlist` triggers it automatically when a **signed-in** user still has an anonymous cookie. So items move the first time you open your wishlist after signing in.
- A Clerk webhook would need a webhook secret and a new package; this needs neither.

## 3. The code

- **`lib/wishlist.ts`:** `claimAnonymousItems(anonymousId, userId)` runs one `updateMany({ where: { anonymousId, OR: [{ userId: null }, { userId: { isSet: false } }] }, data: { userId, anonymousId: null } })` and returns how many moved.
  - Only items that don't belong to a user yet are moved.
  - **Why the `OR`** (found in review): on MongoDB, Prisma treats a **`null` field and a missing field differently**. An item created without `userId` may have the field missing, and `userId: null` alone might not match it. `isSet: false` matches a missing field.
  - A repeat call moves 0.
  - An empty id gives `INVALID_INPUT`, with no DB call.
- **`lib/anonymous-id.ts`:** `clearAnonymousId()` deletes the cookie.
- **`app/wishlist/actions.ts`:** `claimAnonymousWishlistAction()`.
  - The user comes from **Clerk's session** and the anonymous id from the **httpOnly cookie**. The action takes no arguments, so nobody can claim someone else's list.
  - Signed out, or no cookie: it does nothing.
  - Otherwise it moves the items, **then** deletes the cookie. If the move fails, the cookie stays, so the items can be claimed next time.
  - It refreshes `/wishlist` and returns `{ moved, error }`.
- **`app/wishlist/ClaimAnonymousWishlist.tsx`** (client) calls the action once on mount, inside `startTransition`.
  - A `useRef` guard keeps it to **once**, even with React StrictMode's double effects in development. The action is safe to repeat anyway.
  - It shows "Moving your saved items to your account…" (`role="status"`) while it works, and a friendly `role="alert"` on error.
- **`app/wishlist/page.tsx`** now reads the cookie even when signed in. **Signed in plus a cookie** renders `<ClaimAnonymousWishlist />`; the list itself always shows the user's own items.

## 4. Tests

- **`lib/wishlist.test.ts`:** the exact `updateMany` (only unowned items); a repeat call gives 0; an empty anonymous id or user id makes no DB call; a DB error becomes `DB_ERROR`.
- **`lib/anonymous-id.test.ts`:** `clearAnonymousId` deletes `mirror_anon_id`.
- **`app/wishlist/actions.test.ts`:**
  - moves with the cookie id plus the session user, **then** clears the cookie (the call order is checked), and refreshes;
  - signed out does nothing;
  - no cookie does nothing;
  - an unexpected error (Clerk failing) gets a generic message and is logged;
  - **a failed move keeps the cookie**.
- **`app/wishlist/ClaimAnonymousWishlist.test.tsx`:**
  - **claims once under `<StrictMode>`**;
  - shows a status while pending, and nothing after;
  - the action's error;
  - a request failure.
- **`app/wishlist/page.test.tsx`:** signed in with no cookie shows no mover; **signed in with a cookie shows the mover** and still lists the user's items; signed out shows no mover.

```bash
grep -n "export type StringNullableFilter<" -A16 node_modules/.prisma/client/index.d.ts | grep -n "isSet\|equals"
```
**Why:** confirms the generated client supports `isSet` on nullable strings like `userId`.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run app/wishlist lib/wishlist.test.ts lib/anonymous-id.test.ts
```
**Why:** runs this task's tests: `71 passed`.

```bash
cp app/wishlist/actions.ts /tmp/wla.bak && cp lib/wishlist.ts /tmp/wl.bak && cp app/wishlist/ClaimAnonymousWishlist.tsx /tmp/claim.bak
```
**Why:** saves the good files before planting bugs. Each bug below is undone by copying its backup back.

```bash
sed -i '' 's/^    await clearAnonymousId(); \/\/ after the move.*$/    \/\/ cookie delete removed/' app/wishlist/actions.ts
```
**Why:** plants a bug: the cookie is never deleted after the move.

```bash
npx vitest run app/wishlist/actions.test.ts
```
**Why:** must fail. Got `1 failed`.

```bash
cp /tmp/wla.bak app/wishlist/actions.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/      where: { anonymousId, OR: \[{ userId: null }, { userId: { isSet: false } }\] },/      where: { anonymousId },/' lib/wishlist.ts
```
**Why:** plants a bug: the move is no longer limited to unowned items.

```bash
npx vitest run lib/wishlist.test.ts
```
**Why:** must fail. Got `1 failed`.

```bash
cp /tmp/wl.bak lib/wishlist.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/^    if (started.current) return;$/    \/\/ once-guard removed/' app/wishlist/ClaimAnonymousWishlist.tsx
```
**Why:** plants a bug: StrictMode's double effect would claim twice.

```bash
npx vitest run app/wishlist/ClaimAnonymousWishlist.test.tsx
```
**Why:** must fail. Got `1 failed`: `× claims once when the page opens, even under StrictMode's double effects`.

```bash
cp /tmp/claim.bak app/wishlist/ClaimAnonymousWishlist.tsx
```
**Why:** restores the file. All 71 tests pass.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 334 passed` (16 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `17 passed`. There's no new E2E test, because signing in inside E2E needs `@clerk/testing`, which isn't approved (an open question).

```bash
npm run build
```
**Why:** confirms the production build on its own too.

## 5. Commit, publish, PR, auto-merge

```bash
git add lib/wishlist.ts lib/wishlist.test.ts lib/anonymous-id.ts lib/anonymous-id.test.ts app/wishlist docs/learning/50_add_wishlist_merge_on_sign_in.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "50_add_wishlist_merge_on_sign_in Move anonymous wishlist items to the account after sign-in"
```
**Why:** saves the snapshot.

```bash
git push -u origin 50_add_wishlist_merge_on_sign_in
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 50_add_wishlist_merge_on_sign_in --title "50_add_wishlist_merge_on_sign_in Move anonymous wishlist items to the account after sign-in" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Packages:** none added.
- **To check by hand once:** save an item while signed out, sign in, open `/wishlist`, and confirm the item appears. The unit tests mock Prisma, so only a real database proves the `null`/missing handling.

- **Items move when the user next opens `/wishlist`**, not the instant they sign in. Nothing else shows wishlist items, so that's early enough. They also move whenever the page opens again with a leftover cookie.
- **A shared device:** the anonymous cookie belongs to the browser, not a person. Whoever signs in next on that browser receives its signed-out items. That's how a device-level anonymous wishlist works.
- **Mutations belong in Server Actions, not renders.** A page can *decide* that a move is needed; a client component then *calls* the action.
