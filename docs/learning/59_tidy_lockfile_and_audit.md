# 59 Tidy the stray lockfile and the audit warning

**Branch:** `59_tidy_lockfile_and_audit` (starts from `main`)
**Goal:** two leftovers the developer asked Claude to settle ("do best", 2026-09-28):
- the untracked **`pnpm-lock.yaml`**;
- the **Prisma `npm audit` warning** (the "Later" item since task 20).

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #52 (task 44).

```bash
git checkout -b 59_tidy_lockfile_and_audit
```
**Why:** new task, new branch.

## 2. Look before deleting

```bash
ls -la pnpm-lock.yaml | awk '{print $5, $6, $7, $8}' && head -3 pnpm-lock.yaml && git log --all --oneline -- pnpm-lock.yaml | head -3
```
**Why:** it's a pnpm v9 lockfile (`lockfileVersion: '9.0'`), about 188 KB, created on Sep 27, and **never in git history**. This project uses npm (`package-lock.json`), so it's a stray, most likely from a one-off `pnpm install`.

```bash
rm pnpm-lock.yaml
```
**Why:** removes it. It was never committed, and pnpm could recreate it if ever needed.

- **`.gitignore`:** `/pnpm-lock.yaml` (repo root only, like `/node_modules`) is added under `# dependencies`, with a comment saying the project uses npm, so an accidental `pnpm install` can't bring it back into git.

## 3. The audit warning

```bash
npm ls deepmerge-ts
```
**Why:** shows where the flagged package comes from: `prisma@6.19.3` → `@prisma/config@6.19.3` → `deepmerge-ts@7.1.5`.

```bash
npm audit --json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); v=d.get('vulnerabilities',{}); [print(k, x['severity'], [ (y.get('title'), y.get('url'), y.get('range')) if isinstance(y,dict) else y for y in x['via']], 'fix:', x.get('fixAvailable')) for k,x in v.items()]; print(d.get('metadata',{}).get('vulnerabilities'))"
```
**Why:** turns the audit into one line per package.
- It's **one issue counted 3 times** (prisma, @prisma/config, deepmerge-ts): "DeepmergeTS has stack exhaustion when merging recursive object graphs" (GHSA-ggr8-5vv4-36mx), for versions below 8.0.0.
- npm's "fix" is **Prisma 6.12.0**, a *downgrade*, flagged as breaking.

```bash
npm view prisma versions --json 2>/dev/null | python3 -c "import json,sys; v=[x for x in json.load(sys.stdin) if x.startswith('6.') and '-' not in x]; print(v[-3:])"
```
**Why:** the newest Prisma 6 releases are 6.19.1, 6.19.2 and 6.19.3. We're already on 6.19.3.

```bash
npm view @prisma/config@6.19.3 dependencies.deepmerge-ts
```
**Why:** `7.1.5`. Even the newest Prisma 6 uses the affected version, so there's no fixed Prisma 6 to move to.

```bash
npm ls deepmerge-ts --omit=dev
```
**Why:** it still appears, but only because `prisma` is an **optional peer** of `@prisma/client`, and npm lists peers in the tree.

```bash
npm view @prisma/client@6.19.3 peerDependenciesMeta --json
```
**Why:** confirms that `prisma` is an optional peer, not something the app loads.

```bash
grep -rl deepmerge-ts .next/server | wc -l
```
**Why:** `0`. The production server build doesn't contain it at all.

**Decision: accept it, and document it.**
- It only affects the Prisma command-line tool, run on our own schema during development and CI. It never handles user input, and it doesn't ship to users.
- A downgrade to 6.12.0 would lose seven releases of fixes. A jump to Prisma 7 or 8 would break the "Prisma 6" decision from phase 0.
- The **README** now has a "Known `npm audit` finding (accepted)" section, with the advisory link and when to revisit it: once `@prisma/config` uses `deepmerge-ts` 8 or later. The review found that even Prisma 7's `@prisma/config` 7.10.0 still pins 7.1.5.
- The "Later" line was already moved into this task by task 55.

## 4. Checks

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** runs the whole suite: `Tests 435 passed`. No code changed, so there are no new tests. The task's Tests column asks for the audit result to be recorded, and for the build and tests to pass.

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `19 passed`.

```bash
npm run build
```
**Why:** confirms the production build on its own too.

```bash
npm audit
```
**Why:** still the same 3 entries (1 issue), now documented as accepted in the README.

## 5. Commit, publish, PR, auto-merge

```bash
git add .gitignore README.md docs/learning/59_tidy_lockfile_and_audit.md docs/task-list.md
```
**Why:** stages this task's files. The deleted lockfile was never tracked, so there's nothing to stage for it.

```bash
git commit -m "59_tidy_lockfile_and_audit Remove stray pnpm lockfile and document the Prisma audit finding"
```
**Why:** saves the snapshot.

```bash
git push -u origin 59_tidy_lockfile_and_audit
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 59_tidy_lockfile_and_audit --title "59_tidy_lockfile_and_audit Remove stray pnpm lockfile and document the Prisma audit finding" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **One package manager per project.** Mixing lockfiles gives different installs on different machines.
- **`npm audit fix --force` can downgrade.** Read the proposed "fix" before running it; here it was an older Prisma.
- **A package listed in `npm ls` isn't necessarily shipped.** Check whether it's a dev tool or an optional peer, and look for it in the production build.
