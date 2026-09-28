# 39 Add the try-on job

**Branch:** `39_add_tryon_job` (starts from `main`)
**Goal:** the Inngest background job for one try-on, lifecycle steps 2–4 in `docs/project-plan.md`: `PROCESSING` → `runTryOn()` → result copied to Cloudinary → `DONE`, or `FAILED` with a friendly message.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #39 (task 30, the database).

```bash
git checkout -b 39_add_tryon_job
```
**Why:** new task, new branch.

## 2. Read what the job builds on

```bash
cat lib/tryon.ts
```
**Why:** `runTryOn()` already turns every model problem into a `TryOnError` with a user-safe `message`. It returns a **temporary** URL on the Space, so the job must copy the result to Cloudinary.

```bash
ls node_modules/inngest/components
```
**Why:** shows where Inngest's pieces live (`InngestFunction`, `InngestStepTools`, `NonRetriableError`, `StepError`…).

```bash
grep -rn "NonRetriableError\|RetryAfterError" node_modules/inngest/index.d.ts
```
**Why:** `NonRetriableError` exists (throw it to stop retries). We don't need it, because model errors are *returned* from their step instead of thrown (section 4).

```bash
ls node_modules/@inngest
```
**Why:** only `ai` is there. **`@inngest/test` isn't installed**, and adding it would need the developer's OK. So the job's logic is tested with a fake `step` instead.

```bash
grep -n "retries\|onFailure\|concurrency?\|timeouts?\|idempotency\|triggers" node_modules/inngest/components/InngestFunction.d.ts
```
**Why:** finds the function options.

```bash
sed -n 325,350p node_modules/inngest/components/InngestFunction.d.ts
```
**Why:** `retries` is **per step, default 3**. `onFailure` runs once the retries are used up.

```bash
grep -n "type FailureEventPayload" -A14 node_modules/inngest/types.d.ts
```
**Why:** inside `onFailure`, the original event is at **`event.data.event`**.

```bash
grep -n "class StepError" -B12 -A10 node_modules/inngest/components/StepError.d.ts
```
**Why:** a step that runs out of retries throws a `StepError`.

```bash
sed -n 15,60p node_modules/inngest/components/InngestFunction.d.ts
```
**Why:** the handler is stored as a **private** `fn`, so tests can't call it directly. That's why we put the logic in a plain exported function (section 4).

```bash
grep -n "run<\|run:" node_modules/inngest/components/InngestStepTools.d.ts
```
**Why:** `step.run(id, fn)` returns the step's result **after a JSON round trip** (`Jsonify<T>`). That's how Inngest saves it.

```bash
grep -n -B2 -A12 "triggers: \[" node_modules/inngest/README.md
```
**Why:** v4 triggers are `{ event: "name" }` objects. Our `tryOnRequested` (task 36) has an `event` property, so it can be used as a trigger directly.

```bash
grep -n "TryOnWhereUniqueInput = Prisma.AtLeast" -A12 node_modules/.prisma/client/index.d.ts
```
**Why:** Prisma 6 lets a unique `where` include other fields, such as `status`. So `update({ where: { id, status: "PENDING" } })` is **one atomic "update only if still PENDING"**. It throws P2025 when nothing matches.

## 3. `lib/tryons.ts`: status changes that can't overwrite each other

- **`claimTryOn(id)`:** `PENDING` → `PROCESSING` in **one conditional update**. It returns `{ personUrl, garmentUrl, category }` (the product's image and category), or `null` if the try-on is gone or already claimed. A duplicate event therefore can't run the model twice.
- **`completeTryOn(id, resultUrl)`:** `PROCESSING` → `DONE` with `resultUrl`. It returns `false` if the try-on is gone or no longer `PROCESSING`.
- **`failTryOn(id, message, from)`:** sets `FAILED` **only while the status is in `from`**, using `updateMany` with `status: { in: from }`. It returns whether anything changed, so a late failure never overwrites `DONE`.
- `app/tryon/actions.ts` (task 38) now calls `failTryOn(..., ["PENDING"])`. If `inngest.send` threw but the event actually got through, the job's newer status wins.

## 4. `lib/tryon-job.ts`: the job

`processTryOn(tryOnId, step)` is a plain function, so it can be tested with a fake `step`. It runs in three steps:
1. **`claim`:** if it returns `null`, the outcome is `"skipped"`.
2. **`run-model`:** calls `runTryOn()`. **A `TryOnError` is returned, not thrown.** A throw would make Inngest retry, calling the model again and spending more GPU quota. The result is then **`mark-failed`** with the error's friendly message, and the outcome is `"failed"`. The user can simply try again. Other errors (bugs) are thrown, so they're retried.
3. **`save-result`:** uploads the Space URL to `mirror-ai/results`, then `completeTryOn`. These are **in one step**, so a result image is never left without a row:
   - if marking `DONE` throws, it deletes the image and rethrows, and the retry uploads again;
   - if marking `DONE` returns `false` (the row was deleted meanwhile), it deletes the image, and the outcome is `"gone"`.

- **Why steps:** Inngest saves each finished `step.run`. On a retry, finished steps are skipped, so a failed save never re-runs the model.
- **`handleTryOnFailure(tryOnId, error)`** is the `onFailure` handler. It logs the error, then marks the try-on `FAILED` from `PENDING` or `PROCESSING` with "We couldn't create your try-on. Please try again.", so the loading screen never spins forever.
- **`tryOnJob`:** `inngest.createFunction({ id: "run-tryon", triggers: [tryOnRequested], retries: 3, onFailure }, handler)`.
- **The one cast:** the handler passes `{ run: (id, fn) => step.run(id, fn) as Promise<T> }`. Every step here returns plain JSON (strings, booleans, `null`, flat objects), and for those `Jsonify<T>` is exactly `T`. A comment in the code says so.

```bash
npx tsc --noEmit
```
**Why:** without the cast, this shows `Type 'Promise<Jsonify<…>>' is not assignable to type 'Promise<T>'`. With it, there are no errors.

## 5. `app/api/inngest/route.ts`

- `functions: [tryOnJob]`.
- In dev mode, the route now reports **`function_count: 2`**. Inngest registers `onFailure` as a second function, `run-tryon-failure`, triggered by its internal `inngest/function.failed` event:

```bash
sed -n 110,135p node_modules/inngest/components/InngestFunction.js
```
**Why:** confirms that 2 is right and not a bug: the failure handler is added with the id `` `${fn.id}${InngestFunction.failureSuffix}` ``, where the suffix is `"-failure"`.

## 6. Tests

- **`lib/tryon-job.test.ts`** (rows, model and Cloudinary mocked; the real `TryOnError`; a fake `step` that records step ids):
  - the happy path (step order, model input, upload folder, `DONE`);
  - an unclaimable try-on is `"skipped"`, and the model is never called;
  - QUOTA, TIMEOUT and NO_RESULT each mark `FAILED` with their message, **without throwing**;
  - an unexpected error rethrows;
  - an upload failure throws, and nothing is saved;
  - a `DONE` failure deletes the image and throws;
  - a vanished row deletes the image;
  - `handleTryOnFailure`;
  - the function's id, trigger, retries and `onFailure`;
  - **the real `onFailure` wiring** reads the id from `event.data.event.data`. A wrong path such as `event.data.run_id` still typechecks, so only this test catches it.
- **`lib/tryons.test.ts`:** claim/complete/fail, each with the conditional `where`, no-match (P2025 or count 0), a malformed id (no DB call), and DB errors.
- **`app/api/inngest/route.test.ts`:** `function_count: 2`.
- **`app/tryon/actions.test.ts`:** `failTryOn(..., ["PENDING"])`.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run lib/tryon-job.test.ts lib/tryons.test.ts app/tryon app/api/inngest
```
**Why:** this task's tests: `12` job tests, `19` row tests, `22` action tests and `3` route tests pass.

```bash
cp lib/tryon-job.ts /tmp/job.bak && cp lib/tryons.ts /tmp/tryons.bak
```
**Why:** saves the good files before planting bugs. Each bug below is undone by copying its backup back.

```bash
sed -i '' 's/      if (error instanceof TryOnError) return { ok: false, message: error.message }; \/\/ already user-safe/      if (error instanceof TryOnError) throw error;/' lib/tryon-job.ts
```
**Why:** plants a **quota bug**: model errors are thrown, so Inngest would retry the model.

```bash
npx vitest run lib/tryon-job.test.ts
```
**Why:** must fail. Got `3 failed`: QUOTA, TIMEOUT and NO_RESULT.

```bash
cp /tmp/job.bak lib/tryon-job.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/^      await deleteImage(uploaded.publicId);$/      \/\/ cleanup removed/' lib/tryon-job.ts
```
**Why:** plants an **orphan bug**: the result image is kept when marking `DONE` fails.

```bash
npx vitest run lib/tryon-job.test.ts
```
**Why:** must fail. Got `1 failed`: `× deletes the uploaded result when marking DONE fails…`.

```bash
cp /tmp/job.bak lib/tryon-job.ts
```
**Why:** restores the file.

```bash
sed -i '' 's/      where: { id, status: TryOnStatus.PENDING },/      where: { id },/' lib/tryons.ts
```
**Why:** plants a **race bug**: the claim no longer checks `PENDING`.

```bash
npx vitest run lib/tryons.test.ts
```
**Why:** must fail. Got `1 failed`: `× moves PENDING to PROCESSING in one conditional update…`.

```bash
cp /tmp/tryons.bak lib/tryons.ts
```
**Why:** restores the file. All 31 job and row tests pass.

```bash
sed -i '' 's/handleTryOnFailure(event.data.event.data.tryOnId, error)/handleTryOnFailure(event.data.run_id, error)/' lib/tryon-job.ts
```
**Why:** plants a **wiring bug**: `onFailure` reads the wrong id. `npx tsc --noEmit` still passes.

```bash
npx vitest run lib/tryon-job.test.ts
```
**Why:** must fail. Got `1 failed`: `× onFailure reads the try-on id from the ORIGINAL event…`.

```bash
cp /tmp/job.bak lib/tryon-job.ts
```
**Why:** restores the file.

```bash
npm test
```
**Why:** `Tests 227 passed` (21 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build: `14 passed` (the route's E2E still gets its safe 500 without a signing key).

```bash
npm run build
```
**Why:** confirms the production build on its own too (`ƒ /api/inngest`).

## 7. Commit, publish, PR, auto-merge

```bash
git add lib/tryon-job.ts lib/tryon-job.test.ts lib/tryons.ts lib/tryons.test.ts app/tryon/actions.ts app/tryon/actions.test.ts app/api/inngest/route.ts app/api/inngest/route.test.ts docs/learning/39_add_tryon_job.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "39_add_tryon_job Add Inngest try-on job"
```
**Why:** saves the snapshot.

```bash
git push -u origin 39_add_tryon_job
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 39_add_tryon_job --title "39_add_tryon_job Add Inngest try-on job" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Not run against the real services yet.** That needs `HF_TOKEN`, Cloudinary keys (blocker 26) and the Inngest dev server. When they're ready, run the app and the dev server together, as in task 37:

```bash
INNGEST_DEV=1 npm run dev
```
**Why:** starts the app in Inngest dev mode.

```bash
npx inngest-cli@1.45.1 dev -u http://localhost:3000/api/inngest
```
**Why:** in a second terminal, the dev server shows each run and its steps at http://localhost:8288.

- **`onFailure` is a second function** (`run-tryon-failure`), so the function count is 2.
- **Deploying later:** one model call can take up to 120 s (`DEFAULT_TIMEOUT_MS`). Serverless hosts cut long requests, so the `/api/inngest` route will need a long enough `maxDuration` there.
- **A rare leftover:** if the server dies right after `claim` writes `PROCESSING` but before Inngest records the step, the retry sees `PROCESSING`, returns `"skipped"`, and the row stays `PROCESSING`. The loading screen (task 43) should give up after a few minutes. The cleanup cron (task 51) removes the row after 24 h.
