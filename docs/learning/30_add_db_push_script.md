# 30 Add the `db:push` script

**Branch:** `30_add_db_push_script` (starts from `main`)
**Goal:** connect to the developer's MongoDB Atlas database, and add `npm run db:push`, which creates the collections and indexes from `prisma/schema.prisma`.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #38 (task 38, the try-on action).

```bash
git checkout -b 30_add_db_push_script
```
**Why:** new task, new branch.

## 2. The developer adds `DATABASE_URL` to `.env`

- Atlas → **Connect → Drivers**, then copy the `mongodb+srv://…` string.
- Replace `<db_password>`, **including the `<` and `>`**, with the password.
- Add the database name after `.mongodb.net/`: `...mongodb.net/mirror-ai?retryWrites=true&w=majority`. **Prisma needs a database name** in the URL.
- Atlas → **Network Access**, then allow your IP address.
- **Never paste the password into a chat, a doc or a commit.** It goes only in `.env`, which `.gitignore` keeps out of git. A password pasted into a chat counts as exposed: change it in Atlas → **Database Access → Edit**.

## 3. Check the URL without printing it

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
node --env-file=.env -e '
const u = process.env.DATABASE_URL || "";
if (!u) { console.log("DATABASE_URL: missing"); process.exit(0); }
try {
  const x = new URL(u);
  console.log({
    scheme: x.protocol,
    atlasHost: x.hostname.endsWith(".mongodb.net"),
    database: x.pathname.slice(1) || "(none - Prisma needs one)",
    hasUser: Boolean(x.username),
    hasPassword: Boolean(x.password),
    placeholderLeft: /<|>/.test(decodeURIComponent(u)),
  });
} catch { console.log("DATABASE_URL: not a valid URL"); }'
```
**Why:** `--env-file=.env` (Node 22) loads `.env`. The script prints only **yes/no facts** and the database name, never the user, password or host.
- The first try showed `database: '(none …)'` and `placeholderLeft: true`, so the URL still needed fixing.

```bash
node --env-file=.env -e '
try {
  const x = new URL(process.env.DATABASE_URL || "");
  const has = (s) => /<|>/.test(decodeURIComponent(s));
  console.log({ inUser: has(x.username), inPassword: has(x.password), inHost: has(x.hostname), inPathOrQuery: has(x.pathname + x.search),
    passwordIsAtlasPlaceholder: decodeURIComponent(x.password) === "<db_password>", query: x.search ? "present" : "none" });
} catch { console.log("DATABASE_URL: not a valid URL"); }'
```
**Why:** finds **where** the leftover `<`/`>` is, still without printing it. Here, `passwordIsAtlasPlaceholder: true`: Atlas's `<db_password>` hadn't been replaced.
- **The `try/catch` matters.** On an invalid URL, Node's uncaught `ERR_INVALID_URL` error prints its `input`: the **whole URL, password included**. (The first run had no `try/catch`, and it didn't leak only because the URL was valid. The review caught this.)

```bash
grep -n '^[[:space:]]*DATABASE_URL' .env | sed -E 's/=.*/=<hidden>/'
```
**Why:** after an edit that seemed to do nothing, this shows how many `DATABASE_URL` lines there are and on which line, with the value hidden. There was one line, still unchanged, so the edit hadn't been saved there.

After the fix, the first check showed `database: 'mirror-ai'` and `placeholderLeft: false`.

## 4. Connection test (ping)

```bash
node --env-file=.env -e '
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const hide = (s) => String(s).replace(/mongodb(\+srv)?:\/\/\S+/g, "<DATABASE_URL>");
(async () => {
  try {
    console.log("ping:", JSON.stringify(await prisma.$runCommandRaw({ ping: 1 })));
    const r = await prisma.$runCommandRaw({ listCollections: 1, nameOnly: true });
    console.log("collections:", JSON.stringify(r.cursor.firstBatch.map((c) => c.name)));
  } catch (e) {
    console.log("error:", e.constructor.name, e.errorCode || e.code || "", hide(e.message).slice(0, 600));
  } finally {
    await prisma.$disconnect();
  }
})();'
```
**Why:** a real round trip through Prisma. `hide()` masks any connection string that appears in an error message.
- Got `ping: {"ok":1}` and `collections: []`: the database is connected and empty.
- (macOS has no `timeout` command, so we don't wrap the script in one.)

## 5. The script

```bash
npx prisma db --help
```
**Why:** lists `db push`, "Push the state from Prisma schema to the database during prototyping". With MongoDB there are no migrations: `db push` creates the collections and indexes, then regenerates the Prisma Client.

- `package.json`: `"db:push": "prisma db push"`, with **no** `--force-reset` (that wipes the database) and **no** `--accept-data-loss` (that applies schema changes that delete data instead of stopping to warn you).

## 6. Test: `package.test.ts`

Node env; it reads `package.json` as data, so no database is touched. It checks:
- `db:push` is exactly `prisma db push`;
- it never contains `--force-reset` or `--accept-data-loss`.

```bash
npx vitest run package.test.ts
```
**Why:** `3 passed`.

- **Planted bug:** in the editor, we changed the script to `prisma validate`, then ran the command above again. It must fail: `× creates the MongoDB collections and indexes…`. Then we changed it back, and it passed.
- **Not run:** planting `--force-reset` as the bug. Claude Code's safety classifier refused to run anything while `package.json` held a database-wipe flag, even though the test only reads the file. The exact-match test would catch that flag anyway.

## 7. The developer runs the script

```bash
npm run db:push
```
**Why:** creates `Product`, `TryOn` and `WishlistItem`, plus their indexes, in the Atlas `mirror-ai` database.
- **The developer runs this one:** the guardrail hook (task 07) blocks every whole-word `push` except `git push -u origin NN_task_branch`.
  - `db:push` counts as the word `push`, because `:` is a word boundary, so it's blocked.
  - `db_push` in the branch name isn't, because `_` is part of a word.

## 8. Check the result (read-only)

```bash
node --env-file=.env -e '
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const hide = (s) => String(s).replace(/mongodb(\+srv)?:\/\/\S+/g, "<DATABASE_URL>");
(async () => {
  try {
    const cols = (await prisma.$runCommandRaw({ listCollections: 1, nameOnly: true })).cursor.firstBatch.map((c) => c.name).sort();
    console.log("collections:", cols.join(", ") || "(none)");
    for (const c of cols) {
      const r = await prisma.$runCommandRaw({ listIndexes: c });
      console.log(`  ${c}:`, r.cursor.firstBatch.map((i) => `${i.name} ${JSON.stringify(i.key)}`).join(" | "));
    }
  } catch (e) {
    console.log("error:", hide(e.message).slice(0, 500));
  } finally {
    await prisma.$disconnect();
  }
})();'
```
**Why:** lists each collection and its indexes. It matches the schema exactly:

| Collection | Indexes (besides `_id_`) | Used by |
|---|---|---|
| `Product` | `isActive` | the landing page (active products) |
| `TryOn` | `userId + createdAt`, `createdAt` | `/history`, the 24 h cleanup cron |
| `WishlistItem` | `userId`, `anonymousId` | the wishlist, signed in or not |

## 9. The rest of the checklist

```bash
npm test
```
**Why:** `Tests 206 passed` (3 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `14 passed`. Locally the home page now reads the real, empty database. Its E2E test accepts the friendly alert, the empty state or a product list, so it passes with or without `DATABASE_URL`. CI still has no database.

```bash
npm run build
```
**Why:** confirms the production build on its own too.

## 10. Commit, publish, PR, auto-merge

```bash
git add package.json package.test.ts README.md docs/learning/30_add_db_push_script.md docs/task-list.md
```
**Why:** stages this task's files. **Never `.env`.**

```bash
git commit -m "30_add_db_push_script Add schema sync script and create Atlas collections"
```
**Why:** saves the snapshot. The message says "schema sync" rather than the script's name, because the hook would block a command containing `db:push`.

```bash
git push -u origin 30_add_db_push_script
```
**Why:** publishes the branch (the hook allows this exact form).

```bash
gh pr create --base main --head 30_add_db_push_script --title "30_add_db_push_script Add schema sync script and create Atlas collections" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Atlas's `<db_password>` is a placeholder to replace, `<` and `>` included.**
- **Prisma needs the database name** (`/mirror-ai`) in a MongoDB URL.
- **A password with `@ : / ? #` must be URL-encoded** in the URL. An autogenerated letters-and-numbers password avoids that.
- **Check secrets by their shape, never by printing them:** use yes/no checks and `sed 's/=.*/=<hidden>/'`.
- **An uncaught `new URL()` error prints its input.** Always wrap secret parsing in `try/catch`, and never print the caught error.
- **Run `db:push` again after every schema change** (for example task 56's share token). It's safe on a live database as long as it has neither `--force-reset` nor `--accept-data-loss`.
