# 04 Adding rules for testing

**Branch:** `04_adding_rules_for_testing` (starts from `03_adding_rules_for_creating_branch`)
**Goal:** every feature ships with its tests in the same branch.

## 1. Create the task branch

```bash
git checkout -b 04_adding_rules_for_testing
```
**Why:** starts this task's branch on top of 03.

## 2. Read the Next.js testing guide

```bash
ls node_modules/next/dist/docs/01-app/02-guides/testing/
```
**Why:** Next 16 ships its own docs, and they have guides for Vitest, Jest, Playwright, and Cypress. The rule is based on them.

## 3. Add the rule to `CLAUDE.md`

Added the section `# Testing rule (always follow, never skip)`:
- Tests are written together with the feature. A feature isn't done until its tests pass.
- Tests sit next to the code (`lib/x.ts` → `lib/x.test.ts`). E2E tests go in `e2e/`.
- Vitest for units and synchronous components. Playwright for `async` Server Components and user flows, because Vitest can't render async Server Components.
- Mock external services (Gradio, Cloudinary, Clerk, MongoDB, Inngest). No real keys in tests.
- Run the tests before asking to commit, and report the result honestly.

## 4. Commit

```bash
git add CLAUDE.md docs/learning/04_adding_rules_for_testing.md
```
**Why:** stages only this task's files.

```bash
git commit -m "04_adding_rules_for_testing Add testing rule to CLAUDE.md"
```
**Why:** saves the snapshot.
