# 16 Add the project plan doc

**Branch:** `16_add_project_plan_doc` (starts from `main`)
**Goal:** write down what the app does and what data it stores, so the schema (task 21) and future pages are built from one agreed source.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #20 (task 26), which auto-merged.

```bash
git checkout -b 16_add_project_plan_doc
```
**Why:** task 16 was waiting on the developer's plan. The answers have arrived.

## 2. Look for the original plan

```bash
ls -la PLAN.md; git ls-files | grep -i plan
```
**Why:** the developer said the plan is in `PLAN.md` at the repo root. It wasn't there, and it isn't tracked by git.

```bash
find .. -maxdepth 2 -iname 'plan*.md'
```
**Why:** checks the nearby folders too. Nothing was found. So the plan was written from the developer's answers, with a note to merge `PLAN.md` if it turns up.

## 3. `docs/project-plan.md`

- **Users and access:** public browsing; login (Clerk) required to try on; admin-only product management.
- **Pages:** `/`, `/tryon` (camera, pose guide, carousel, upload), preview, loading, `/tryon/[id]` (before/after, download, WhatsApp), `/history`, `/wishlist`, `/admin/products`.
- **Data model:**
  - `Product`: name, imageUrl, category, price?, description?, buyLink?, isActive, timestamps.
  - `TryOn`: userId, productId, personUrl, resultUrl?, status, errorMessage?, createdAt.
- **Access column** in the pages table: public (`/`, sign-in/up), signed-in (`/tryon`, `/tryon/[id]`, `/history`, `/wishlist`), admin (`/admin/products`). This is the spec for task 24's `proxy.ts`.
- **Assumptions to confirm:**
  - a `WishlistItem` (userId + productId, unique per pair);
  - admin = Clerk `publicMetadata.role === "admin"`;
  - `/wishlist` needs sign-in, and users can only open their own `/tryon/[id]`;
  - the 24 h cron deletes the Cloudinary images **and** the `TryOn` row, and `/history` also filters `createdAt > now − 24 h`.
- **Review note:** the first review flagged "public product browsing" and "edit/delete" as invented. Both are in the developer's own answers, so the plan now quotes them inline.
- **Category mapping** to both candidate models: `UPPER`/`LOWER`/`OVERALL` → CatVTON `upper`/`lower`/`overall`, or OOTDiffusion `Upper-body`/`Lower-body`/`Dress`.
- **Privacy:** photos and results are auto-deleted after 24 h by a cron job, so history only covers the last 24 h.
- **Job lifecycle:** `PENDING` → `PROCESSING` (Inngest) → `DONE` / `FAILED`, with polling from the loading screen.
- **Not yet in the task list:** the wishlist, admin CRUD, the try-on UI, the result page, history, the Inngest job, the cleanup cron, rate limiting, and the real landing page. These become new tasks later, with the developer's OK.

## 4. README

- Added a link to `docs/project-plan.md` in the Docs section.

## 5. Checklist

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** end-of-task checklist. There's no code change, but it always runs. `test:e2e` includes the build.

## 6. Commit, publish, PR, auto-merge

```bash
git add docs/project-plan.md README.md docs/learning/16_add_project_plan_doc.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "16_add_project_plan_doc Add project plan with pages, data model, and privacy rules"
```
**Why:** saves the snapshot.

```bash
git push -u origin 16_add_project_plan_doc
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 16_add_project_plan_doc --title "16_add_project_plan_doc Add project plan with pages, data model, and privacy rules" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Plans drift.** When a decision changes (for example, the try-on model in task 27), update `docs/project-plan.md` in that task's branch.
