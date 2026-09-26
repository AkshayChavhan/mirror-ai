# 20 Install Prisma 6

**Branch:** `20_install_prisma_6` (starts from `main`)
**Goal:** install Prisma 6 for MongoDB and create a valid schema with no models yet. Models come in task 21, from the project plan.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #18 (task 19), which auto-merged.

```bash
git checkout -b 20_install_prisma_6
```
**Why:** new task, new branch. It doesn't need real credentials: `prisma validate` never connects to a database.

## 2. Why Prisma 6 (from `docs/phase-0-findings.md`)

- Prisma 7 needs a driver adapter, and there is no MongoDB adapter, so the client won't run.
- Prisma 8 is still a release candidate, and `prisma validate` was removed.
- So we use **`prisma@6.19.3` + `@prisma/client@6.19.3`** (pre-approved in the task list).

```bash
npm view prisma@6.19.3 engines.node version --json
```
**Why:** confirms the version exists and needs Node `>=18.18` (we use 22.23.2).

## 3. Install

```bash
npm install @prisma/client@6.19.3
```
**Why:** the runtime client the app imports. It's a normal dependency, because it ships with the app.

```bash
npm install -D prisma@6.19.3
```
**Why:** the CLI (`validate`, `generate`, `format`). A dev dependency, since it's only used while developing.

| Package | Version | Type |
|---|---|---|
| `@prisma/client` | 6.19.3 | dependency |
| `prisma` | 6.19.3 | devDependency |

```bash
npx prisma --version
```
**Why:** shows `prisma 6.19.3` and `@prisma/client 6.19.3`, so the versions match.

## 4. `prisma init`, and what was kept

```bash
npx prisma init --datasource-provider mongodb
```
**Why:** scaffolds Prisma. It printed "Fetching latest updates for this subcommand", meaning it downloads its template, which is written for newer Prisma. So everything it made was checked:

| Generated | Kept? | Why |
|---|---|---|
| `prisma/schema.prisma` | **Rewritten** | It used the new `prisma-client` generator (output in `app/generated/prisma`). Switched to the classic **`prisma-client-js`** (output in `node_modules/@prisma/client`), which is standard for Prisma 6 and what Phase 0 tested |
| `prisma.config.ts` | **Removed** | It imports `dotenv`, a package that isn't approved. It's optional in Prisma 6, and without it Prisma loads `.env` by itself |
| `.env` | **Removed** | A sample URL only (git-ignored anyway). `.env.example` stays the single template, so run `cp .env.example .env` |
| `.gitignore` line `/app/generated/prisma` | **Removed** | Not needed with `prisma-client-js` |

The `.gitignore` line was removed with an editor. `git restore .gitignore` was blocked by the guardrail hook, whose `git restore .` pattern also matches files starting with a dot.

```bash
rm prisma.config.ts .env
```
**Why:** deletes the two generated files we don't use.

Final `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}
```

## 5. Tests

```bash
npx prisma validate
```
**Why:** checks whether `validate` runs without `DATABASE_URL`. It doesn't: it stops at `getConfig`, because the variable must exist, even though validate never connects.

```bash
DATABASE_URL="mongodb+srv://user:pass@cluster.example.net/mirror" npx prisma validate
```
**Why:** with a placeholder URL set just for this command: `The schema at prisma/schema.prisma is valid`.

```bash
npx prisma format --check
```
**Why:** `All files are formatted correctly!`

```bash
npx prisma generate
```
**Why:** builds the client into `node_modules/@prisma/client`. It works even with no models. `@prisma/client` also runs this on install (its `postinstall`), including in CI's `npm ci`.

`prisma/schema.test.ts` (Vitest, so CI checks the schema on every PR):
- the provider is `mongodb`, and the URL comes from `env("DATABASE_URL")`;
- the generator is `prisma-client-js`;
- `prisma validate` passes, run with a placeholder `DATABASE_URL` (30 s timeout).

```bash
cp prisma/schema.prisma /tmp/schema.bak
```
**Why:** saves the good schema before planting a broken one.

```bash
printf '\nmodel Broken {\n  id String @id\n  owner Missing\n}\n' >> prisma/schema.prisma
```
**Why:** plants a model that uses an unknown type.

```bash
npm test
```
**Why:** must fail. Got `Type "Missing" is neither a built-in type, nor refers to another model...`, and `× passes prisma validate`.

```bash
cp /tmp/schema.bak prisma/schema.prisma
```
**Why:** restores the good schema. `npm test` shows 9 passing tests again.

```bash
git show HEAD:package-lock.json > /tmp/lock-old.json
```
**Why:** saves the old lock file for comparison.

```bash
python3 -c "import json; o=json.load(open('/tmp/lock-old.json'))['packages']; n=json.load(open('package-lock.json'))['packages']; print('removed', [k for k in o if k not in n]); print('added', len([k for k in n if k not in o]))"
```
**Why:** 0 removed, 34 added (Prisma and its dependencies, with `dotenv` as an *indirect* dependency, not ours), 0 changed.

```bash
npm ci --dry-run && npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** end-of-task checklist. `test:e2e` includes the build.

## 6. README

- The stack table now lists Prisma 6 as **in use**. Models and a live MongoDB connection are still planned.

## 7. Commit, publish, PR, auto-merge

```bash
git add package.json package-lock.json prisma/schema.prisma prisma/schema.test.ts README.md docs/learning/20_install_prisma_6.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "20_install_prisma_6 Install Prisma 6 with a MongoDB schema"
```
**Why:** saves the snapshot.

```bash
git push -u origin 20_install_prisma_6
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 20_install_prisma_6 --title "20_install_prisma_6 Install Prisma 6 with a MongoDB schema" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **`prisma init` fetches a newer template.** Check what it generates. It assumed Prisma 7-style files (`prisma.config.ts`, `dotenv`, the new generator).
- **With `prisma.config.ts` present, Prisma 6 stops auto-loading `.env`.** That's one more reason not to keep it.
- **Real connection later:** put the Atlas URL in your own `.env` (`cp .env.example .env`). Tasks 21–22 need it for anything beyond validating.
