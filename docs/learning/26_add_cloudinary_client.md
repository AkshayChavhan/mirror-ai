# 26 Add the Cloudinary client

**Branch:** `26_add_cloudinary_client` (starts from `main`)
**Goal:** one server-side helper, `uploadImage()`, that uploads person and garment photos to Cloudinary, with friendly errors and fully mocked tests.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #19 (task 20), which auto-merged.

```bash
git checkout -b 26_add_cloudinary_client
```
**Why:** new task, new branch. Tasks 21–25 are skipped for now because they need the developer (the plan, the MongoDB URL, Clerk keys). This one doesn't: the tests mock the SDK.

## 2. Install

```bash
npm view cloudinary@2.11.0 version engines.node types dependencies --json
```
**Why:** checks the version (pre-approved in the task list). It needs Node ≥9, ships its own types (`types`), and has a single dependency, `lodash`.

```bash
npm install cloudinary@2.11.0
```
**Why:** a normal dependency, because the server uses it at runtime.

| Package | Version | Type |
|---|---|---|
| `cloudinary` | 2.11.0 | dependency |

```bash
grep -n -A12 'export interface UploadApiResponse' node_modules/cloudinary/types/index.d.ts
```
**Why:** reads the SDK's own types to see what `uploader.upload()` returns (`secure_url`, `public_id`, `width`, `height`, …), instead of guessing.

## 3. `lib/cloudinary.ts`

- `uploadImage(file, folder)`: `file` is a data URI, a URL, or a path. It returns `{ url, publicId, width, height }`.
- `ImageUploadError`: its `message` is always **safe to show users**. The original error is kept in `cause`, for the server logs.
- Errors (per the code rules):

| Case | User sees | Server logs |
|---|---|---|
| Empty or whitespace-only `file` | "Please choose an image to upload." | nothing (a user mistake) |
| Missing `CLOUDINARY_*` env var | "Image upload isn't available right now. Please try again later." | which variables are missing |
| Cloudinary rejects the upload | "We couldn't upload your image. Please try again." | the full provider error |

- `secure: true`, so the returned URLs are always `https`.
- **Server-only.** It reads secret env vars, so it must never be imported from a `"use client"` file.

## 4. Tests: `lib/cloudinary.test.ts`

- `vi.mock("cloudinary", …)` replaces the SDK with fakes (`vi.hoisted` creates them before the mock runs), so **no real network calls or keys**.
- `vi.stubEnv` sets placeholder env vars per test, and `vi.unstubAllEnvs()` resets them.
- `console.error` is silenced and checked, so the logging is tested too.
- Cases:
  - success, with the right folder and options passed;
  - an empty or whitespace-only file (Cloudinary is never called);
  - a missing env var (friendly error, and the missing name is logged);
  - a provider error (friendly message, no provider text, `cause` kept, logged).

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** `Test Files 4 passed`, `Tests 14 passed` (5 new, including a whitespace-only file).

```bash
cp lib/cloudinary.ts /tmp/cloudinary.ts.bak
```
**Why:** saves the good file before planting a bug.

```bash
sed -i '' 's/throw new ImageUploadError("We couldn'"'"'t upload your image. Please try again.", { cause: error });/throw new ImageUploadError(`Upload failed: ${(error as { message?: string }).message}`, { cause: error });/' lib/cloudinary.ts
```
**Why:** plants a bug that **leaks the provider's error text** to users. (`'"'"'` is how a single quote is written inside a single-quoted shell string.)

```bash
npm test
```
**Why:** must fail. Got `expected 'Upload failed: Invalid Signature 3f9a…' to be 'We couldn't upload your image. Pleas…'`.

```bash
cp /tmp/cloudinary.ts.bak lib/cloudinary.ts
```
**Why:** restores the good file. 14 tests pass again.

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build.

## 5. README

- The stack table now lists the Cloudinary upload helper as **in use**. Wiring it into forms is still planned.

## 6. Commit, publish, PR, auto-merge

```bash
git add package.json package-lock.json lib/cloudinary.ts lib/cloudinary.test.ts README.md docs/learning/26_add_cloudinary_client.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "26_add_cloudinary_client Add Cloudinary uploadImage helper with mocked tests"
```
**Why:** saves the snapshot.

```bash
git push -u origin 26_add_cloudinary_client
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 26_add_cloudinary_client --title "26_add_cloudinary_client Add Cloudinary uploadImage helper with mocked tests" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **`vi.mock` is hoisted** to the top of the file, above the imports. Variables it uses must come from `vi.hoisted(...)`, or they don't exist yet when the mock runs.
- **`npm audit` found 3 high-severity issues from task 20, not from this task.** The `prisma` CLI → `@prisma/config` → `deepmerge-ts` <8 ([GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)). It's CLI-only (a dev dependency) and doesn't ship in the app. npm's fix is a downgrade to `prisma@6.12.0`. That decision was left to the developer.
  ```bash
  npm audit
  ```
  **Why:** lists known vulnerabilities in installed packages. Worth running after every install.
- **Real uploads** need your Cloudinary keys in `.env` (`cp .env.example .env`).
