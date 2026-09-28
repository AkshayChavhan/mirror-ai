# 56 Add a random share token to each try-on

**Branch:** `56_add_tryon_share_token` (starts from `main`)
**Goal:** the public result link (`/tryon/[shareId]`, task 44) uses a **random, unguessable token**, never the MongoDB ObjectId.
- An ObjectId is a 4-byte timestamp, a 5-byte random value that's the same for the whole server process, and a counter that goes up by 1. From one shared link, someone could step to nearby ids and see other people's photos.
- Added by task 38's review, and approved by the developer on 2026-09-28.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #50 (task 41).

```bash
git checkout -b 56_add_tryon_share_token
```
**Why:** new task, new branch.

```bash
grep -n "random MongoDB ObjectIds\|ObjectId" docs/project-plan.md | head -5
```
**Why:** finds the wrong line in the plan: "Ids are random MongoDB ObjectIds".

## 2. Schema: `TryOn.shareId String @unique`

- The token is stored on the row. `@unique` makes MongoDB refuse duplicates, with an index.

```bash
npx prisma generate
```
**Why:** regenerates the Prisma client, so TypeScript knows `shareId`. (It doesn't touch the database.)

- **The developer then runs `npm run db:push` once**, to create the unique index in Atlas. The guardrail hook blocks Claude from any command containing "push" (task 30).

```bash
node --env-file=.env -e '
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const hide = (s) => String(s).replace(/mongodb(\+srv)?:\/\/\S+/g, "<DATABASE_URL>");
(async () => {
  try {
    const r = await prisma.$runCommandRaw({ count: "TryOn" });
    console.log("TryOn documents:", r.n);
  } catch (e) { console.log("error:", hide(e.message).slice(0, 300)); }
  finally { await prisma.$disconnect(); }
})();'
```
**Why:** a read-only count before the index is created: `TryOn documents: 0`. Rows without a `shareId` would all count as `null` to MongoDB, and a unique index refuses duplicate nulls. So with 0 rows, the index is created cleanly.

## 3. `lib/tryons.ts`

- **`newShareId()`:** `randomBytes(16).toString("base64url")`. That's **128 random bits**, always **22 URL-safe characters** (`A–Z a–z 0–9 - _`), which fit in a link without escaping.
- **`createTryOn`** now saves `shareId: newShareId()`.
- **`getSharedTryOn(shareId)`**, for task 44's public page:
  - It accepts **only** the 22-character token format. An ObjectId (24 hex characters) or anything else returns `null` **without a database call**, so ids from other places can't be used as share links.
  - It checks the **last 24 h**, like the other lookups, in case the cleanup cron runs late.
  - It returns only what the public page shows: the status, the person photo, the result, the time, and the product name.
- **`getTryOnStatus`** (owner only, task 40) now also returns `shareId`, so the loading screen (task 43) can link to the result.
- **`docs/project-plan.md`:** the access note and the TryOn table now say the link uses `shareId`, and that the ObjectId is internal only.

## 4. Tests

- **`lib/tryons.test.ts`:**
  - `createTryOn` saves a `shareId` matching `^[A-Za-z0-9_-]{22}$`;
  - **two try-ons get different tokens**, each decoding to 16 bytes, and never ObjectId-shaped;
  - the status view selects `shareId`;
  - `getSharedTryOn`: the exact query (token, 24 h cutoff, only public fields); **an ObjectId**, a too-short token, bad characters or an empty string return `null` with no DB call; not found; a DB error.
- **`prisma/schema.test.ts`:** the TryOn fields include `shareId`, and it's `@unique`.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run lib/tryons.test.ts prisma/schema.test.ts "app/api/tryon"
```
**Why:** runs this task's tests and the status route's: `55 passed`.

```bash
cp lib/tryons.ts /tmp/tryons.bak
```
**Why:** saves the good file before planting bugs. Each bug below is undone by copying the backup back.

```bash
sed -i '' 's/  return randomBytes(16).toString("base64url");/  return "x".repeat(22);/' lib/tryons.ts
```
**Why:** plants a **guessable token**: the same for every try-on.

```bash
npx vitest run lib/tryons.test.ts
```
**Why:** must fail. Got `1 failed`: `× gives every try-on a different share token…`.

```bash
cp /tmp/tryons.bak lib/tryons.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/^  if (!SHARE_ID.test(shareId)) return null;$/  \/\/ format check removed/' lib/tryons.ts
```
**Why:** plants a bug: any string, **an ObjectId included**, would be looked up.

```bash
npx vitest run lib/tryons.test.ts
```
**Why:** must fail. Got `4 failed` (the four "returns null for…" cases).

```bash
cp /tmp/tryons.bak lib/tryons.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/      where: { shareId, createdAt: { gt: new Date(Date.now() - TRYON_TTL_MS) } },/      where: { shareId },/' lib/tryons.ts
```
**Why:** plants a bug: shared links would still work after 24 h if the cron ran late.

```bash
npx vitest run lib/tryons.test.ts
```
**Why:** must fail. Got `1 failed`.

```bash
cp /tmp/tryons.bak lib/tryons.ts
```
**Why:** restores the file. All tests pass.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 420 passed` (9 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `18 passed`.

```bash
npm run build
```
**Why:** confirms the production build on its own too.

## 5. The task list

- 56 ✅, and "44 waits for 56" is removed.
- New blocker notes:
  - **42 and 43** need signed-in E2E (task 58);
  - **58** needs two test users in the developer's Clerk instance.

## 6. Commit, publish, PR, auto-merge

```bash
git add prisma/schema.prisma prisma/schema.test.ts lib/tryons.ts lib/tryons.test.ts docs/project-plan.md docs/learning/56_add_tryon_share_token.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "56_add_tryon_share_token Add random share tokens for public try-on links"
```
**Why:** saves the snapshot.

```bash
git push -u origin 56_add_tryon_share_token
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 56_add_tryon_share_token --title "56_add_tryon_share_token Add random share tokens for public try-on links" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

```bash
npm run db:push
```
**Why:** **run by the developer after the merge.** It creates the `shareId` unique index in Atlas.

## Gotchas

- **Never put a database id in a public link.** Use a separate random token and check its format before any query.
- **`base64url`, not `base64`:** plain base64 uses `+` and `/`, which break in URLs.
- **If try-ons already existed before this change,** delete those TryOn documents (they expire in 24 h anyway) before `npm run db:push`. Otherwise it fails with `E11000 duplicate key` (found in review).
- **Task 44 must pick one name for the dynamic segment:** `/tryon/[id]` (pages table) or `/tryon/[shareId]` (TryOn table). Either way, its value is the share token.
- **A blocked command stops only itself.** Here, one command was blocked (its text mentioned the push script) while the next ones still ran, and the branch was published without its commit. So commit, then publish, then open the PR, one at a time, checking each result.
- **Schema changes need `npm run db:push`** on the real database, for indexes like `@unique`. The unit tests mock Prisma, so they can't catch a missing index.
