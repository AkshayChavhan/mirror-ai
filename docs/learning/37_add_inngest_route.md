# 37 Add the Inngest route

**Branch:** `37_add_inngest_route` (starts from `main`)
**Goal:** `app/api/inngest`, the HTTP endpoint Inngest calls to discover and run our background functions. The try-on job (task 39) will be registered here.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #36 (task 36, the Inngest client).

```bash
git checkout -b 37_add_inngest_route
```
**Why:** new task, new branch.

## 2. Read the installed v4 Next.js adapter

```bash
sed -n 1,60p node_modules/inngest/next.d.ts
```
**Why:** for the App Router (Next ≥13), the example is `export const { GET, POST, PUT } = serve({ client, functions })`.
- **GET:** Inngest (or the dev server) asks what functions exist.
- **PUT:** registers them.
- **POST:** runs a function step.

## 3. `app/api/inngest/route.ts`

```bash
mkdir -p app/api/inngest
```
**Why:** `app/api/inngest/route.ts` becomes the `/api/inngest` route handler.

- `serve({ client: inngest, functions: [] })`. No functions yet; the try-on job comes in task 39.
- **Production:** Inngest verifies every request with **`INNGEST_SIGNING_KEY`** (in `.env.example` since task 19).
- `proxy.ts` (Clerk) runs on `/api` routes too, but only reads the session. It doesn't block Inngest.

## 4. How it behaves (checked by hand)

```bash
npm run build
```
**Why:** the route list shows `ƒ /api/inngest` (dynamic).

```bash
npx next start -p 3200
```
**Why:** serves the production build on a spare port (run in the background, so `curl` can call it).

```bash
curl -s -w '\nstatus=%{http_code}\n' http://localhost:3200/api/inngest
```
**Why:** in **production without a signing key**, it returns `{"code":"internal_server_error"}` with status **500**. That's the safe behaviour: it refuses rather than running jobs for unverified callers.

```bash
pkill -f 'next start -p 3200'
```
**Why:** stops the background server (it finds the process by its command line).

```bash
INNGEST_DEV=1 npx next start -p 3200
```
**Why:** `INNGEST_DEV=1` puts the SDK in **dev mode** (what you use locally with the Inngest dev server).

```bash
curl -s -w '\nstatus=%{http_code}\n' http://localhost:3200/api/inngest
```
**Why:** the same request now returns 200: `{"mode":"dev","function_count":0,"has_signing_key":false,...}`.

```bash
pkill -f 'next start -p 3200'
```
**Why:** stops that second background server too.

## 5. Running jobs locally (for later tasks)

```bash
INNGEST_DEV=1 npm run dev
```
**Why:** starts the app with Inngest in dev mode, so no keys are needed.

```bash
npx inngest-cli@1.45.1 dev -u http://localhost:3000/api/inngest
```
**Why:** starts Inngest's local dev server and dashboard (http://localhost:8288), pointed at our route. **It isn't a project dependency.** `npx` downloads and runs it on demand, pinned to `1.45.1` (latest on 2026-09-27) like our other versions. You run this yourself when you want to watch jobs run. It was **not** run in this task.

## 6. Tests: `app/api/inngest/route.test.ts`

Node env. Because Inngest reads its mode from the environment, each test uses `vi.stubEnv` + `vi.resetModules()` and re-imports the route. It checks:
- it exports `GET`, `POST`, and `PUT`;
- **dev mode:** `GET` gives 200 with `mode: "dev"`, `function_count: 0`, and no signing key;
- **production without `INNGEST_SIGNING_KEY`:** `GET` gives **500**.

`e2e/inngest-route.spec.ts` (the real production build, **through `proxy.ts`**):
- `GET /api/inngest` returns Inngest's own `{"code":"internal_server_error"}` (no signing key in CI or locally), **with** `x-clerk-auth-status`. This proves Clerk's proxy ran on the request but didn't block it.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** `Tests 164 passed` (3 new).

```bash
cp lib/inngest.ts /tmp/inngest-lib.bak
```
**Why:** saves the client before planting a bug.

```bash
sed -i '' 's/new Inngest({ id: "mirror-ai" })/new Inngest({ id: "mirror-ai", isDev: true })/' lib/inngest.ts
```
**Why:** plants a **security bug**: forcing dev mode would make production **skip signature checks**.

```bash
npx vitest run app/api/inngest/route.test.ts
```
**Why:** must fail. Got `× in production refuses to serve without INNGEST_SIGNING_KEY`.

```bash
cp /tmp/inngest-lib.bak lib/inngest.ts
```
**Why:** restores the file. All tests pass.

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `14 passed` (1 new).

## 7. Commit, publish, PR, auto-merge

```bash
git add app/api/inngest e2e/inngest-route.spec.ts docs/learning/37_add_inngest_route.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "37_add_inngest_route Add Inngest serve route"
```
**Why:** saves the snapshot.

```bash
git push -u origin 37_add_inngest_route
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 37_add_inngest_route --title "37_add_inngest_route Add Inngest serve route" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **`e2e/inngest-route.spec.ts` expects no Inngest keys in your local `.env`.** `next start` loads `.env`, so with `INNGEST_SIGNING_KEY` set it would get 401, and with `INNGEST_DEV=1` it would get 200, instead of 500. Keep those out of `.env` (pass `INNGEST_DEV=1` on the command line instead).
- **Never set `isDev: true` in code.** Use `INNGEST_DEV=1` only in your local environment.
- **Deploying later** needs `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` from the Inngest dashboard, in the hosting provider's env vars.
