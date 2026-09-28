# 40 Add the try-on status endpoint

**Branch:** `40_add_tryon_status_endpoint` (starts from `main`)
**Goal:** `GET /api/tryon/[id]/status`, which the loading screen (task 43) polls until the try-on is `DONE` or `FAILED` (lifecycle step 5). It's private: only the signed-in owner can read it.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #40 (task 39, the job).

```bash
git checkout -b 40_add_tryon_status_endpoint
```
**Why:** new task, new branch.

## 2. Read the Next 16 route-handler rules

```bash
grep -n -i "RouteContext\|params\|Promise" node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
```
**Why:**
- In a route handler, **`params` is a Promise**: `const { id } = await ctx.params`.
- **`RouteContext<'/api/tryon/[id]/status'>`** types it from the route path. It's a global helper made by `next typegen`, so it needs no import.

```bash
grep -n -i "cach\|dynamic\|GET" node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
```
**Why:** `GET` handlers run on every request here, since they read the session. We still send **`Cache-Control: no-store`** so browsers and CDNs never serve an old status to a polling screen.

```bash
grep -n "auth()" -A3 node_modules/@clerk/nextjs/dist/types/app-router/server/auth.d.ts
```
**Why:** Clerk's `auth()` returns `{ userId }`. For an API we return a **JSON 401** instead of `requireUser()`'s redirect, which would give `fetch()` an HTML sign-in page.

## 3. `lib/tryons.ts`: `getTryOnStatus(id, userId)`

- `findFirst({ where: { id, userId, createdAt: { gt: now − 24 h } }, select: { status, resultUrl, errorMessage } })`.
- **`userId` in the query is the ownership check.** Someone else's try-on simply isn't found.
- **The 24 h filter** keeps the privacy promise even if the cleanup cron (task 51) runs late. The shared constant is `TRYON_TTL_MS`.
- It returns **only** the three fields the screen shows (the Next guide says to return only what the UI needs).
- A malformed id or an empty user id returns `null` without a database call. DB errors become `TryOnRecordError` `DB_ERROR`.

## 4. `app/api/tryon/[id]/status/route.ts`

```bash
mkdir -p "app/api/tryon/[id]/status"
```
**Why:** the folders become the URL. `[id]` is the dynamic part. The quotes stop the shell from reading `[id]` as a filename pattern.

| Case | Status | Body |
|---|---|---|
| signed out | **401** | `{ "error": "Please sign in." }` (checked before any lookup) |
| missing, **someone else's**, or older than 24 h | **404** | `{ "error": "That try-on doesn't exist." }`, the same for all three, so ids can't be probed |
| the owner's | **200** | `{ status, resultUrl, errorMessage }` |
| DB error, or anything else (even Clerk failing) | **500** | "We couldn't check your try-on. Please try again." (DB errors are logged by `lib/tryons`, others by the route) |

- Every response has `Cache-Control: no-store`, and **every** response is JSON. `auth()` sits inside the `try`, so even a Clerk failure doesn't produce Next's HTML error page.
- The user id comes from the **session**. The URL only says *which* try-on.

## 5. Tests

- **`lib/tryons.test.ts`** (Prisma mocked):
  - with a **fixed clock** (`vi.setSystemTime`), the query has `userId` and a cutoff exactly 24 h back, and selects only 3 fields;
  - not found gives `null`;
  - a malformed id or empty user id makes no DB call;
  - a DB error becomes `DB_ERROR`.
- **`app/api/tryon/[id]/status/route.test.ts`** (Clerk and lib mocked): 200 with `no-store`, using the session's user and the URL's id; 401 without a lookup; the same 404; a DB error gets a friendly 500 (not logged twice); an unexpected error gets a friendly 500, logged; **a Clerk failure still gets a JSON 500**.
- **`e2e/tryon-status.spec.ts`**, on the real build through `proxy.ts`: signed out gets a **JSON 401** with `no-store`. No database is needed, so it works in CI.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run "app/api/tryon" lib/tryons.test.ts
```
**Why:** this task's tests: `30 passed` (24 row tests, 5 new; plus 6 route tests).

```bash
cp lib/tryons.ts /tmp/tryons.bak && cp "app/api/tryon/[id]/status/route.ts" /tmp/route.bak
```
**Why:** saves the good files before planting bugs. Each bug below is undone by copying its backup back.

```bash
sed -i '' 's/      where: { id, userId, createdAt:/      where: { id, createdAt:/' lib/tryons.ts
```
**Why:** plants a **privacy bug**: anyone could read anyone's try-on.

```bash
npx vitest run lib/tryons.test.ts
```
**Why:** must fail. Got `1 failed`: `× finds the OWNER's try-on…`.

```bash
cp /tmp/tryons.bak lib/tryons.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/  if (!userId) return json({ error: "Please sign in." }, 401);/  \/\/ sign-in check removed/' "app/api/tryon/[id]/status/route.ts"
```
**Why:** plants an **auth bug**: no sign-in check.

```bash
npx vitest run app/api/tryon
```
**Why:** must fail. Got `1 failed`: `× returns 401 when signed out…`.

```bash
cp /tmp/route.bak "app/api/tryon/[id]/status/route.ts"
```
**Why:** restores the file.

```bash
sed -i '' 's/const NO_STORE = { "Cache-Control": "no-store" };/const NO_STORE = {};/' "app/api/tryon/[id]/status/route.ts"
```
**Why:** plants a **caching bug**: a cached status could leave the loading screen stuck.

```bash
npx vitest run app/api/tryon
```
**Why:** must fail. Got `2 failed` (the 200 and 404 cases).

```bash
cp /tmp/route.bak "app/api/tryon/[id]/status/route.ts"
```
**Why:** restores the file. All 30 tests pass.

```bash
npm test
```
**Why:** `Tests 238 passed` (11 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `15 passed` (1 new).

```bash
npm run build
```
**Why:** confirms the production build on its own too. It lists `ƒ /api/tryon/[id]/status`.

## 6. Commit, publish, PR, auto-merge

```bash
git add lib/tryons.ts lib/tryons.test.ts "app/api/tryon" e2e/tryon-status.spec.ts docs/learning/40_add_tryon_status_endpoint.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "40_add_tryon_status_endpoint Add try-on status endpoint"
```
**Why:** saves the snapshot.

```bash
git push -u origin 40_add_tryon_status_endpoint
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 40_add_tryon_status_endpoint --title "40_add_tryon_status_endpoint Add try-on status endpoint" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **APIs answer with JSON codes, pages redirect.** `requireUser()` redirects, which suits pages. For `fetch()` callers, return a 401.
- **Ownership goes in the query** (`where: { id, userId }`), not in an `if` after loading the row, so nothing that isn't yours is ever loaded.
- **Same 404 for "missing" and "not yours"**, so the endpoint doesn't reveal which ids exist. ObjectIds can be guessed (task 56), so this matters.
- **Quote paths with `[id]`** in the shell (`"app/api/tryon/[id]/…"`). zsh treats `[…]` as a filename pattern.
