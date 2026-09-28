# 47 Add the wishlist cookie

**Branch:** `47_add_wishlist_cookie` (starts from `main`)
**Goal:** an anonymous visitor id stored in a cookie, so signed-out visitors can keep a wishlist (decided: "works without login"). The add/remove actions (task 48) use it, and on sign-in the items move to the account (task 50).

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #42 (task 46, the history page).

```bash
git checkout -b 47_add_wishlist_cookie
```
**Why:** new task, new branch.

## 2. Read the Next 16 `cookies()` rules

```bash
F=node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md && grep -n -i "set(\|Server Action\|Route Handler\|httpOnly\|sameSite\|secure\|maxAge\|async\|await cookies\|Good to know" $F
```
**Why:**
- `cookies()` is **async**: `(await cookies()).get(name)`.
- **Reading** works in Server Components.
- **Setting** works **only in Server Functions (Actions) and Route Handlers**, not while a page renders: "HTTP does not allow setting cookies after streaming starts".
- The options include `httpOnly`, `sameSite`, `secure`, `path` and `maxAge`.

## 3. `lib/anonymous-id.ts`

- **`getAnonymousId()`** reads the `mirror_anon_id` cookie. It works anywhere, including pages such as `/wishlist` (task 49).
  - It returns the value **only if it's a lowercase UUID v4**, exactly what `randomUUID()` makes. Anything else is ignored, because the cookie comes from the browser and could be edited: `"admin"`, `"user_2abc"`, or an uppercase copy, which would point to a different, empty list.
- **`getOrCreateAnonymousId()`** reuses a valid id. Otherwise it makes one with `crypto.randomUUID()` and sets the cookie. Call it **only from a Server Action**, such as "add to wishlist" in task 48.

| Cookie option | Value | Why |
|---|---|---|
| `httpOnly` | `true` | page scripts (and any injected script) can't read or steal it |
| `sameSite` | `"lax"` | not sent on cross-site POSTs |
| `secure` | `true` in production | HTTPS only when deployed. Off for `localhost` (plain HTTP) |
| `path` | `"/"` | the whole site |
| `maxAge` | 1 year | a signed-out wishlist survives browser restarts. Easy to change |

- **The id works like a password** for that anonymous wishlist. `randomUUID()` has 122 random bits, so it can't be guessed. Never use something predictable like a timestamp.

## 4. Tests: `lib/anonymous-id.test.ts`

Node env. `next/headers`' `cookies()` is mocked with a fake store (`get`/`set`), so there's no real request.
- **Reading:** a valid cookie is returned; no cookie gives `null`; an empty value, a made-up value, another id format, a non-v4 UUID, a UUID with extra text, or an uppercase copy are all **ignored**.
- **Creating:**
  - a valid id is reused with no cookie set;
  - a new id is a UUID v4, set with the exact options;
  - a tampered cookie is replaced;
  - `secure: true` in production (`vi.stubEnv("NODE_ENV", "production")`);
  - two new visitors get different ids.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run lib/anonymous-id.test.ts
```
**Why:** runs this task's tests: `13 passed`.

```bash
cp lib/anonymous-id.ts /tmp/anon.bak
```
**Why:** saves the good file before planting bugs. Each bug below is undone by copying the backup back.

```bash
sed -i '' 's/    httpOnly: true, /    httpOnly: false, /' lib/anonymous-id.ts
```
**Why:** plants a **theft bug**: page scripts could read the cookie.

```bash
npx vitest run lib/anonymous-id.test.ts
```
**Why:** must fail. Got `1 failed`: `× creates a random UUID v4 and stores it in a locked-down cookie…`.

```bash
cp /tmp/anon.bak lib/anonymous-id.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/  return value \&\& UUID_V4.test(value) ? value : null;/  return value || null;/' lib/anonymous-id.ts
```
**Why:** plants a **trust bug**: any cookie value is accepted.

```bash
npx vitest run lib/anonymous-id.test.ts
```
**Why:** must fail. Got `6 failed` (the "ignores…" cases except the empty one, plus "replaces a tampered cookie").

```bash
cp /tmp/anon.bak lib/anonymous-id.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/  const id = randomUUID();/  const id = `anon-${Date.now()}`;/' lib/anonymous-id.ts
```
**Why:** plants a **guessable-id bug**: a timestamp instead of a random UUID.

```bash
npx vitest run lib/anonymous-id.test.ts
```
**Why:** must fail. Got `3 failed`.

```bash
cp /tmp/anon.bak lib/anonymous-id.ts
```
**Why:** restores the file. All 13 tests pass.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 272 passed` (13 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `16 passed`. No new E2E: nothing uses the cookie yet, and the task's Tests column says Unit.

```bash
npm run build
```
**Why:** confirms the production build on its own too.

## 5. Commit, publish, PR, auto-merge

```bash
git add lib/anonymous-id.ts lib/anonymous-id.test.ts docs/learning/47_add_wishlist_cookie.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "47_add_wishlist_cookie Add anonymous visitor id cookie"
```
**Why:** saves the snapshot.

```bash
git push -u origin 47_add_wishlist_cookie
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 47_add_wishlist_cookie --title "47_add_wishlist_cookie Add anonymous visitor id cookie" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **You can't set a cookie while a page renders.** Create the id in the Server Action that needs it (task 48). Pages only read it.
- **Validate cookie values.** They come from the browser; only accept the format you created.
- **For task 48:**
  - Re-set the cookie (a fresh `maxAge`) when an active visitor saves an item, so the year counts from last use, not from creation.
  - Two first-time actions at the same moment could create two ids. That's rare; the items saved under the losing id would be lost.
  - Confirm the 1-year lifetime with the developer.
- **`secure` must be off on `localhost`** (plain HTTP), or the browser drops the cookie in local dev. That's why it's tied to `NODE_ENV === "production"`.
