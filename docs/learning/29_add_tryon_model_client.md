# 29 Add the try-on model client (`lib/tryon.ts`)

**Branch:** `29_add_tryon_model_client` (starts from `main`)
**Goal:** `runTryOn()`, the **only** code that talks to the try-on model (code rules), built on the contract verified in task 27. Every failure becomes a friendly `TryOnError`.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #25 (task 28, `@gradio/client`).

```bash
git checkout -b 29_add_tryon_model_client
```
**Why:** new task, new branch.

## 2. Read the client's types first

```bash
grep -n 'interface ClientOptions' -A 14 node_modules/@gradio/client/dist/types.d.ts
```
**Why:** shows the options: `token` must look like `` `hf_${string}` `` (the old name `hf_token` is deprecated).

```bash
grep -n 'type PredictReturn' -A 8 node_modules/@gradio/client/dist/types.d.ts
```
**Why:** `predict()` resolves to `{ data, ... }`, and `data[0]` is our Gallery output.

```bash
grep -rn 'export declare function handle_file' -A 3 node_modules/@gradio/client/dist/
```
**Why:** `handle_file(url)` wraps an image URL so the Space downloads it itself.

## 3. `lib/tryon.ts`

- `SPACE_ID = "levihsu/OOTDiffusion"`, `ENDPOINT = "/process_dc"`, `DEFAULT_TIMEOUT_MS = 120_000`.
- **One deadline covers connecting and predicting** (`callSpace()` inside `withTimeout`), because a sleeping Space can make `Client.connect` hang too. The timer is always cleared. If the deadline passes while still connecting, a `timedOut` flag stops `callSpace()` from starting a prediction once the connection finally arrives, so no quota is spent on an answer nobody reads.
- `CATEGORY_TO_OOTD`: `UPPER` → `Upper-body`, `LOWER` → `Lower-body`, `OVERALL` → `Dress`. `satisfies Record<Category, string>` makes TypeScript fail if a new `Category` is added without a mapping. At runtime, `Object.hasOwn` checks the key, because a plain lookup would accept inherited keys like `"toString"`.
- `runTryOn({ personImageUrl, garmentImageUrl, category, timeoutMs? })` returns `{ resultImageUrl }`. That's a temporary URL on the Space, which the future job copies to Cloudinary.
- **Always passes both images.** The Space has sample-image defaults, so a missing image would silently try on the demo garment (task 27 finding). It sends `n_samples: 1`, `n_steps: 20`, `image_scale: 2.0`, and `seed: -1`.
- **Picks the first gallery item with an `image`,** because items can also be videos.

| Code | When | User sees |
|---|---|---|
| `BAD_INPUT` | A URL is empty or not `https`, or the category is unknown | "Please provide a valid person/garment image." |
| `UNAVAILABLE` | `HF_TOKEN` is missing or malformed, or the Space can't be reached | "Try-on isn't available right now…" |
| `QUOTA` | The error mentions "quota" (ZeroGPU) | "Try-on is busy right now…" |
| `TIMEOUT` | No answer within `timeoutMs` | "The try-on took too long…" |
| `NO_RESULT` | The output has no image | "We couldn't create your try-on…" |
| `FAILED` | Anything else | "We couldn't create your try-on…" |

- Provider details are **never** in the message. They're kept in `cause` and logged with `console.error("[tryon] ...")`.

## 4. Tests: `lib/tryon.test.ts`

- `// @vitest-environment node` runs it as server code.
- `vi.mock("@gradio/client")` means no real Space and no GPU quota. `HF_TOKEN` is a placeholder set via `vi.stubEnv`.
- Cases (22):
  - the mapping table;
  - unknown categories `SHOES` and `toString`;
  - a malformed `HF_TOKEN`;
  - connecting that never finishes (timeout);
  - connecting that finishes *after* the timeout (no prediction started);
  - each category → `/process_dc` with both images and the defaults;
  - video items skipped;
  - 4 bad-input URLs (no Space call);
  - missing token;
  - Space unreachable;
  - quota;
  - other errors (details hidden, `cause` kept, logged);
  - timeout (a `predict` that never resolves, with `timeoutMs: 20`);
  - 3 no-result outputs.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** `Test Files 7 passed`, `Tests 46 passed` (22 new). Removing the `timedOut` guard as a planted bug made `does not start a prediction if connecting finishes after the timeout` fail.

```bash
cp lib/tryon.ts /tmp/tryon.ts.bak
```
**Why:** saves the good file before planting a bug.

```bash
sed -i '' '/garm_img: handle_file(input.garmentImageUrl),/d' lib/tryon.ts
```
**Why:** plants the riskiest bug, leaving out the garment image. (`sed -i ''` is macOS syntax; on Linux it's `sed -i`.)

```bash
npm test
```
**Why:** must fail. All 3 `calls /process_dc with both images…` tests failed.

```bash
cp /tmp/tryon.ts.bak lib/tryon.ts
```
**Why:** restores the good file. 46 tests pass again. (Re-checked after the review changes: still caught.)

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build.

## 5. README

- The try-on row now points to `runTryOn()` in `lib/tryon.ts`. The background job and the UI are still planned.

## 6. Commit, publish, PR, auto-merge

```bash
git add lib/tryon.ts lib/tryon.test.ts README.md docs/learning/29_add_tryon_model_client.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "29_add_tryon_model_client Add runTryOn for OOTDiffusion with friendly errors"
```
**Why:** saves the snapshot.

```bash
git push -u origin 29_add_tryon_model_client
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 29_add_tryon_model_client --title "29_add_tryon_model_client Add runTryOn for OOTDiffusion with friendly errors" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **No live try-on was run.** That would spend real ZeroGPU quota and needs your `HF_TOKEN`. The first real run happens when the background job task wires this up with your token in `.env`.
- **The result URL is temporary** (it lives on the Space). Copy it to Cloudinary right away.
- **A timed-out try-on that already started keeps running on the Space** and still uses the shared ZeroGPU quota, because `predict()` can't be cancelled. A later improvement could use `app.submit()` and `.cancel()` on timeout.
- **Quota detection is text-based** (`/quota/i`). If Hugging Face changes the wording, it falls back to `FAILED`, which is still friendly, just less specific.
