# 17 Replace the boilerplate page

**Branch:** `17_replace_boilerplate_page` (starts from `main`)
**Goal:** remove the create-next-app starter content, and show a simple, honest Mirror AI home page until the project plan (task 16) defines the real one.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #15 (task 15). It was the first PR that **auto-merged**, with no click.

```bash
git checkout -b 17_replace_boilerplate_page
```
**Why:** new task, new branch. Task 16 (project plan) was skipped for now because it waits on the developer, as the task list rule allows.

## 2. Find what the starter uses

```bash
grep -rn --exclude-dir=node_modules --exclude-dir=.next -E 'next\.svg|vercel\.svg|file\.svg|globe\.svg|window\.svg' .
```
**Why:** checks the starter SVGs in `public/` before deleting them. Only the old `app/page.tsx` used them.

## 3. Changes

- `app/page.tsx`: a plain page. `h1` "Mirror AI", one paragraph on what virtual try-on does (tops, bottoms, dresses, from the Phase 0 findings), and "Virtual try-on is coming soon." **No fake buttons or links.** The copy is temporary until task 16.
- `app/layout.tsx` metadata: `title: "Mirror AI"`, and `description` "Virtual try-on: see how clothes look on you before you buy."
- Followed the `frontend-design` skill: no single accent word in the heading, no all-caps labels, no decorative extras.

```bash
git rm public/next.svg public/vercel.svg public/file.svg public/globe.svg public/window.svg
```
**Why:** deletes the unused starter images and stages the deletion in one step. An empty `public/` folder is fine for Next.js.

## 4. Tests (updated with the page)

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Claude Code's shell doesn't load fnm, so this puts Node 22.23.2 first before the `npm` commands below (see task 01). Your own terminal switches automatically via `.nvmrc`.

- `app/page.test.tsx` (Vitest):
  - the `h1` is "Mirror AI";
  - the try-on explanation is shown;
  - no starter links are left (`queryAllByRole("link")` has length 0).
- `e2e/home.spec.ts` (Playwright): status 200, the `h1` "Mirror AI", `<title>` "Mirror AI", and the `meta description` text.

```bash
npm test
```
**Why:** unit tests: `3 passed`.

```bash
npm run test:e2e
```
**Why:** E2E against the production build: `2 passed`.

```bash
npm run lint && npm run typecheck && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` already covers the build.

## 5. Commit, publish, PR, auto-merge

```bash
git add app/page.tsx app/page.test.tsx app/layout.tsx e2e/home.spec.ts docs/learning/17_replace_boilerplate_page.md docs/task-list.md
```
**Why:** stages this task's files (the SVG deletions are already staged by `git rm`).

```bash
git commit -m "17_replace_boilerplate_page Replace starter page with a temporary Mirror AI home"
```
**Why:** saves the snapshot.

```bash
git push -u origin 17_replace_boilerplate_page
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 17_replace_boilerplate_page --title "17_replace_boilerplate_page Replace starter page with a temporary Mirror AI home" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes (task 15).

## Gotchas

- **`body` font:** `app/globals.css` still sets `font-family: Arial, Helvetica, sans-serif` on `body`, which overrides the Geist font that `layout.tsx` loads. It's starter styling, so it's left for the real design (task 16 and later) rather than changed here.
- **Copy is a placeholder.** When the plan arrives, the page text, and both tests, change together.
