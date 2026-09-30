# 43 Add the try-on loading screen

**Branch:** `43_add_tryon_loading_screen` (starts from `main`)
**Goal:** after **Try on**, `/tryon` shows a loading screen that asks the status endpoint (task 40) every few seconds.
- **DONE:** it opens the result page (task 44, with the slider, download and WhatsApp share).
- **FAILED:** it says why, with **Try again**.
- From docs/project-plan.md: "Capture → preview (Retake / Try on) → loading screen that polls the job status".

## 1. Create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #62 (task 42, the camera).

```bash
git checkout -b 43_add_tryon_loading_screen
```
**Why:** new task, new branch.

```bash
cat "app/api/tryon/[id]/status/route.ts"
```
**Why:** reads what the screen will ask for. The endpoint is owner-only and never cached (`no-store`). It answers:
- `200 { status, resultUrl, errorMessage, shareId }`;
- `401` when signed out;
- `404` for missing, expired or someone else's;
- `500` with a friendly message.

```bash
grep -rln "replaceState" node_modules/next/dist/docs/
```
**Why:** checks how to put `?tryon=<id>` in the address without a reload. Next 16's docs ("Native History API", in 04-linking-and-navigating.md) say `window.history.replaceState` works and keeps Next's router in sync, with no server round trip.

## 2. How it works

- **`app/tryon/useTryOnStatus.ts`:** a hook, `useTryOnStatus(tryOnId)`, returns the progress:
  - `waiting` (PENDING or PROCESSING, plus `slow`), `done` (with `shareId`), `failed` (with the message), or `lost` (polling stopped without an answer);
  - it asks `/api/tryon/<id>/status` (with `cache: "no-store"`) **right away, then every 2.5 s**, each time the previous answer has arrived (a `setTimeout` chain, so requests never pile up);
  - **it stops on DONE, FAILED, 401 or 404,** when the screen closes (`AbortController` plus `clearTimeout`), or when the id changes;
  - **server hiccups** (5xx, network, an odd reply) are retried. After **5 in a row** it gives up: "We couldn't check your try-on. It will be in your history when it's ready."
  - after **1 minute** it's `slow`: "It's taking longer than usual", with a link to `/history`, since the model can queue for a GPU;
  - after **5 minutes** it stops: "This is taking much longer than usual…";
  - **each request has a 10 s time limit** (its own `AbortController`, also cancelled when polling stops). A hung request counts as an error and polling continues (found in review). `AbortSignal.any` would be shorter, but older Safari doesn't have it, and there it would break polling completely;
  - the state is stored **with its id**, so a new id starts from "waiting" without resetting state inside the effect (React's lint rules flag that);
  - `interpretStatus(httpStatus, body)` is exported and tested on its own. The reply is `unknown`, and its shape is checked.
- **`app/tryon/TryOnStudio.tsx`:**
  - **what it watches:** the try-on in the address (`initialTryOnId`) **only until this page starts one** (`state === INITIAL`); after that, the one just started, or none if starting failed. **Try again** dismisses it, so the garment, photo and Try on come back, **with the same photo still chosen**, and focus moves to the photo step's heading.
    - The first version fell back to the address id whenever a start failed. After two Try agains, a dismissed try-on from the address could come back (found in review);
  - **the address:** while watching, `?tryon=<id>` is added with `window.history.replaceState`, and removed after Try again. A refresh keeps the loading screen;
  - **DONE:** `router.replace("/tryon/<shareId>")` opens the result page **in place of** the loading screen in the history (found in review).
    - With a normal link-style navigation, Back reopened `/tryon?tryon=<id>`, its first check said DONE again, and it sent the user forward again, so they couldn't get back past the result page.
    - Now Back goes to the page before the studio;
  - **the screen:** a spinner (`aria-hidden`, and `motion-reduce:animate-none` for people who turn motion off). The **status line is always in the page**, so screen readers announce each change: "Waiting to start…", then "Creating your try-on… This can take a minute.", then "Your try-on is ready. Opening it…";
  - failed or lost gives `role="alert"` with the message, **Try again**, and, for lost, **Go to your history**;
  - while watching, the garments, camera and "Choose a photo" are disabled.
- **`app/tryon/page.tsx`:** it reads `?tryon=` and passes it on **only if it looks like an id** (24 hex characters). The status endpoint still checks it's this user's: someone else's id gets a 404, which shows as "We couldn't find that try-on."
- **Watch out for the hook:** writing the studio with a shell script failed, because the guardrail hook blocks any command containing the word "push", and the first version's `router.push(` counted. The editor tool was used instead (see task 56). The final code uses `router.replace(` (above).

## 3. Tests

- **`app/tryon/useTryOnStatus.test.ts`** (fake `fetch`, fake timers, so minutes of polling run instantly):
  - nothing to watch gives `null` and no requests;
  - it starts as waiting and asks right away with `no-store`;
  - PENDING → PROCESSING → DONE every 2.5 s, then **no more requests**;
  - FAILED with its message stops;
  - a 500 hiccup is retried without showing an error;
  - 5 network errors in a row give "lost";
  - `slow` after 1 minute, and "lost" after 5, with no more requests;
  - closing stops requests, and a new id starts again from waiting;
  - **a hung request is given up after 10 s**, and the next one is asked;
  - `interpretStatus` for 401, 404, 500, an odd reply, an unknown status, FAILED without a message, and DONE without a token.
- **`app/tryon/TryOnStudio.test.tsx`** (the hook and `next/navigation` mocked):
  - after Try on it watches the new id and the address gets `?tryon=<id>`;
  - the PROCESSING text and spinner;
  - slow shows the text and the history link;
  - DONE opens `/tryon/<shareId>` **once, with `replace`**;
  - FAILED: the message and no spinner, then **Try again** stops watching, re-enables everything with the same photo, cleans the address, and **moves focus to the step heading**;
  - a dismissed try-on from the address **never comes back**: dismiss A, start B, B fails, dismiss B, then a start that errors watches nothing, not A;
  - lost: the message, the history link, and Try again;
  - `?tryon=<id>` after a refresh: it watches straight away, with the choices locked.
- **`app/tryon/page.test.tsx`:** `?tryon=<id>` is passed on; not-an-id and repeated values are not.
- **`e2e/tryon-loading.spec.ts`** (CI: signed in, seeded garments):
  - a real try-on can't be started there (no Cloudinary keys), so the page opens `/tryon?tryon=<id>`, and the status replies are faked with **`page.route`**;
  - PROCESSING, then DONE, lands on the **seeded result page** ("Trying on: E2E Linen Shirt"). The fake says DONE only after the test has seen "Creating…", so a slow page load can't skip that step (found in review);
  - **Back** from the result page goes to the landing page and **doesn't bounce** forward;
  - FAILED shows the message, and Try again returns to `/tryon` with "Choose a photo" enabled;
  - the error is found **by its text**, because Next adds its own empty `role="alert"` (the route announcer) to every page.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run app/tryon/useTryOnStatus.test.ts
```
**Why:** the hook's tests: `17 passed` (after the review fixes).

```bash
npx vitest run app/tryon
```
**Why:** every try-on test (studio, page, camera, actions, hook): `10 passed` files, `130 passed` tests (after the review fixes).

```bash
npm test
```
**Why:** runs the whole suite. The first full run had **1 failure**: "puts the try-on in the address". It passed on its own, so the next steps reproduce it before fixing it.

```bash
for i in 1 2 3 4 5; do npx vitest run app/tryon/TryOnStudio.test.tsx 2>&1 | grep -E "Tests "; done
```
**Why:** reproduces it: it **failed 1 run in 5**, and never when run alone (12 runs).
- **The cause:** a race in the test. It waited until the hook was *called* with the new id (during render), but the address is set in a `useEffect`, which React runs *after* that render is committed. Under load, the check sometimes ran first.
- **The fix:** `await waitFor(() => expect(window.location.search).toBe(...))`, which waits for the thing being checked.

```bash
fails=0; for i in $(seq 1 15); do npx vitest run app/tryon/TryOnStudio.test.tsx 2>&1 | grep -q "failed" && fails=$((fails+1)); done; echo "$fails of 15"
```
**Why:** proves the fix: `0 of 15` (and `0 of 3` full-suite runs). Final count after the review fixes: `Test Files 50 passed`, `Tests 561 passed` (29 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh && npm run build
```
**Why:** the rest of the checklist, and all of it passes. E2E locally: `23 passed, 11 skipped`. The 2 loading-screen specs skip without the seeded database, and CI runs them.

```bash
cp app/tryon/TryOnStudio.tsx <scratch>/studio.bak && sed -i '' 's/const watchedId = state === INITIAL ? initialTryOnId : state.error === null ? state.tryOnId : null;/const watchedId = (state.error === null ? state.tryOnId : null) ?? initialTryOnId;/' app/tryon/TryOnStudio.tsx && npx vitest run app/tryon/TryOnStudio.test.tsx; cp <scratch>/studio.bak app/tryon/TryOnStudio.tsx
```
**Why:** mutation check 1. It puts back the first version's fallback, and `never goes back to a dismissed try-on…` fails. Then the file is restored. `<scratch>` is any temporary folder.

```bash
cp app/tryon/useTryOnStatus.ts <scratch>/hook.bak && sed -i '' 's/const requestTimer = setTimeout(cancelRequest, REQUEST_TIMEOUT_MS);/const requestTimer = undefined;/' app/tryon/useTryOnStatus.ts && npx vitest run app/tryon/useTryOnStatus.test.ts; cp <scratch>/hook.bak app/tryon/useTryOnStatus.ts
```
**Why:** mutation check 2. It removes the request time limit, and `gives a hung request up after 10 s…` fails. Then the file is restored.

## 4. Commit, publish, PR, auto-merge

```bash
git add app/tryon/useTryOnStatus.ts app/tryon/useTryOnStatus.test.ts app/tryon/TryOnStudio.tsx app/tryon/TryOnStudio.test.tsx app/tryon/page.tsx app/tryon/page.test.tsx e2e/tryon-loading.spec.ts docs/task-list.md docs/learning/43_add_tryon_loading_screen.md
```
**Why:** stages this task's files.

```bash
git commit -m "43_add_tryon_loading_screen Add loading screen that polls the try-on status"
```
**Why:** saves the snapshot.

```bash
git push -u origin 43_add_tryon_loading_screen
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 43_add_tryon_loading_screen --title "43_add_tryon_loading_screen Add loading screen that polls the try-on status" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes, including the two loading-screen E2E tests.

## Gotchas

- **Poll with a `setTimeout` chain, not `setInterval`,** so a slow reply never has another request stacked on top of it. Always stop on unmount (`AbortController`).
- **Always have an end:** a time limit and an error limit, and a place to go afterwards (`/history`). **Each request needs its own time limit too**, or one hung request stops everything.
- **Leave a temporary screen with `router.replace`**, not a history-adding navigation. Otherwise Back returns to it, and it can send the user forward again.
- **A fallback value must not come back later:** use the address id only until the page's own action has answered.
- **Keep live regions in the page from the start.** Text added together with a new `role="status"` element may not be announced.
- **Store async results with the key they belong to,** rather than resetting state in an effect.
- **`page.route` fakes one endpoint in E2E** when the real flow needs a service CI doesn't have.
- **`getByRole("alert")` can match Next's empty route announcer:** find messages by their text.
- **A test that fails sometimes is a real bug** (here, in the test). Reproduce it in a loop, find the race, and wait for what you assert (`waitFor`) instead of for something that happens earlier.
