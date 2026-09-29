# 63 Add a "View and share" link on /history

**Branch:** `63_add_history_share_link` (starts from `main`)
**Goal:** each **finished** try-on on `/history` gets a **View and share** link to its public result page `/tryon/[shareId]` (task 44). That page has the before/after slider, the download and the WhatsApp button (task 45).
- **Why:** until now nothing in the app linked the owner to that page, so they couldn't reach their own share link. Found while building task 45.
- The developer said "yes" to this task on 2026-09-29.

## 1. Create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #59 (task 52). That PR added row 63 to the task list.

```bash
git checkout -b 63_add_history_share_link
```
**Why:** new task, new branch.

```bash
cat app/history/page.tsx
```
**Why:** reads the page. Each item shows the result image (or a status message), the product name and "5 min ago". `listRecentTryOns` didn't return the share token yet.

## 2. The change

- **`lib/tryons.ts`:** `RecentTryOn` gains `shareId`, and `listRecentTryOns` selects `shareId: true`. It's still only what `/history` needs.
- **`app/history/page.tsx`:** under the time, **only for a finished try-on with a result image**:

```tsx
<Link href={`/tryon/${tryOn.shareId}`} aria-label={`View and share your ${product.name} try-on from ${timeAgo(tryOn.createdAt, now)}`} className="text-sm underline">
  View and share
</Link>
```
- **The share token, never the id.** The public page only accepts the random 22-character token (task 56), so an ObjectId link would be a 404 anyway, and ObjectIds can be guessed.
- **Accessible name:** every item would otherwise have a link called just "View and share", and the same garment tried on twice would give two identical names. So the `aria-label` adds the product name **and the time** ("View and share your Linen Shirt try-on from 5 min ago"), so names are usually unique per item (found in review). Two try-ons of one garment in the same minute, or the same hour once they're over an hour old, can still read alike; each link sits in its own list item next to its heading and time, so that's still clear. It **starts with the visible text** ("label in name"), so saying "click View and share" still works with voice control.
- **Pending, processing and failed try-ons get no link.** Their public page would only say "still being created" or "didn't work", which is nothing to share.
- `/history` stays signed-in only (`requireUser()` first), and the page-protection check (`app/page-auth.test.ts`) still passes.

## 3. Tests

- **`lib/tryons.test.ts`:** `listRecentTryOns` now selects `shareId`.
- **`app/history/page.test.tsx`:**
  - a finished try-on has the link "View and share your Linen Shirt try-on from 5 min ago", with `href="/tryon/<share token>"` and visible text "View and share";
  - two try-ons of the same garment get different link names (5 min ago / 2 h ago) and their own tokens;
  - pending, processing, failed and "done without an image" try-ons have **no** share link.
- **No E2E test yet:** `/history` needs a signed-in browser, which waits for task 58 (as row 63 says).

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run app/history lib/tryons.test.ts
```
**Why:** runs the history page, `timeAgo` and try-on query tests: `3 passed`, `69 passed` (after the review's naming fix).

```bash
cp app/history/page.tsx <scratch>/history-page.tsx.bak && sed -i '' 's|href={`/tryon/${tryOn.shareId}`}|href={`/tryon/${tryOn.id}`}|' app/history/page.tsx && npx vitest run app/history/page.test.tsx; cp <scratch>/history-page.tsx.bak app/history/page.tsx
```
**Why:** a mutation check. It links with the ObjectId instead of the share token, the link test fails, and the file is restored. `<scratch>` is any temporary folder.

```bash
grep -n 'href=' app/history/page.tsx
```
**Why:** confirms the restore: line 51 is back to `/tryon/${tryOn.shareId}`. (A first `grep -c` with `${…}` in the pattern matched nothing, because `$` is special in grep patterns.)

```bash
npm test
```
**Why:** runs the whole suite: `Tests 499 passed` (2 new tests; the other changes add checks to existing tests).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh && npm run build
```
**Why:** the rest of the checklist, and all of it passes. E2E locally: `19 passed, 7 skipped` (the seeded specs need CI's database).

## 4. Commit, publish, PR, auto-merge

```bash
git add lib/tryons.ts lib/tryons.test.ts app/history/page.tsx app/history/page.test.tsx docs/task-list.md docs/learning/63_add_history_share_link.md
```
**Why:** stages this task's files.

```bash
git commit -m "63_add_history_share_link Add View and share link to finished try-ons on history"
```
**Why:** saves the snapshot.

```bash
git push -u origin 63_add_history_share_link
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 63_add_history_share_link --title "63_add_history_share_link Add View and share link to finished try-ons on history" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Repeated link text needs a unique accessible name.** Add what tells the items apart (here, the product and the time), and keep the visible words at the start of the `aria-label`.
- **Public links use the share token, never the database id.**
- **`$` is special in grep patterns**, so quote carefully or use `grep -F` for literal text.
