# 45 Add a WhatsApp share button

**Branch:** `45_add_whatsapp_share` (starts from `main`)
**Goal:** a finished try-on's public page (`/tryon/[shareId]`, task 44) gets a **Share on WhatsApp** button, which opens WhatsApp with a message and the page's link filled in.
- The first feature tested end to end on the seeded test database (task 60).

## 1. Create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which now includes PR #54 (the test database). `--ff-only` refuses to make a merge commit if local `main` had diverged.

```bash
git checkout -b 45_add_whatsapp_share
```
**Why:** new task, new branch.

```bash
cat "app/tryon/[shareId]/page.tsx" e2e/seeded-data.spec.ts
```
**Why:** reads the result page and the seeded E2E specs. The finished state has the slider and a download link, and the seeded data has a finished try-on (`E2E_DATA.shareIds.done`).

```bash
grep -rn "shareId" app lib | grep -v "\.test\."
```
**Why:** checks where share links are used. Only the result page itself uses them: **no page links the owner to their result page yet**. That's raised with the developer as a follow-up (task 43's loading screen or `/history` could link to it); it's out of this task's scope.

## 2. How the link works

- WhatsApp's own share URL is **`https://wa.me/?text=<message>`**. On a phone it opens the app, and on a computer it opens WhatsApp Web; the user picks the chat. The text goes through `encodeURIComponent`, so `&`, `?` and spaces in a product name can't break the URL.
- **The link needs the site's full address** (`https://…/tryon/<token>`), not just the path, because WhatsApp is another app.
  - Where does the address come from? The server only knows the path. Reading the `Host` header would trust the request, and an env var like `APP_URL` would need setting up in every environment.
  - So a small **client component** builds the address from `window.location.origin` in the browser, with **no new env var**.
- The component lives in `app/tryon/[shareId]/WhatsAppShareLink.tsx` (`"use client"`):
  - it reads the origin with **`useSyncExternalStore(subscribe, getOrigin, getServerOrigin)`**;
  - on the server, `getServerOrigin` returns `null`, so the component renders nothing there and never touches `window` (which doesn't exist on the server);
  - in the browser, React renders it again with the real origin right after hydration. This is React's supported way to show a browser-only value without a hydration mismatch, and it avoids a `setState` inside `useEffect`;
  - the link has `target="_blank"` and `rel="noopener noreferrer"`, so the new tab can't control this page and isn't told this page's private address.
- **`page.tsx`:** the download link and the share link sit in one `flex flex-wrap gap-3` row, **only in the finished state**. The path uses `shareId`, which `getSharedTryOn` has already checked (`[A-Za-z0-9_-]{22}`).
- **Message:** `See this <product> try-on on Mirror AI: <link>`. It's neutral on purpose, because whoever opened the link (not only the owner) can share it again.
- **No preview image, on purpose:** WhatsApp shows a link preview from the page's metadata. The page has no `og:image`, so the person's photo isn't copied into the chat preview. The preview shows only the title.

## 3. Task list: the developer's decisions (2026-09-29)

This branch also records the answers given today in `docs/task-list.md`. New rows go into the list in the current task's branch, as before.
- Row 52: **3 try-ons per rolling hour**. Failed ones don't count and admins have no limit (Claude's suggestion).
- Row 57: **100 wishlist items** per owner.
- New row 61 `61_add_cloudinary_folder_sweep`: sweep Cloudinary's `people/` and `results/` folders by age (**yes**).
- New row 62 `62_renew_anonymous_cookie`: renew the 1-year anonymous cookie **on every save**.
- Blockers 52 and 57 are removed, and the "Later" sweep idea now points to task 61.

## 4. Tests

- **`WhatsAppShareLink.test.tsx`:**
  - `whatsAppShareUrl` encodes `&`, `?`, spaces and the URL;
  - the link's `text` is the message plus the full page address (jsdom's `window.location.origin` + path);
  - `target="_blank"` and `rel="noopener noreferrer"`;
  - **`renderToString` returns `""`**, which proves the server render is empty and doesn't touch `window`.
- **`page.test.tsx`:** a finished try-on shows the share link with `/tryon/<token>`. Pending, processing, failed and database-error states show none.
- **`e2e/seeded-data.spec.ts`** (CI, seeded database): the finished link's share button points to `https://wa.me/?text=` with the exact message and `http://localhost:3100/tryon/<done token>`, and opens in a new tab. The failed link has no share button.
  - Playwright's `toHaveAttribute` keeps retrying until hydration adds the link, so no manual waits are needed.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run "app/tryon/\[shareId\]"
```
**Why:** meant to run only the result page's tests, but it found **no test files**, because of the backslashes (see Gotchas).

```bash
npx vitest run shareId
```
**Why:** runs the 4 result-page test files by a name filter: `17 passed`.

```bash
npx vitest run "app/tryon/[shareId]"
```
**Why:** the same by path, without backslashes: `17 passed` (found in review).

```bash
npm test
```
**Why:** runs the whole suite: `Tests 455 passed` (5 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist, and all of it passes. **Locally:** `19 passed, 5 skipped`, because the 5 seeded specs skip without a local MongoDB (see task 60). In CI they run, including the new share test.

```bash
npm run build
```
**Why:** confirms the production build on its own too.

## 5. Commit, publish, PR, auto-merge

```bash
git add "app/tryon/[shareId]/WhatsAppShareLink.tsx" "app/tryon/[shareId]/WhatsAppShareLink.test.tsx" "app/tryon/[shareId]/page.tsx" "app/tryon/[shareId]/page.test.tsx" e2e/seeded-data.spec.ts docs/task-list.md docs/learning/45_add_whatsapp_share.md
```
**Why:** stages this task's files. The quotes stop the shell from reading `[shareId]` as a pattern.

```bash
git commit -m "45_add_whatsapp_share Add share on WhatsApp button to the result page"
```
**Why:** saves the snapshot.

```bash
git push -u origin 45_add_whatsapp_share
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 45_add_whatsapp_share --title "45_add_whatsapp_share Add share on WhatsApp button to the result page" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes, including the seeded E2E test.

## Gotchas

- **A Vitest file filter is plain text, not a pattern.** It matches any test file whose path contains that text. So don't escape brackets: inside quotes the backslashes reach Vitest (it printed `filter: app/tryon/[shareId/]`) and no path matches. `npx vitest run "app/tryon/[shareId]"` or just `shareId` works.
- **Don't read `window` while rendering a component the server also renders.** It crashes on the server, or makes the server and browser HTML differ. `useSyncExternalStore` with a server snapshot is the clean fix.
- **Brand colours:** WhatsApp green (`#25D366`) with white text is hard to read (contrast about 2:1), so the button uses the page's own outline style.
