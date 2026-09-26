# 28 Install `@gradio/client`

**Branch:** `28_install_gradio_client` (starts from `main`)
**Goal:** add the official JavaScript client for calling Gradio apps such as the OOTDiffusion Space (task 27), and prove it works with that Space before writing `runTryOn()` (task 29).

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #24 (task 27, the model decision).

```bash
git checkout -b 28_install_gradio_client
```
**Why:** new task, new branch.

## 2. Check the version

```bash
npm view @gradio/client@2.7.0 version engines.node type dependencies --json
```
**Why:** `2.7.0` is pre-approved in the task list. It needs Node ≥18, is ESM-only (`"type": "module"`), and has a single dependency (`fetch-event-stream`).

```bash
npm view @gradio/client dist-tags --json
```
**Why:** confirms `2.7.0` is also `latest`, so no newer version needs approval.

## 3. Install

```bash
npm install @gradio/client@2.7.0
```
**Why:** a normal dependency, because the server calls the Space at runtime.

| Package | Version | Type |
|---|---|---|
| `@gradio/client` | 2.7.0 | dependency |

```bash
npm audit
```
**Why:** checks for known vulnerabilities after installing. Nothing new: only the 3 existing Prisma CLI findings (`deepmerge-ts`, see task 26), which the developer hasn't decided on yet.

```bash
git show HEAD:package-lock.json > /tmp/lock-old.json
```
**Why:** saves the old lock file for comparison.

```bash
python3 -c "import json; o=json.load(open('/tmp/lock-old.json'))['packages']; n=json.load(open('package-lock.json'))['packages']; print('removed', [k for k in o if k not in n]); print('added', [k for k in n if k not in o])"
```
**Why:** only `@gradio/client` and `fetch-event-stream` were added. Nothing was removed or changed.

## 4. One-off compatibility check with the live Space

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
node --input-type=module -e '
import { Client } from "@gradio/client";
const app = await Client.connect("levihsu/OOTDiffusion");
const api = await app.view_api();
const ep = api.named_endpoints["/process_dc"];
console.log("connected; /process_dc params:", ep.parameters.map(p => p.parameter_name).join(", "));
console.log("returns:", ep.returns.map(r => r.component).join(", "));
process.exit(0);
'
```
**Why:** proves client 2.7.0 can talk to this Space (Gradio 6.20). `view_api()` only **reads the API description**. It doesn't run a try-on, so it uses **no GPU quota** and no token. Got `vton_img, garm_img, category, n_samples, n_steps, image_scale, seed` and `returns: Gallery`, the same as task 27.
- `--input-type=module` lets `node -e` use `import` and top-level `await`.
- `process.exit(0)` closes the client's open connection so the command ends.
- This isn't in the test suite, because unit tests must never call real services.

## 5. Test: `lib/gradio-client.test.ts`

- `// @vitest-environment node` runs this file in **Node** instead of jsdom, because the client is only used on the server.
- It checks that `Client.connect` and `handle_file` (used to pass images by URL in task 29) load. There are no network calls.

```bash
npm test
```
**Why:** `Test Files 6 passed`, `Tests 24 passed` (2 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build.

## 6. Commit, publish, PR, auto-merge

```bash
git add package.json package-lock.json lib/gradio-client.test.ts docs/learning/28_install_gradio_client.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "28_install_gradio_client Install @gradio/client 2.7.0"
```
**Why:** saves the snapshot.

```bash
git push -u origin 28_install_gradio_client
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 28_install_gradio_client --title "28_install_gradio_client Install @gradio/client 2.7.0" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **`timeout` doesn't exist on macOS** (it's a GNU coreutils command). The first attempt was:
  ```bash
  timeout 90 node --input-type=module -e '...same script as step 4...'
  ```
  **Why:** it was meant to stop the check after 90 s if the Space hung. It failed with `command not found: timeout`, so it was re-run without it. The Bash tool's own time limit covers hangs anyway.
- **Only `lib/tryon.ts` may import `@gradio/client`** (code rules). This test file is the one exception, because it tests the package itself.
