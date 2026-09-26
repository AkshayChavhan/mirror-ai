# 25 Add Clerk sign-in and sign-up pages

**Branch:** `25_add_clerk_sign_in_pages` (starts from `main`)
**Goal:** our own `/sign-in` and `/sign-up` pages, using Clerk's ready-made forms, with Clerk pointed at them.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #27 (task 23, the Clerk provider).

```bash
git checkout -b 25_add_clerk_sign_in_pages
```
**Why:** task 24 (`proxy.ts`) waits on the developer's open access rule. This task doesn't depend on it.

## 2. Check what Clerk v7 exports

```bash
grep -n 'SignIn\b\|SignUp\b' node_modules/@clerk/nextjs/dist/types/index.d.ts
```
**Why:** confirms `SignIn` and `SignUp` still exist in Core 3. Only the control components like `<SignedIn>` were removed.

Clerk's guide (clerk.com/docs/nextjs/guides/development/custom-sign-in-or-up-page):
- the page is `app/sign-in/[[...sign-in]]/page.tsx` rendering `<SignIn />`;
- it sets `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and the fallback redirect URLs as env vars.

```bash
grep -rhn -E '^\s*(signInUrl|signUpUrl|signInFallbackRedirectUrl|signUpFallbackRedirectUrl)\??:' node_modules/@clerk/shared/dist/types/*.d.ts
```
**Why:** checks whether the same settings can be **props** on `ClerkProvider` instead of env vars. They can. These URLs aren't secrets, so props keep them in code, with no new env vars and no changes to `.env.example` or CI.

## 3. Pages

```bash
mkdir -p "app/sign-in/[[...sign-in]]" "app/sign-up/[[...sign-up]]"
```
**Why:** `[[...name]]` is an **optional catch-all** route. It matches `/sign-in` and every sub-path Clerk uses for multi-step flows (`/sign-in/factor-one`, `/sign-up/verify-email-address`). The quotes stop the shell from treating the brackets as a pattern.

- `app/sign-in/[[...sign-in]]/page.tsx`: `<main>` centred, with `<SignIn />` inside.
- `app/sign-up/[[...sign-up]]/page.tsx`: the same, with `<SignUp />`.

## 4. `app/layout.tsx`: tell Clerk where the pages are

```tsx
<ClerkProvider
  signInUrl="/sign-in"
  signUpUrl="/sign-up"
  signInFallbackRedirectUrl="/"
  signUpFallbackRedirectUrl="/"
>
```
- `signInUrl` / `signUpUrl`: where Clerk sends users who need to sign in or up, and where the "Sign up" / "Sign in" links inside the forms go.
- `…FallbackRedirectUrl`: where users land after signing in or up, when there's no page to return to. For now that's home.

## 5. Tests

Unit (Vitest, Clerk mocked):
- `app/sign-in/[[...sign-in]]/page.test.tsx`: `<SignIn />` renders inside the page's `<main>`.
- `app/sign-up/[[...sign-up]]/page.test.tsx`: the same for `<SignUp />`.
- `app/layout.test.tsx`: `ClerkProvider` gets the 4 URL props.

E2E, `e2e/auth-pages.spec.ts` (**real** Clerk with the test keys):
- `/sign-in` and `/sign-up` return 200;
- Clerk's widget (`.cl-rootBox`) and a text box appear. It's allowed 20 s, because the widget loads from Clerk's servers.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** `Tests 52 passed` (3 new).

```bash
npm run test:e2e
```
**Why:** `4 passed`: home ×2, plus the sign-in and sign-up forms rendered by Clerk.

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="" CLERK_SECRET_KEY="" npx playwright test e2e/auth-pages.spec.ts
```
**Why:** runs just the auth tests with the keys blanked (command-line vars win over `.env`). **Both fail** (`.cl-rootBox` not found), which proves the Clerk secrets added to CI in task 23 are **now required**. `npx playwright test <file>` runs a single spec file.

```bash
npm run build
```
**Why:** rebuilds with the real keys, so the local `.next` isn't left in a keyless state.

```bash
npm run lint && npm run typecheck && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist.

## 6. Commit, publish, PR, auto-merge

```bash
git add "app/sign-in" "app/sign-up" app/layout.tsx app/layout.test.tsx e2e/auth-pages.spec.ts README.md docs/learning/25_add_clerk_sign_in_pages.md docs/task-list.md
```
**Why:** stages this task's files (both page folders, with their tests).

```bash
git commit -m "25_add_clerk_sign_in_pages Add Clerk sign-in and sign-up pages"
```
**Why:** saves the snapshot.

```bash
git push -u origin 25_add_clerk_sign_in_pages
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 25_add_clerk_sign_in_pages --title "25_add_clerk_sign_in_pages Add Clerk sign-in and sign-up pages" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes. CI uses the repo secrets.

## Gotchas

- **These pages must stay public** when `proxy.ts` protects routes (task 24). Otherwise nobody could reach the sign-in page.
- **E2E depends on Clerk's servers.** If Clerk is down, the auth E2E tests fail even though our code is fine.
- **Test keys = Clerk's development instance.** Sign-ups there are test users, separate from production.
