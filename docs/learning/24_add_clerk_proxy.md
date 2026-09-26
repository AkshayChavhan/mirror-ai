# 24 Add the Clerk proxy and auth checks

**Branch:** `24_add_clerk_proxy` (starts from `main`)
**Goal:** run Clerk on every request (`proxy.ts`), and give protected pages simple checks: `requireUser()` and `requireAdmin()`.

## 1. The developer's access decision

- **(b)** A try-on result `/tryon/[id]` can be opened by **anyone with the link**, so WhatsApp sharing works. Ids are random, and photos are deleted after 24 h.
- The rest follows the plan:
  - **public:** `/`, `/sign-in`, `/sign-up`, `/wishlist`, `/tryon/[id]`;
  - **signed-in:** `/tryon`, `/history`;
  - **admin:** `/admin/products`.

## 2. Create the branch

```bash
git checkout -b 24_add_clerk_proxy
```
**Why:** new task, new branch. Local `main` had already been fast-forwarded right after PR #28 (task 25) merged, so no extra fetch was needed.

## 3. Read the docs first (two surprises)

```bash
ls node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/ | grep -i -E 'proxy|middleware'
```
**Why:** finds the file-convention docs. Both `middleware.md` and `proxy.md` exist.

```bash
grep -v '^$' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md | sed -n 1,70p
```
**Why:** **Surprise 1:** in Next 16, `middleware.ts` is **deprecated and renamed `proxy.ts`**. It goes in the project root, and exports a default function plus an optional `config.matcher`. Without a matcher it also runs on static files.

```bash
sed -n 1,24p node_modules/@clerk/nextjs/dist/types/server/routeMatcher.d.ts
```
**Why:** **Surprise 2:** `createRouteMatcher` is **`@deprecated`** in Clerk Core 3. Clerk says: *"Move auth checks into each page, layout, API route, or Server Function… Middleware-based auth checks rely on path matching, which can diverge from how Next.js routes requests and leave protected resources reachable."*

```bash
sed -n 55,95p node_modules/@clerk/nextjs/dist/types/server/protect.d.ts
```
**Why:** `auth.protect()` **in a page shows a 404** to signed-out users. It only redirects when called from the proxy. We want a redirect to sign-in, so `requireUser()` uses `auth()` plus `redirectToSignIn()` instead.

```bash
grep -n 'redirectToSignIn' node_modules/@clerk/nextjs/dist/types/app-router/server/auth.d.ts
```
**Why:** `redirectToSignIn` returns `ReturnType<typeof redirect>`, which is `never`. So TypeScript knows code after it only runs for signed-in users.

Clerk's `clerkMiddleware` reference (clerk.com/docs/reference/nextjs/clerk-middleware) gives the recommended `proxy.ts` and matcher used below.

## 4. `proxy.ts`

```ts
export default clerkMiddleware();
export const config = { matcher: [ /* Clerk's recommended 3 patterns */ ] };
```
- **`clerkMiddleware()`** reads the session on each request, so `auth()` works everywhere. It doesn't block anything by path.
- **Matcher:**
  - skips `_next` and static files (css, js, images, fonts, …);
  - always runs for `/api`, `/trpc`, and Clerk's `/__clerk` endpoints.

## 5. `lib/auth.ts`

| Function | Signed out | Signed in, not admin | Admin |
|---|---|---|---|
| `requireUser()` | redirect to `/sign-in` (and back after) | returns `userId` | returns `userId` |
| `requireAdmin()` | redirect to `/sign-in` | **404** (hides the admin area) | returns `userId` |
| `isAdmin()` | `false` | `false` | `true` |

- Admin = Clerk `publicMetadata.role === "admin"` (confirmed in task 21). It's read with `currentUser()`, so **no extra Clerk dashboard setup** is needed.
- Protected pages will start with `const userId = await requireUser();` when they're built.

## 6. Tests

`lib/auth.test.ts` (Node env; Clerk and `next/navigation` mocked, and the fake redirect and 404 throw like the real ones):
- `requireUser`: signed in returns the id; signed out redirects.
- `isAdmin`: 4 metadata cases.
- `requireAdmin`:
  - admin returns the id;
  - a non-admin gets a 404;
  - signed out redirects **without** checking the role.

`e2e/proxy.spec.ts` (real build and real Clerk):
- `/`, `/sign-in`, and `/sign-up` return 200 and **stay on the same URL** (no redirect);
- `GET /` has the header **`x-clerk-auth-status: signed-out`**, which proves the proxy ran;
- `GET /favicon.ico` has **no** Clerk header, which proves the matcher skips static files.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** `Tests 61 passed` (9 new).

```bash
npm run test:e2e
```
**Why:** `9 passed` (5 new proxy tests).

```bash
mv proxy.ts /tmp/proxy.ts.planted
```
**Why:** a planted check: temporarily remove the proxy.

```bash
npx playwright test e2e/proxy.spec.ts
```
**Why:** must fail. Got `Clerk's middleware runs on page requests`, `Expected: "signed-out"`, `Received: undefined`.

```bash
mv /tmp/proxy.ts.planted proxy.ts
```
**Why:** puts it back. All 5 proxy tests pass again.

```bash
npm run lint && npm run typecheck && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `npm run build` is covered by `npm run test:e2e`, whose web server runs `npm run build && npm run start`.

## 7. Docs

- `docs/project-plan.md`: `/tryon/[id]` is **public** (decided), plus a note on **how access is enforced**.
- `README.md`: the Auth row.

## 8. Commit, publish, PR, auto-merge

```bash
git add proxy.ts lib/auth.ts lib/auth.test.ts e2e/proxy.spec.ts docs/project-plan.md README.md docs/learning/24_add_clerk_proxy.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "24_add_clerk_proxy Add Clerk proxy and requireUser/requireAdmin checks"
```
**Why:** saves the snapshot.

```bash
git push -u origin 24_add_clerk_proxy
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 24_add_clerk_proxy --title "24_add_clerk_proxy Add Clerk proxy and requireUser/requireAdmin checks" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **The old tutorials use `middleware.ts` + `createRouteMatcher`.** Both are deprecated in Next 16 and Clerk Core 3.
- **`auth.protect()` behaves differently** in the proxy (redirect) and in pages (404). Read the types.
- **Protection now lives in each page.** A new protected page that forgets `requireUser()` is public. The rules-reviewer should check for it in page tasks.
