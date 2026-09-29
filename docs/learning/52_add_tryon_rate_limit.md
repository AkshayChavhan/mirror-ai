# 52 Add a try-on rate limit

**Branch:** `52_add_tryon_rate_limit` (starts from `main`)
**Goal:** each signed-in user can start at most **3 try-ons in any rolling hour**. The 4th is refused with a friendly message saying when they can start another.
- **Why:** every try-on spends the shared Hugging Face GPU quota (`HF_TOKEN`, docs/project-plan.md) plus Cloudinary storage. Without a limit, one user or a script could use it all up.
- **The developer's decisions (2026-09-29):**
  - "3 per hour";
  - "yes to both" for Claude's two suggestions: **failed try-ons don't count** (not the user's fault), and **admins have no limit**.

## 1. Create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #58 (task 62).

```bash
git checkout -b 52_add_tryon_rate_limit
```
**Why:** new task, new branch.

```bash
cat app/tryon/actions.ts lib/auth.ts && grep -n "model TryOn" -A 20 prisma/schema.prisma
```
**Why:** reads the "Try on" action (the only place try-ons are created), `isAdmin()`, and the `TryOn` model. `@@index([userId, createdAt])` already exists, so counting a user's recent try-ons is a cheap, indexed query.

## 2. How it works

**`lib/tryons.ts`:**
- `TRYON_LIMIT = 3` and `TRYON_LIMIT_WINDOW_MS = 1 h` (exported).
- A private query reads the user's **counted** try-ons from the last hour, newest first, taking at most 4:
  - `status: { not: "FAILED" }`, so failed ones don't count;
  - `createdAt > now − 1 h`;
  - only `createdAt` is selected.
- **`nextTryOnAllowedAt(userId, now?)`** is the check *before* starting.
  - It returns `null` when there are fewer than 3.
  - Otherwise it returns the time the **3rd newest** try-on is an hour old: then only 2 are left in the hour, which leaves room for one more.
  - Example: try-ons 5, 20 and 48 minutes ago give "in 12 minutes".
- **`isOverTryOnLimit(userId, now?)`** is the re-check *after* saving. It returns `true` when there are **more than 3** (the new one included).
- An empty user id is `INVALID_INPUT`. Database errors become `DB_ERROR` (logged), like every other query in the file.

**`app/tryon/actions.ts`**, in order:
1. `requireUser()`, then the photo checks (no database needed).
2. **`checkTryOnLimit(userId, userIsAdmin)`, before anything is uploaded.** Over the limit and not an admin: *"You've used your 3 try-ons for this hour. You can start another in 12 minutes."*
   - The message uses **minutes, not a clock time**: the server doesn't know the user's time zone.
   - It says at least "1 minute", never "0 minutes".
3. The product check, upload, and `createTryOn` (unchanged).
4. **Re-check: `isOverTryOnLimit`.** Two try-ons started at the same moment could both pass step 2. Each re-check counts the other's row, so they can't both stay (at worst both are undone, and a retry works). This is the same "save, then count" idea as task 57.
   - **Over (and not an admin):** `undoTryOn()` deletes the photo first, then the row (`deleteTryOns`), and the job is never started. The message is *"Too many try-ons started at once. Please try again in a moment."*
     - Why not a wait time: the other racer may be being undone too, so a wait worked out now could be wrong (found in review).
   - **If the re-check itself fails** (the database, or Clerk): the try-on is undone too, so no half-started try-on is left behind. The user sees the friendly message.
   - **If deleting the row fails:** it's logged, and the row is **marked FAILED instead** (`failTryOn(…, ["PENDING"])`). So it isn't stuck "Waiting to start…" on `/history`, and it doesn't count toward the limit (found in review). If that fails too, both are logged.
   - **If deleting the photo fails,** the hourly folder sweep (task 61) removes it after 25 h.
- **Admins:** `isAdmin()` calls Clerk, so it's asked **only when someone is over the limit**, and **at most once per request**.
  - `createTryOnAction` keeps the answer: `let admin: Promise<boolean> | undefined; const userIsAdmin = () => (admin ??= isAdmin());`, and passes `userIsAdmin` to both checks.
  - If Clerk fails, the user gets the generic "Something went wrong" message (logged). In the first check nothing has been uploaded yet; in the re-check the try-on is undone.

## 3. Task list (developer's answers of 2026-09-29)

- Row 52 ✅, with "confirmed by the developer" for the two rules.
- Row 57 now records that moving signed-out items in at sign-in keeps them all, even past 100 ("let it be as it is"). Task 57's learning doc says it was confirmed.
- **New row 63 `63_add_history_share_link`:** a "View and share" link on `/history` to each finished try-on's result page ("3. yes").

## 4. Tests

- **`lib/tryons.test.ts`** (Prisma mocked, a fixed "now"):
  - the limit is 3 an hour;
  - the exact query (the user, not FAILED, the last hour, newest first, `take: 4`, only `createdAt`);
  - **under** (2) gives `null`;
  - **at** (3) gives "12:12" for 5, 20 and 48 minutes ago;
  - **over** (4 after a race) counts from the 3rd newest;
  - `isOverTryOnLimit`: 3 gives `false`, 4 gives `true`;
  - an empty user id and a database error.
- **`app/tryon/actions.test.ts`** (auth, Cloudinary, database and Inngest mocked):
  - under the limit it starts, and Clerk isn't asked about admin;
  - at the limit it refuses **before uploading**, with "12 minutes";
  - under a minute it says "1 minute";
  - an **admin** gets past both checks, and **Clerk is asked once**;
  - a **race** undoes the try-on (photo before row), says "Too many try-ons started at once…", and never sends the job;
  - a failed re-check undoes it too;
  - **Clerk failing** in the first check uploads nothing; in the re-check the try-on is undone;
  - a failed row delete marks the row FAILED instead, and if that fails too, both are logged;
  - a failed first check uploads nothing.
- No E2E test: `/tryon` needs a signed-in browser, which waits for task 58.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run lib/tryons.test.ts
```
**Why:** the query tests: `49 passed`.

```bash
npx vitest run app/tryon/actions.test.ts
```
**Why:** the action tests: `33 passed` (after the review fixes).

```bash
cp app/tryon/actions.ts <scratch>/actions.ts.bak && sed -i '' 's/if (retryAt \&\& !(await userIsAdmin())) throw/if (retryAt) throw/' app/tryon/actions.ts && npx vitest run app/tryon/actions.test.ts; cp <scratch>/actions.ts.bak app/tryon/actions.ts
```
**Why:** mutation check 1. It removes the admin exemption from the first check, and 2 tests fail: `lets an admin past both checks, asking Clerk only once` and `if Clerk fails in the first check…` (Clerk is never asked). Then the file is restored. `<scratch>` is any temporary folder.

```bash
cp lib/tryons.ts <scratch>/tryons.ts.bak && sed -i '' '/status: { not: TryOnStatus.FAILED },/d' lib/tryons.ts && npx vitest run lib/tryons.test.ts; cp <scratch>/tryons.ts.bak lib/tryons.ts
```
**Why:** mutation check 2. It makes failed try-ons count, the query test fails, and the file is restored.

```bash
cp app/tryon/actions.ts <scratch>/actions.ts.bak && sed -i '' 's/const userIsAdmin: AdminCheck = () => (admin ??= isAdmin());/const userIsAdmin: AdminCheck = () => isAdmin();/' app/tryon/actions.ts && npx vitest run app/tryon/actions.test.ts; cp <scratch>/actions.ts.bak app/tryon/actions.ts
```
**Why:** mutation check 3. Without the memo, Clerk is asked twice, and `…asking Clerk only once` fails.

```bash
cp app/tryon/actions.ts <scratch>/actions.ts.bak && perl -0pi -e 's/    await failTryOn\(tryOnId, START_FAILED, \["PENDING"\]\)\.catch/    await Promise.resolve().catch/' app/tryon/actions.ts && npx vitest run app/tryon/actions.test.ts; cp <scratch>/actions.ts.bak app/tryon/actions.ts
```
**Why:** mutation check 4. Without the FAILED fallback, the two row-delete tests fail (`2 failed`). Then the file is restored.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 497 passed` (20 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh && npm run build
```
**Why:** the rest of the checklist, and all of it passes. E2E locally: `19 passed, 7 skipped` (the seeded specs need CI's database).

## 5. Commit, publish, PR, auto-merge

```bash
git add lib/tryons.ts lib/tryons.test.ts app/tryon/actions.ts app/tryon/actions.test.ts docs/task-list.md docs/learning/57_add_wishlist_item_limit.md docs/learning/52_add_tryon_rate_limit.md
```
**Why:** stages this task's files, plus the one-line decision note in task 57's doc.

```bash
git commit -m "52_add_tryon_rate_limit Limit try-ons to 3 per user per hour"
```
**Why:** saves the snapshot.

```bash
git push -u origin 52_add_tryon_rate_limit
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 52_add_tryon_rate_limit --title "52_add_tryon_rate_limit Limit try-ons to 3 per user per hour" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Check before the expensive step, re-check after saving.** The first check stops the normal case before any upload. The re-check catches two requests at once, which a check alone can't.
- **Don't call Clerk on every request just to find admins.** Ask only when the answer matters (over the limit).
- **Show waits as minutes, not clock times.** The server runs in UTC and doesn't know the user's time zone.
- **A clean-up step can fail too.** Undoing a half-started try-on has its own fallback (mark it FAILED), so a database hiccup can't leave a row that looks like it's still starting.
- **"Failed ones don't count" is part of the query** (`status: { not: "FAILED" }`), not a filter afterwards. So `take: 4` still means 4 counted try-ons.
