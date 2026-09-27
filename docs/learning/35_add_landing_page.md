# 35 Add the landing page

**Branch:** `35_add_landing_page` (starts from `main`)
**Goal:** replace the temporary home (task 17) with the real landing page: what Mirror AI does, a **Try it on** button, and a public grid of active products.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #34 (task 34). The admin panel is complete.

```bash
git checkout -b 35_add_landing_page
```
**Why:** new task, new branch.

## 2. Two Next 16 things to check first

```bash
grep -v '^$' node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md | sed -n 1,40p
```
**Why:** the home page was **static** (prerendered at build time). A page that just reads the database would bake in the build-time result, which in CI (no database) is an error message, forever. **`await connection()`** tells Next to stop prerendering there and render on each request. The docs name database queries as the use case.

```bash
grep -n -A18 'remotePatterns' node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md
```
**Why:** `next/image` only loads external images from allowed hosts. `images.remotePatterns` in `next.config.ts` now allows `https://res.cloudinary.com`, where product images live. The path is limited to **your own account** (`/<cloud_name>/**`) when `CLOUDINARY_CLOUD_NAME` is a real name, and not the `<placeholder>` from `.env.example`.

## 3. Files

- **`app/page.tsx`:**
  - `await connection()`, then `listActiveProducts()` (task 31);
  - a hero: `h1` "Mirror AI", one line on what it does, and a **Try it on** link to `/tryon` (built in task 41);
  - a **Garments** section (`aria-labelledby`, so it's a named region): a grid of cards, an empty state ("New garments are coming soon."), or a friendly `role="alert"` message if products can't load. **The rest of the page still works** in that case.
- **`app/ProductCard.tsx`:**
  - a `next/image` (`fill`, `sizes` for the responsive grid, `object-contain` for garment photos);
  - the name as an `<h3>` (under the Garments `<h2>`), then the category (Top/Bottom/Dress) and the price on separate lines (no "·" join, a template tell from the `frontend-design` skill);
  - **Try it on** → `/tryon?product=<id>`, with the accessible name `Try it on: <name>`. It **starts with the visible text** (WCAG 2.5.3 "Label in Name"), so voice-control users can say "Try it on";
  - **Buy** (only if there's a `buyLink`), opening in a new tab with `rel="noopener noreferrer"`.
- **`next.config.ts`:** adds `images.remotePatterns`.
- **Design:** kept plain, following the `frontend-design` skill (no single accent word, no all-caps labels, no decoration). Grey text and black buttons have `dark:` variants for contrast in dark mode.

## 4. Tests

- **`app/page.test.tsx`:** `next/server` (`connection`) and `@/lib/products` are mocked. Cases:
  - `connection()` runs **before** products load (the order is checked with `invocationCallOrder`);
  - the hero and the Try it on link;
  - one card per active product;
  - the empty state;
  - the friendly error while the page stays up;
  - the generic error hides details.
- **`app/ProductCard.test.tsx`** (colocated, per the testing rule, and the reviewer's blocking find). 10 cases: photo alt text, the `h3` name, all 3 category labels (including OVERALL → Dress), price or none, the Try it on link (href + name starts with the visible text), Buy in a new tab with `rel`, no Buy without a link.
- **`next.config.test.ts`** (root, Node env): re-imports the config with `vi.stubEnv` + `vi.resetModules()` to test both branches of the Cloudinary path rule, and that only `https://res.cloudinary.com` is allowed.
- **`e2e/home.spec.ts`:** the new "Try it on button and garments section" test. In CI (no database), the section shows the friendly message.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** `Tests 157 passed`: 6 page cases (replacing the temporary-page tests), 10 card cases, and 5 `next.config.test.ts` cases for the Cloudinary path rule (a real name → `/<name>/**`; the placeholder, empty, or odd values → `/**`).

```bash
npm run build
```
**Why:** the route list now shows **`ƒ /`** (rendered per request) instead of `○ /` (static).

```bash
npm run test:e2e
```
**Why:** the first run had **1 failure**: `getByRole('alert')` matched **2 elements**, our message and **Next.js's route announcer**, which also has `role="alert"` (it announces page changes to screen readers). The fix was to scope the check to the Garments region. After that, `13 passed`. The `[products] listActiveProducts failed` log lines are expected locally without a database, and prove the friendly-error path.

```bash
cp app/page.tsx /tmp/home.bak
```
**Why:** saves the good page before planting a bug.

```bash
python3 -c "p='app/page.tsx'; s=open(p).read(); open(p,'w').write(s.replace('  await connection();\n','  // planted: connection removed\n'))"
```
**Why:** plants the bug: without `connection()`, the page would be prerendered with build-time data.

```bash
npm test
```
**Why:** must fail. Got `× renders per request (connection) before loading products`.

```bash
cp /tmp/home.bak app/page.tsx
```
**Why:** restores the page. All tests pass.

```bash
npm run lint && npm run typecheck && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist.

## 5. Commit, publish, PR, auto-merge

```bash
git add app/page.tsx app/page.test.tsx app/ProductCard.tsx app/ProductCard.test.tsx next.config.ts next.config.test.ts e2e/home.spec.ts README.md docs/learning/35_add_landing_page.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "35_add_landing_page Add landing page with public product grid"
```
**Why:** saves the snapshot.

```bash
git push -u origin 35_add_landing_page
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 35_add_landing_page --title "35_add_landing_page Add landing page with public product grid" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Database reads in a page need `connection()`** (or another request-time API), or they run at build time.
- **Next's route announcer has `role="alert"`.** Scope `getByRole("alert")` in E2E tests.
- **`/tryon` doesn't exist until task 41**, so the buttons lead to a 404 until then.
- **To see products:** add `DATABASE_URL` (task 30), and create products in `/admin/products`.
