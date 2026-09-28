# 54 Add a page-protection check

**Branch:** `54_reviewer_page_auth_check` (starts from `main`)
**Goal:** make sure no page is public by accident. Pages are protected one by one since task 24 (not in `proxy.ts`), so a single missing `requireUser()` would leave a page open. This task adds:
- **check 14** to the rules-reviewer (the approved task);
- **an automated guard test**, so CI enforces the same rule on every PR, even when nobody runs the reviewer.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #47 (task 51, the cleanup cron).

```bash
git checkout -b 54_reviewer_page_auth_check
```
**Why:** new task, new branch.

```bash
cat .claude/agents/rules-reviewer.md && find app -name "page.tsx" | sort
```
**Why:** reads the reviewer's 13 checks, and lists every page. There are 8:
- **protected:** `/history`, `/admin/products`, `/admin/products/new` and `/admin/products/[id]/edit`;
- **public:** `/`, `/wishlist`, `/sign-in` and `/sign-up`.

## 2. Check 14 in `.claude/agents/rules-reviewer.md`

- List every page (`find app -name page.tsx`).
- A page is **public only if** the "Pages and flow" table in `docs/project-plan.md` says so **and** it's in `PUBLIC_PAGES` in the guard test.
- Every other page's **first `await`** must be `requireUser()` or `requireAdmin()`, before any data is read. The reviewer quotes the line.
- Every protected page needs an E2E test that a signed-out visitor goes to `/sign-in`. Admin pages also need the non-admin 404 test, once signed-in E2E exists (`@clerk/testing` is still an open question).
- The guard test enforces the first rule. The reviewer still reads each new page itself, because a test only sees source text.

## 3. `app/page-auth.test.ts`: the guard

- It walks `app/` with Node's built-in `readdirSync(dir, { recursive: true })`, so no package is needed, and finds every page file (`page.tsx`, `.ts`, `.jsx` or `.js`, all of which Next routes).
- **`PUBLIC_PAGES`** lists the public pages, each with its reason (landing, wishlist, Clerk's two pages).
- Every other page must pass **`authComesFirst`**: the **first `await` from `export default` onward** is `await requireUser()` or `await requireAdmin()`.
  - That's stricter than "calls it somewhere", because reading data *before* the check would still leak it.
  - Starting at `export default` means an auth call in a helper *above* the page doesn't count for the page (found in review).
- It also checks the public list doesn't go stale: every listed page must exist.
- **The effect:** a new page fails CI until someone decides it's public (added to the list, and to the plan's table) or protects it.

## 4. Tests

- The guard runs per protected page (4 tests), plus "finds the pages" and "no stale public entries".
- **`authComesFirst`** itself:
  - it accepts `requireUser` or `requireAdmin` first;
  - it rejects no auth, **a data read before auth**, no `await` at all, a similar-looking name (`requireUserMaybe`), and **auth only in a helper above the page**.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run app/page-auth.test.ts
```
**Why:** runs the guard: `13 passed`.

**The task's own test (a planted unprotected page):**

```bash
mkdir -p app/planted-secret
```
**Why:** a folder for a temporary page at `/planted-secret`.

```bash
cat > app/planted-secret/page.tsx <<'EOF'
import { listRecentTryOns } from "@/lib/tryons";

// PLANTED for task 54's test: reads user data with no requireUser(). Deleted right after the check.
export default async function PlantedSecretPage() {
  const tryOns = await listRecentTryOns("user_123");
  return <main>{tryOns.length}</main>;
}
EOF
```
**Why:** creates the planted page. It reads a user's try-ons without any auth check.

```bash
npx vitest run app/page-auth.test.ts
```
**Why:** the guard must flag it. Got `1 failed`: "app/planted-secret/page.tsx must start with requireUser() or requireAdmin(), or be listed as public".

- Then the **rules-reviewer**, asked to run check 14 only, reported `CHECK 14: FAIL (2)` for the planted page:
  - it quoted line 5, `await listRecentTryOns("user_123")`, which comes before any auth;
  - it found no E2E redirect test.
- It passed the 8 real pages, each with its quoted line and E2E evidence.

```bash
rm app/planted-secret/page.tsx && rmdir app/planted-secret
```
**Why:** removes the planted page. The guard passes again.
- After the review, the guard got stricter (starting at `export default`, all four extensions), and gained one test: `13 passed`.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 371 passed` (13 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `17 passed`.

```bash
npm run build
```
**Why:** confirms the production build on its own too.

## 5. Commit, publish, PR, auto-merge

```bash
git add .claude/agents/rules-reviewer.md app/page-auth.test.ts docs/learning/54_reviewer_page_auth_check.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "54_reviewer_page_auth_check Add page protection check to reviewer and CI"
```
**Why:** saves the snapshot.

```bash
git push -u origin 54_reviewer_page_auth_check
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 54_reviewer_page_auth_check --title "54_reviewer_page_auth_check Add page protection check to reviewer and CI" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Task 44 (`/tryon/[id]`, public by link) must add its page to `PUBLIC_PAGES`**, with its reason, when it's built.
- **When you add a page, decide right away: public or protected.** CI fails until you do. Public pages also go in the plan's "Pages and flow" table.
- **"First `await`" matters, not just "somewhere".** A page that loads data and *then* checks auth has already read it.
- **The guard reads source text.** A comment containing `await ` before the real code would confuse it. That's why the reviewer still reads each page.
- **Route handlers and Server Actions aren't pages.** They check auth themselves (for example, the status API's 401 and each action's own check), and the reviewer's other checks cover them.
