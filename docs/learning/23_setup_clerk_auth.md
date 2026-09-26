# 23 Set up Clerk auth

**Branch:** `23_setup_clerk_auth` (starts from `main`)
**Goal:** put the developer's Clerk keys in place (locally and in CI), install Clerk, and wrap the app in `<ClerkProvider>`.

## 1. Clerk keys (the developer did these)

### Get the keys
- Clerk dashboard → your application → **API Keys**. Copy the **Publishable key** (`pk_test_…`) and the **Secret key** (`sk_test_…`).
- `test` keys belong to Clerk's development instance. Use `pk_live_`/`sk_live_` only for production.

### Local: `.env`

```bash
cp .env.example .env
```
**Why:** creates your private env file from the template. `.env` is git-ignored, so it's never committed.

Then, in `.env`, replace the placeholders:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_…"`
- `CLERK_SECRET_KEY="sk_test_…"`

```bash
git check-ignore -q .env && echo ".env is git-ignored"
```
**Why:** confirms git will never pick up the real keys.

### CI: GitHub Actions secrets

CI runs on GitHub's machines and can't see your `.env`, so the keys go into **encrypted repository secrets**.

```bash
gh secret set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
```
**Why:** creates (or overwrites) the secret. `gh` asks you to **paste** the value, so nothing is echoed or saved in your shell history.

```bash
gh secret set CLERK_SECRET_KEY
```
**Why:** the same for the secret key.

```bash
gh secret list
```
**Why:** shows the secret **names** and when they were last updated. GitHub never shows the values again, not even to you.

### Updating (rotating) a secret later
- Get the new key from Clerk, update it in `.env` **with your editor** (not `echo … >> .env`, which would save the key in your shell history), then run the same command again:

```bash
gh secret set CLERK_SECRET_KEY
```
**Why:** `set` on an existing name **replaces** the value. The next CI run uses the new one.

```bash
gh secret set CLERK_SECRET_KEY < /path/to/file-with-only-the-key
```
**Why:** another way that avoids pasting: `gh` reads the value from a file. Delete the file afterwards.

### Deleting a secret

```bash
gh secret delete CLERK_SECRET_KEY
```
**Why:** removes it from the repo. CI steps that use it will then get an empty value.

- **Web alternative:** repo **Settings → Secrets and variables → Actions**.
- **Never** paste a key into chat, code, docs, or commit messages (security rule).

### How Claude checked the keys without seeing them

```bash
grep -E '^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=' .env | cut -d= -f2- | cut -c1-8
```
**Why:** prints only the first 8 characters (`"pk_test`), enough to confirm the right kind of key without exposing it. The real check printed `set, prefix pk_test_… ✓` for both keys.

```bash
gh secret list
```
**Why:** listed `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, both set on 2026-09-26.

## 2. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #26 (task 29).

```bash
git checkout -b 23_setup_clerk_auth
```
**Why:** new task, new branch.

## 3. Install Clerk

```bash
npm view @clerk/nextjs@7.9.7 version peerDependencies engines.node --json
```
**Why:** `7.9.7` is pre-approved. It supports Next `^16.1.0-0` and React `~19.2.3`, and needs Node ≥20.9.

```bash
npm view @clerk/nextjs dist-tags.latest
```
**Why:** `7.9.7` is also the latest version.

```bash
npm install @clerk/nextjs@7.9.7
```
**Why:** a normal dependency.

| Package | Version | Type |
|---|---|---|
| `@clerk/nextjs` | 7.9.7 | dependency |

```bash
npm audit
```
**Why:** nothing new, only the existing Prisma CLI findings.

## 4. Read before coding: Clerk v7 = "Core 3"

```bash
cat node_modules/@clerk/nextjs/dist/types/removedControlComponents.d.ts
```
**Why:** the package documents breaking changes itself. **`<SignedIn>` and `<SignedOut>` were removed** in Core 3 (March 2026) and replaced by `<Show when="signed-in">`. Older tutorials are wrong about this.

```bash
cat node_modules/@clerk/nextjs/dist/types/app-router/server/ClerkProvider.d.ts
```
**Why:** shows `ClerkProvider` returns `Promise<JSX.Element>`. It's an **async Server Component**, and Vitest can't render those, so the unit test mocks it.

Clerk's Next.js quickstart (clerk.com/docs/nextjs/getting-started/quickstart) says:
- `<ClerkProvider>` goes **inside `<body>`**, not around `<html>`;
- on Next 16 the middleware file is **`proxy.ts`** (task 24).

## 5. `app/layout.tsx`

```tsx
<body className="min-h-full flex flex-col">
  <ClerkProvider>{children}</ClerkProvider>
</body>
```
- Every page can now use Clerk (user, session, components).

## 6. Tests

`app/layout.test.tsx` (Vitest):
- **Mocks:** `@clerk/nextjs` (the async provider), and `next/font/google`, which only works inside Next's compiler.
- **Calls `RootLayout({ children })` as a function** and inspects the element tree, because rendering `<html>` into jsdom isn't valid.
- **Checks:**
  - `<html lang="en">` with the font variables;
  - `<body>` → `ClerkProvider` → the page;
  - the metadata title.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** `Tests 49 passed` (3 new).

```bash
npm run build && npm run test:e2e
```
**Why:** the **real** `ClerkProvider`, with your test keys from `.env`. The build succeeds, and 2 E2E tests pass.

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="" CLERK_SECRET_KEY="" npm run build
```
**Why:** checks whether CI truly needs the keys yet. Variables set on the command line win over `.env`, so this blanks them for one command without touching the file. **The build still passes.**

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="" CLERK_SECRET_KEY="" npm run test:e2e
```
**Why:** the pages still load, because no page calls Clerk yet. So an earlier claim that "the build fails without a publishable key" was **wrong** and has been corrected. The keys **will** be needed once `proxy.ts` and the sign-in pages call Clerk (tasks 24–25).

```bash
npm run build
```
**Why:** rebuilds normally with the real keys afterwards.

## 7. CI: pass the secrets

In `.github/workflows/ci.yml`, at the job level:

```yaml
env:
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }}
  CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
```
- `${{ secrets.NAME }}` reads the encrypted secret. GitHub hides its value in the logs (it shows as `***`).
- It's added now, so CI matches production before task 24 needs it.

```bash
ruby -ryaml -e 'y=YAML.load_file(".github/workflows/ci.yml"); puts y["jobs"]["checks"]["env"].keys'
```
**Why:** checks the YAML still parses and the job env has both keys.

```bash
npm run lint && npm run typecheck && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist.

## 8. Commit, publish, PR, auto-merge

```bash
git add package.json package-lock.json app/layout.tsx app/layout.test.tsx .github/workflows/ci.yml README.md docs/learning/23_setup_clerk_auth.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "23_setup_clerk_auth Add Clerk provider and pass Clerk secrets to CI"
```
**Why:** saves the snapshot.

```bash
git push -u origin 23_setup_clerk_auth
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 23_setup_clerk_auth --title "23_setup_clerk_auth Add Clerk provider and pass Clerk secrets to CI" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Clerk Core 3:** use `<Show when="signed-in">`, not `<SignedIn>`. Check the installed package's types when docs disagree.
- **Secrets aren't available to PRs from forks.** That's fine for a solo repo.
- **`NEXT_PUBLIC_` values end up in the browser bundle.** That's intended for the publishable key, and it's why the *secret* key never gets that prefix.
