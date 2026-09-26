# 19 Add `.env.example`

**Branch:** `19_add_env_example` (starts from `main`)
**Goal:** a committed template listing every environment variable the app will need, with placeholders only. It follows our security rule: every env var goes in `.env.example`, with a comment.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #17 (task 18), which auto-merged.

```bash
git checkout -b 19_add_env_example
```
**Why:** new task, new branch.

## 2. The catch: `.gitignore` hid it

```bash
grep -n 'env' .gitignore
```
**Why:** found `.env*` at line 38. That pattern also matches `.env.example`, so git would never commit it.

Fix in `.gitignore`, right after `.env*`:

```gitignore
# The template has placeholders only, so it is committed.
!.env.example
```
- `!` means "don't ignore this", and it must come **after** the pattern it overrides.

```bash
git check-ignore -v .env .env.local
```
**Why:** shows which rule matches each path. Both still match `.env*`, so real env files stay ignored.
- With `-v`, git also prints the `!.env.example` exception and exits 0. To check "is it ignored?", use `git check-ignore -q <path>` without `-v`: exit 0 means ignored, exit 1 means not ignored.

## 3. `.env.example`

| Variable | Service | Browser-safe? |
|---|---|---|
| `DATABASE_URL` | MongoDB Atlas (Prisma) | No |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk | **Yes** (the `NEXT_PUBLIC_` prefix sends it to the browser) |
| `CLERK_SECRET_KEY` | Clerk | No |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` | Cloudinary | No (server SDK) |
| `CLOUDINARY_API_SECRET` | Cloudinary | No |
| `HF_TOKEN` | Hugging Face (try-on model; ZeroGPU quota is billed to it) | No |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Inngest | No |

- Every value is a `<placeholder>`. Each variable has a comment saying where to get it.
- To use it: `cp .env.example .env`, then fill in real values in `.env` only.

## 4. Test: `env-example.test.ts`

Runs with Vitest:
- **Lists every var:** the keys equal the expected list, so a missing or extra variable fails.
- **Placeholders only:** every value must contain `<something>`, and with the placeholders removed, no run of 16+ letters or digits may remain. A real-looking token fails.
- **Git behaviour:** `.env.example` is not ignored, while `.env` and `.env.local` are ignored (via `git check-ignore -q`).

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** `Test Files 2 passed`, `Tests 6 passed` (3 page tests + 3 env tests).

```bash
cp .env.example /tmp/env.example.bak
```
**Why:** saves the good file before planting bad values.

```bash
sed -i '' 's/HF_TOKEN="<hf-token>"/HF_TOKEN="hf_FAKE-0000"/' .env.example
```
**Why:** plant A, a value with no placeholder at all.

```bash
npm test
```
**Why:** must fail. Got `AssertionError: HF_TOKEN must use a <placeholder>: expected 'hf_FAKE-0000' ...`.

```bash
cp /tmp/env.example.bak .env.example
```
**Why:** restores the good file.

```bash
sed -i '' 's/HF_TOKEN="<hf-token>"/HF_TOKEN="hf_abcdefghijklmnop1234<x>"/' .env.example
```
**Why:** plant B, a token-like value *plus* a placeholder, which would sneak past a "has a placeholder" check alone. (The rules-reviewer suggested this stricter check.)

```bash
npm test
```
**Why:** must fail. Got `AssertionError: HF_TOKEN has a token-like value outside the placeholder ...`. With the placeholders removed, no run of 16+ letters or digits may remain.

```bash
cp /tmp/env.example.bak .env.example
```
**Why:** restores the good file. `npm test` passes again (6), and no planted value is left.

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build.

## 5. Commit, publish, PR, auto-merge

```bash
git add .gitignore .env.example env-example.test.ts docs/learning/19_add_env_example.md docs/task-list.md
```
**Why:** stages this task's files. `.env.example` can be added now because of the `!` exception.

```bash
git commit -m "19_add_env_example Add .env.example template with placeholder values"
```
**Why:** saves the snapshot.

```bash
git push -u origin 19_add_env_example
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 19_add_env_example --title "19_add_env_example Add .env.example template with placeholder values" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **`.env*` also matches `.env.example`.** Add a `!` exception after it.
- **`NEXT_PUBLIC_` = public.** Anything with that prefix ends up in the browser bundle. Never put a secret behind it.
- **Adding a new env var later** means updating `.env.example` **and** `EXPECTED_KEYS` in `env-example.test.ts`, or the test fails. That's intended.
