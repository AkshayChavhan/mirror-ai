# 10 Add a typecheck script

**Branch:** `10_add_typecheck_script` (starts from `main`)
**Goal:** one command, `npm run typecheck`, that type-checks correctly even on a fresh clone.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings local `main` up to date after PR #8 (task 09) merged.

```bash
git checkout -b 10_add_typecheck_script
```
**Why:** new task, new branch.

## 2. Check the Next 16 docs first

```bash
grep -rn -A8 'tsc --noEmit' node_modules/next/dist/docs/01-app
```
**Why:** `AGENTS.md` says to read the bundled docs, because Next 16 differs from older versions. `06-cli/next.md` explains that route types (like `LayoutProps`) are generated only by `next dev` or `next build`, so plain `tsc --noEmit` can't see them. Next 16's `next typegen` generates them without a build. The docs recommend `next typegen && tsc --noEmit`.

## 3. Add the script

In `package.json` → `scripts`:

```json
"typecheck": "next typegen && tsc --noEmit"
```
- `next typegen` writes `next-env.d.ts` and the route types into `.next/`. Both are git-ignored.
- `&&` runs `tsc` only if typegen succeeds.
- `tsc --noEmit` type-checks without writing JS files (Next compiles the code itself).

## 4. Point the rules at it

- `CLAUDE.md`, end-of-task checklist: `npx tsc --noEmit` → `npm run typecheck`.
- `.claude/agents/rules-reviewer.md`, check 12: same change.

## 5. Tests

```bash
git check-ignore .next next-env.d.ts
```
**Why:** confirms both are git-ignored, generated files, so deleting them is safe.

```bash
rm -rf .next next-env.d.ts
```
**Why:** simulates a fresh clone, where these files don't exist yet.

```bash
npx tsc --noEmit
```
**Why:** shows the problem. On a fresh clone, plain `tsc` fails: `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`, exit 2.

```bash
npm run typecheck
```
**Why:** the new script on a fresh clone prints `✓ Types generated successfully`, exits 0, and recreates `.next/` and `next-env.d.ts`.

```bash
printf 'export const n: number = "x";\n' > app/planted-type-error.ts
```
**Why:** plants a deliberate type error, to prove the script catches real errors.

```bash
npm run typecheck
```
**Why:** must fail. Got `error TS2322: Type 'string' is not assignable to type 'number'`, exit 2.

```bash
rm app/planted-type-error.ts
```
**Why:** removes the planted error. `npm run typecheck` then passes again (exit 0).

```bash
npm run lint && npm run typecheck && npm run build && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** end-of-task checklist, now using the new script.

## 6. Commit, push, PR

```bash
git add package.json CLAUDE.md .claude/agents/rules-reviewer.md docs/learning/10_add_typecheck_script.md docs/task-list.md
```
**Why:** stages only this task's files. Scripts aren't recorded in `package-lock.json`, so it doesn't change.

```bash
git commit -m "10_add_typecheck_script Add npm run typecheck (next typegen + tsc)"
```
**Why:** saves the snapshot.

```bash
git push -u origin 10_add_typecheck_script
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 10_add_typecheck_script --title "..." --body-file <file>
```
**Why:** opens the PR.

## Gotchas

- **`LayoutProps` / `PageProps` are global types that Next generates.** They don't exist until `next typegen`, `next dev`, or `next build` runs. That's why plain `tsc` fails on a fresh clone, and why CI (task 13) must use `npm run typecheck`.
- **Never edit `next-env.d.ts`.** It's regenerated. Custom types go in your own `.d.ts` file.
