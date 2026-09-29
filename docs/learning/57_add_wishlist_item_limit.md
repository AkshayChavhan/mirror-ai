# 57 Add a wishlist item limit

**Branch:** `57_add_wishlist_item_limit` (starts from `main`)
**Goal:** one owner (a signed-in user, or a signed-out browser's anonymous id) can save at most **100 items**. Saving the 101st shows a friendly message.
- **Why:** without a limit, anyone could keep saving and grow the database without end.
- **The number** was picked by the developer on 2026-09-29 ("100 items in wishlist").

## 1. Create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #55. That PR also recorded "100" in row 57, and this task edits the same row, so waiting for it avoids a conflict.

```bash
git checkout -b 57_add_wishlist_item_limit
```
**Why:** new task, new branch.

```bash
cat lib/wishlist.ts app/wishlist/actions.ts app/SaveButton.tsx
```
**Why:** finds where saves happen. Every save goes through `addWishlistItem()` in `lib/wishlist.ts`, so the limit goes there. The Save button already shows any `WishlistError` message it gets back.

## 2. How the limit works (`lib/wishlist.ts`)

- **`WISHLIST_ITEM_LIMIT = 100`** (exported), plus a new error code, `LIMIT_REACHED`.
- **Save first, then count, and undo when over:**
  1. `create` the item;
  2. `undoIfOverLimit()` counts the owner's items for **garments still shown to shoppers** (`product: { isActive: true }`);
  3. if the count is **over 100**, it deletes that new item (`deleteMany({ where: { id } })`).
- **Why this order instead of "count, then save"?** Two saves at the same moment could both count 99 and both save, leaving 101. With "save, then count", each save also sees the other's row, so **racing saves can't take the list over the limit**. At worst both are refused, and a retry works.
- **It's a limit on saving, not a hard ceiling** (found in review). The list can still pass 100 when:
  - signed-out items are moved in after sign-in (see below);
  - an admin shows a hidden garment again (its items count again);
  - the database fails between the save and the undo (logged).
- **If the count fails, the new item is deleted too.** So an error still means "nothing was saved", and a retry doesn't save a second copy (the same garment may be saved twice). If that undo also fails, both errors are logged.
- `deleteMany` rather than `delete`: if the item were already gone (removed in another tab), `delete` would throw "not found".
- **The message** is thrown *after* `db()`, because `db()` turns every error inside it into `DB_ERROR`. It reads: *"Your wishlist is full (100 items). Remove some to save more."* The Save button shows it, and it isn't logged as an error, because it isn't one.
- **Only visible garments count, just like `/wishlist`.** If an item for a hidden garment counted, the list could say "full" while showing 97 items, and the owner couldn't remove the 3 they can't see.
- **After sign-in, moving the signed-out items to the account (task 50) keeps them all.** Nothing a person saved is dropped. That was Claude's choice, and the developer confirmed it on 2026-09-29 (recorded in task 52's branch).
  - One move into an account at or under 100 reaches at most 200.
  - The page's display cap **`LIST_LIMIT`** is now `2 × WISHLIST_ITEM_LIMIT` (200), so after one move every item shows and can be removed.
  - Only repeated moves (sign out, save 100, sign in, again) go further. Then the page shows the newest 200, and older ones appear as newer ones are removed.
  - Saving works again once the list is under 100.

## 3. Tests

- **`lib/wishlist.test.ts`** (Prisma mocked; a `count` function was added to the fake):
  - a save counts **only this owner's items for visible garments**, and deletes nothing;
  - **at the limit:** a count of 100 still saves;
  - **over the limit:** a count of 101 deletes the new item and throws `LIMIT_REACHED` with the exact message;
  - a failed count **deletes the new item too** and becomes `DB_ERROR` (logged);
  - a failed count plus a failed undo: still `DB_ERROR`, both logged;
  - over the limit with a failed undo: `DB_ERROR`, not "full", logged;
  - `listWishlist` now shows up to `2 × WISHLIST_ITEM_LIMIT`.
- **`app/wishlist/actions.test.ts`:** a full wishlist returns the message as-is, doesn't log it, and doesn't refresh `/wishlist`.
- **`e2e/seeded-data.spec.ts`** (CI's seeded database, added after review): a signed-out visitor clicks **Save** on the landing page, sees "Saved", and finds the garment on `/wishlist`.
  - This is the only test that runs the new `count` with its visible-garments filter against a **real MongoDB**. If Prisma's MongoDB engine rejected it, every save would be undone, so it's worth one browser test.
  - It uses a fresh browser, so it gets a new anonymous id and never touches the seeded wishlist that another spec checks.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run wishlist
```
**Why:** runs every test file with "wishlist" in its path: `5 passed`, `63 passed` (after the review fixes).

```bash
cp lib/wishlist.ts <scratch>/wishlist.ts.bak && sed -i '' 's/count <= WISHLIST_ITEM_LIMIT/count < WISHLIST_ITEM_LIMIT/' lib/wishlist.ts && npx vitest run lib/wishlist.test.ts; cp <scratch>/wishlist.ts.bak lib/wishlist.ts
```
**Why:** a quick **mutation check**. It plants an off-by-one bug (refusing the 100th item), confirms a test catches it (`allows the 100th item` failed), then restores the real file. `<scratch>` is any temporary folder, and `sed -i ''` is the macOS form.

```bash
cp lib/wishlist.ts <scratch>/wishlist.ts.bak && perl -0pi -e 's/await prisma\.wishlistItem\.deleteMany\(\{ where: \{ id: itemId \} \}\)\.catch/await Promise.resolve().catch/' lib/wishlist.ts && npx vitest run lib/wishlist.test.ts; cp <scratch>/wishlist.ts.bak lib/wishlist.ts
```
**Why:** a second mutation check. It removes the undo after a failed count, and both failed-count tests catch it (`2 failed`). Then it restores the file. `perl` here because the pattern has many brackets.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 461 passed` (6 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh && npm run build
```
**Why:** the rest of the checklist, and all of it passes. E2E locally: `19 passed, 6 skipped`. The seeded specs, including the new save test, need CI's database. There's no browser test for the full wishlist itself: saving 100 items in a browser would add little over the unit tests.

## 4. Commit, publish, PR, auto-merge

```bash
git add lib/wishlist.ts lib/wishlist.test.ts app/wishlist/actions.test.ts e2e/seeded-data.spec.ts docs/task-list.md docs/learning/57_add_wishlist_item_limit.md
```
**Why:** stages this task's files.

```bash
git commit -m "57_add_wishlist_item_limit Limit wishlists to 100 items per owner"
```
**Why:** saves the snapshot.

```bash
git push -u origin 57_add_wishlist_item_limit
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 57_add_wishlist_item_limit --title "57_add_wishlist_item_limit Limit wishlists to 100 items per owner" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Check-then-act races:** "count, then save" looks right but lets two parallel saves both pass. With "save, then count, undo if over", racing saves can't pass the limit, as long as each step succeeds.
- **A new step that can fail needs its own undo.** Before this task, a `DB_ERROR` meant nothing was saved. Adding a count after the save could have broken that, so a failed count deletes the new item too (found in review).
- **A per-owner limit doesn't stop a determined script.** Clearing the cookie gives a new anonymous id. It stops runaway growth from one browser or account; a request rate limit would be a separate task.
- **Errors thrown inside `db()` become `DB_ERROR`.** Return a flag from inside `db()` and throw the friendly error outside it.
