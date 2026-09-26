# 22 Add the Prisma client (`lib/prisma.ts`)

**Branch:** `22_add_prisma_client_lib` (starts from `main`)
**Goal:** one shared database client for all server code, safe with Next.js hot reload.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #22 (task 21, the schema).

```bash
git checkout -b 22_add_prisma_client_lib
```
**Why:** new task, new branch. It doesn't need the MongoDB URL, because `new PrismaClient()` doesn't connect until the first query, and the tests mock it anyway.

## 2. Check the Next 16 docs

```bash
grep -rln -i 'prisma' node_modules/next/dist/docs/01-app
```
**Why:** looks for any Prisma guidance in the bundled docs. The only hit is `serverExternalPackages.md`.

```bash
grep -n -i -B2 -A2 'prisma' node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md
```
**Why:** `@prisma/client` and `prisma` are on Next's **built-in** list of packages kept external on the server (not bundled). So no `next.config.ts` change is needed.

## 3. `lib/prisma.ts`

```ts
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```
- **The problem:** `npm run dev` hot-reloads modules on every save. A plain `new PrismaClient()` would create a new client, with its own connection pool, each time, until MongoDB refuses connections.
- **The fix:** keep the client on `globalThis`, which survives reloads, and reuse it.
- **In production** the module runs once, so there's no need to cache it globally.
- **Server-only:** it uses `DATABASE_URL`. Import it only from server code (`import { prisma } from "@/lib/prisma"`).

## 4. Tests: `lib/prisma.test.ts`

- `vi.mock("@prisma/client")` means nothing ever connects.
- `vi.resetModules()` followed by a re-import **simulates a hot reload**.
- Cases:
  - it creates a client;
  - in **development**, the same client is reused across reloads (the constructor is called once);
  - in **production**, nothing is stored on `globalThis`.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** `Tests 22 passed` (3 new).

```bash
cp lib/prisma.ts /tmp/prisma.ts.bak
```
**Why:** saves the good file before planting a bug.

```bash
sed -i '' 's/  globalForPrisma.prisma = prisma;/  \/\/ planted: cache removed/' lib/prisma.ts
```
**Why:** plants the bug: the client is no longer cached in development. (`sed -i ''` is macOS syntax; on Linux it's `sed -i` without the `''`.)

```bash
npm test
```
**Why:** must fail. Got `× reuses the same client across reloads in development`.

```bash
cp /tmp/prisma.ts.bak lib/prisma.ts
```
**Why:** restores the good file. 22 tests pass again.

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build.

## 5. Commit, publish, PR, auto-merge

```bash
git add lib/prisma.ts lib/prisma.test.ts docs/learning/22_add_prisma_client_lib.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "22_add_prisma_client_lib Add hot-reload-safe Prisma client singleton"
```
**Why:** saves the snapshot.

```bash
git push -u origin 22_add_prisma_client_lib
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 22_add_prisma_client_lib --title "22_add_prisma_client_lib Add hot-reload-safe Prisma client singleton" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Real queries need `DATABASE_URL`** in your `.env`, plus `npx prisma db push` once, to create the collections and indexes in Atlas. That happens in the first task that reads or writes data.
- **`vi.fn(function PrismaClient() {})`:** the mock uses a normal `function`, not an arrow function, so `new` works on it.
