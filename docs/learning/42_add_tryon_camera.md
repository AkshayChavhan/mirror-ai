# 42 Add a live camera with a pose guide

**Branch:** `42_add_tryon_camera` (starts from `main`)
**Goal:** on `/tryon`, a **Use camera** button opens the front camera with a **pose-guide outline** to stand inside. **Take photo** feeds the photo into the same preview → Try on / Retake flow as a chosen file.
- From docs/project-plan.md: "Live camera with a pose guide … A photo can also be uploaded from the gallery".
- Unblocked by task 58 (signed-in E2E), which merged just before.

## 1. Create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #61 (task 58, signed-in E2E).

```bash
git checkout -b 42_add_tryon_camera
```
**Why:** new task, new branch.

```bash
cat app/tryon/TryOnStudio.tsx app/tryon/shrinkPhoto.ts .claude/skills/frontend-design/SKILL.md
```
**Why:** reads the studio (choose, shrink, preview, Try on/Retake), the photo shrinker, and the project's frontend-design skill for UI work.
- The skill's advice used here: one memorable element (the outline), everything else quiet, keyboard focus kept visible, and errors that say what happened and how to fix it.

## 2. How it works

- **`app/tryon/CameraCapture.tsx`** (client component):
  - On open, it calls `navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1440 } }, audio: false })`: the front camera, a portrait size if possible, **no microphone**.
  - `<video playsInline muted aria-label="Camera preview">`: `playsInline` keeps iPhones from going full screen, and `muted` allows it to play without a tap.
  - The preview is **mirrored** (`-scale-x-100`), like a mirror. **The photo isn't**, so text on a shirt reads the right way round.
  - **The pose guide:** a dashed white SVG outline of a standing person over the video, marked `aria-hidden`. The visible text "Stand back until your body fits the outline, facing the camera." says the same for everyone.
  - **Take photo** draws **what the preview shows** onto a `<canvas>`, then `canvas.toBlob(…, "image/jpeg", 0.9)` gives a `File` named `camera.jpg`, handed to `onCapture`.
    - The preview uses `object-cover` on a 3:4 box, so a landscape webcam's sides are cut off on screen. `coverCrop(width, height)` works out that same centered 3:4 area, so the photo matches the pose guide (found in review).
    - While the photo is being encoded, Take photo is disabled, so a double-click can't make two. A photo that finishes **after Cancel** is thrown away (found in review).
  - **The camera is always turned off** (`track.stop()` on every track, which turns the camera light off):
    - after Take photo, and on Cancel;
    - when the component closes, for example when the user leaves the page;
    - when it closes **while the browser is still asking for permission** (the stream that arrives late is stopped at once);
    - **when the picture can't be shown even though permission was given**, for example when `video.play()` is refused by autoplay rules. The first version left the camera running there, with a wrong "access is blocked" message (found in review). Now it stops the camera and says *"We couldn't show your camera. Cancel and try again, or choose a photo instead."*
  - **Errors in words** (`cameraErrorMessage`, from the error's `name`), shown in `role="alert"`:
    - `NotAllowedError` or `SecurityError`: "Camera access is blocked. Allow it for this site in your browser settings, or choose a photo instead."
    - `NotFoundError` or `OverconstrainedError`: "No camera was found on this device…"
    - `NotReadableError`: "Another app is using the camera…"
    - anything else: "We couldn't start your camera. Cancel and try again, or choose a photo instead."
    - **Start errors and capture errors are kept apart** (found in review). If the camera didn't start, Take photo is disabled, and Cancel still works. If one *photo* failed ("We couldn't take the photo. Try again…"), the camera is still on, so Take photo stays enabled and the next try clears the message.
    - While starting, the button says "Starting camera…" and is disabled.
  - **Keyboard focus** (found in review): when the camera opens, focus goes to **Cancel**, a button that always works. When it closes, the studio moves focus to the step's heading, "2. Add a photo of yourself" (`tabIndex={-1}`), instead of losing it to the top of the page.
- **`app/tryon/TryOnStudio.tsx`:**
  - "Use camera" sits next to "Choose a photo", **only if the browser can use a camera**. Cameras need a secure page (https or localhost), so `navigator.mediaDevices` can be missing.
  - That's only known in the browser, so it's read with **`useSyncExternalStore`**: the server says "no", and the browser says the truth after hydration, with no hydration mismatch. It's the same pattern as the WhatsApp link (task 45).
  - A camera photo and a chosen file both go through one helper, `preparePhoto(file)`: shrink (at most 1600 px, drops metadata), then preview.
  - The camera replaces the two buttons while it's open.

## 3. Tests

- **`app/tryon/CameraCapture.test.tsx`:** jsdom has no camera, video playback or canvas drawing, so `getUserMedia`, `play`, `videoWidth`/`videoHeight`, `getContext` and `toBlob` are faked.
  - The exact camera request (front, video only), the preview, the outline and its text.
  - Focus is on Cancel when the camera opens.
  - "Starting camera…" is disabled while permission is pending.
  - Take photo draws **the 3:4 middle** of a 640×480 frame (360×480 from x = 140), encodes a JPEG at 0.9, stops the camera, and hands over `camera.jpg`.
  - An encoding failure: an error, the camera stays on, **Take photo still works**, and the retry clears the error.
  - No 2D canvas: an error, and Take photo stays usable.
  - A double click makes one photo, and a photo that finishes after Cancel isn't handed over.
  - **`play()` refused after permission:** the camera is stopped, the "couldn't show" message appears (not "blocked"), and Take photo is disabled.
  - Cancel, closing, and **closing during the permission prompt** each stop the camera.
  - A blocked camera shows the message, with Take photo disabled and Cancel enabled.
  - `cameraErrorMessage` for each error name, and for something that isn't an `Error`.
  - `coverCrop` for a landscape webcam, an exact 3:4 frame, and a tall phone frame.
- **`app/tryon/TryOnStudio.test.tsx`** (the camera is replaced by a stand-in with "take" and "cancel" buttons):
  - no "Use camera" without `mediaDevices`;
  - a camera photo gets the same shrink and preview as a chosen file, the camera closes, and focus is on the step heading;
  - Cancel returns to the two choices, with focus on the step heading.
- **`e2e/tryon-camera.spec.ts`** (CI only: it needs a signed-in user, from task 58, and garments to pick, from the seeded database of task 60):
  - Chromium's **fake camera**: `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`, with the `camera` permission granted.
  - These `launchOptions` are **per worker**, so `test.use` is at the top of the file. **Traces are off** here too (session cookies, public repo).
  - Test 1: sign in, then Use camera → preview and outline text → Take photo → "Your photo" preview, camera gone, "Try on …" and "Retake" there.
  - Test 2: Cancel closes the camera and brings back both choices.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx eslint app/tryon/ && npx tsc --noEmit -p .
```
**Why:** a quick check while building. The first run failed: **a function named `usePhoto` counts as a React Hook**, and hooks can't be called from event handlers ("react-hooks/rules-of-hooks"). Renaming it `preparePhoto` fixed it.

```bash
npx vitest run app/tryon/TryOnStudio.test.tsx app/tryon/CameraCapture.test.tsx
```
**Why:** the studio tests and the camera tests: `33 passed` after the review fixes (11 + 22).

```js
// .camera-check.mjs (throwaway, in the repo root only while it runs, so it finds @playwright/test)
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const context = await browser.newContext({ permissions: ["camera"] });
const page = await context.newPage();
await page.route("https://camera.test/", (route) => route.fulfill({ contentType: "text/html", body: "<video playsinline muted></video>" }));
await page.goto("https://camera.test/");
const result = await page.evaluate(async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1440 } }, audio: false });
  const video = document.querySelector("video");
  video.srcObject = stream;
  await video.play();
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  stream.getTracks().forEach((t) => t.stop());
  return { secure: isSecureContext, width: video.videoWidth, height: video.videoHeight, blobType: blob?.type, blobBytes: blob?.size };
});
console.log(JSON.stringify(result));
await browser.close();
```

```bash
node ./.camera-check.mjs; rm -f ./.camera-check.mjs
```
**Why:** a throwaway check, before relying on CI, that **headless Chromium's fake camera really gives frames that can be captured**.
- The script opens an https page served from memory with `page.route` (no network), because cameras need a secure page.
- It runs the same `getUserMedia` → `play` → canvas → `toBlob` steps as the component.
- Result: `{"secure":true,"width":1080,"height":1440,"blobType":"image/jpeg","blobBytes":14469}`. The fake camera even follows the requested size.

```bash
cp app/tryon/CameraCapture.tsx <scratch>/camera.bak && perl -0pi -e 's/        stopCamera\(stream\);\n        streamRef.current = null;\n        if \(!closed\) setStartError/        if (!closed) setStartError/' app/tryon/CameraCapture.tsx && npx vitest run app/tryon/CameraCapture.test.tsx; cp <scratch>/camera.bak app/tryon/CameraCapture.tsx
```
**Why:** mutation check 1. It leaves the camera on when `play()` fails, and `if the picture can't be shown…` fails. Then the file is restored. `<scratch>` is any temporary folder.

```bash
sed -i '' 's/disabled={!ready || startError !== null || capturing}/disabled={!ready || error !== null || capturing}/' app/tryon/CameraCapture.tsx && npx vitest run app/tryon/CameraCapture.test.tsx; cp <scratch>/camera.bak app/tryon/CameraCapture.tsx
```
**Why:** mutation check 2. It makes any error disable Take photo, and both capture-retry tests fail (`2 failed`). Then the file is restored.

```bash
npm test
```
**Why:** runs the whole suite: `Test Files 49 passed`, `Tests 532 passed` (25 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh && npm run build
```
**Why:** the rest of the checklist, and all of it passes. E2E locally: `23 passed, 9 skipped`. The 2 camera specs skip without the seeded database, and CI runs them.

## 4. Commit, publish, PR, auto-merge

```bash
git add app/tryon/CameraCapture.tsx app/tryon/CameraCapture.test.tsx app/tryon/TryOnStudio.tsx app/tryon/TryOnStudio.test.tsx e2e/tryon-camera.spec.ts docs/task-list.md docs/learning/42_add_tryon_camera.md
```
**Why:** stages this task's files.

```bash
git commit -m "42_add_tryon_camera Add live camera capture with a pose guide"
```
**Why:** saves the snapshot.

```bash
git push -u origin 42_add_tryon_camera
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 42_add_tryon_camera --title "42_add_tryon_camera Add live camera capture with a pose guide" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes, including the fake-camera E2E test.

## Gotchas

- **Always stop the tracks.** Removing the `<video>` doesn't turn the camera off, and the camera light stays on until every track is stopped. That includes the stream that arrives after the camera was already closed.
- **Names starting with `use` are Hooks** to React's lint rules, so don't name ordinary helpers `useSomething`.
- **Cameras need a secure page** (https or localhost). Hide the button when `navigator.mediaDevices` is missing, and read that in the browser only (`useSyncExternalStore`), or the server and browser HTML differ.
- **Mirror the preview, not the photo.**
- **Save what the user saw.** `object-cover` crops the preview, so crop the capture the same way (`coverCrop`).
- **Clean up on every failure path,** not just the happy one. A failure *after* the camera started (`play()`) must stop it too.
- **Separate "can't start" from "one try failed".** Only the first should disable the retry button.
- **When buttons disappear, move focus somewhere sensible,** such as the next control or the section heading.
- **Playwright launch options are per worker:** `test.use({ launchOptions })` has to be at the top of the spec file.
