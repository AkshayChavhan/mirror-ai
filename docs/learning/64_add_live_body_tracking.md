# 64 Add live body tracking

**Branch:** `64_add_live_body_tracking` (starts from `main`)
**Goal:** the first building block of **Live 3D try-on** (option B): track a person's body on the camera, on the device.
- This task adds the tracker, the math that turns MediaPipe's 33 points into the joints a garment needs, and the files the tracker loads.
- The 3D garments come in task 65, and the Live 3D mode on `/tryon` in task 66.
- **The developer's decisions:**
  - option B (3D clothes), on 2026-09-30;
  - both 3D sources (templates, plus optional `.glb` uploads);
  - keep the AI photo try-on;
  - approved `@mediapipe/tasks-vision@1.0.1`, and `three@0.186.1` with `@types/three@0.186.0` (for task 65);
  - on 2026-10-01: **block MediaPipe's usage metrics to Google** (see section 4).

## 1. Plan and branch

```bash
npm view three version license; npm view @mediapipe/tasks-vision version license
```
**Why:** checks the packages before asking for approval: the latest versions (0.186.1 and 1.0.1), the licences (MIT and Apache-2.0), and that both are maintained (both updated September 2026).

```bash
git checkout -b 64_add_live_body_tracking
```
**Why:** new task, new branch, from the up-to-date `main`.
- Rows 64–67 were added to `docs/task-list.md` in this branch first ("new work goes into the list first"): 64 live body tracking, 65 3D garment templates, 66 the Live 3D mode, 67 `.glb` uploads.

## 2. Install, look, and get the model

```bash
npm install @mediapipe/tasks-vision@1.0.1
```
**Why:** adds MediaPipe's vision tasks (`"^1.0.1"`; the lockfile pins 1.0.1). `npm audit` still shows only the accepted Prisma finding (task 59).

```bash
ls -la node_modules/@mediapipe/tasks-vision/wasm/
```
**Why:** shows what the tracker needs at run time: **WebAssembly** files of about **11 MB** each. There's one with SIMD (fast) and one without (for older browsers), each with a small `.js` loader.

```bash
grep -n "detectForVideo(videoFrame: ImageSource, timestamp: number)" node_modules/@mediapipe/tasks-vision/vision.d.ts
```
**Why:** reads the API from the installed types:
- `FilesetResolver.forVisionTasks(path)` loads the WASM;
- `PoseLandmarker.createFromOptions(...)` loads the model;
- `detectForVideo(video, timeMs)` returns `landmarks` (33 points, 0..1 of the image) and `worldLandmarks` (the same points in metres, with the origin between the hips).

```bash
for v in 1 latest; do curl -s "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/$v/pose_landmarker_lite.task" -o <scratch>/pose-$v.task; done
```
**Why:** downloads the **lite** pose model (5.8 MB, the fastest), both at the **pinned version 1** and at "latest", to compare them. `<scratch>` is any temporary folder.

```bash
shasum -a 256 <scratch>/pose-1.task <scratch>/pose-latest.task
```
**Why:** both have the same SHA-256 (`59929e1d…d574a`), so version 1 is the current model, and pinning it means it can't change underneath us.

```bash
mkdir -p public/mediapipe && cp <scratch>/pose-1.task public/mediapipe/pose_landmarker_lite.task
```
**Why:** commits the pinned model where the tracker loads it from (`/mediapipe/pose_landmarker_lite.task`). A test checks its hash.

```bash
curl -s https://www.apache.org/licenses/LICENSE-2.0.txt -o public/mediapipe/LICENSE-APACHE-2.0.txt
```
**Why:** the app redistributes MediaPipe's model and WASM, so the licence goes next to them, with `public/mediapipe/NOTICE.md` (found in review).
- The NOTICE gives the source URL, version and hash.
- The npm package is Apache-2.0. Neither the model card nor the `.task` file states a licence for the model, so the NOTICE labels "the same Apache-2.0 terms" as an **assumption, not confirmed by Google** (found in review).

## 3. How it works

- **Camera frames never leave the device.** They're processed in the browser. The model and WASM come from **our own app** (`public/`), not a CDN, and always match the package version.
- **`scripts/copy-mediapipe-wasm.mts`** copies the 4 WASM files from `node_modules` to `public/mediapipe/wasm/`, 23.4 MB in total.
  - `package.json` runs it as **`predev`** and **`prebuild`**, so `npm run dev`, `npm run build` (and CI's build, and Vercel's) always have fresh copies. A platform that calls `next build` directly would skip it.
  - The copies are **git-ignored** (`/public/mediapipe/wasm/`), and **ESLint ignores them** (`eslint.config.mjs`). ESLint doesn't read `.gitignore`, so without that, every local `npm run lint` after a dev or build run failed with 10 errors in MediaPipe's own code (found in review).
  - It's TypeScript run directly by Node 22.23 (type stripping), and it throws if the package is ever missing a file.
- **`proxy.ts`:** Clerk's middleware matcher now also skips `.wasm` and `.task`, so about 29 MB of static files don't go through Clerk (found in review).
- **`app/tryon/live/poseTracker.ts`**, `createPoseTracker()`:
  - `import("@mediapipe/tasks-vision")` loads the library **only when Live 3D opens** (a separate chunk);
  - it loads our WASM and model in `VIDEO` mode, for **one person**, with confidence 0.5;
  - it tries the **GPU** first, then the CPU (with a console warning). If both fail it throws, and task 66 shows a friendly message;
  - `detect(video, timeMs)` returns the first person's landmarks, or `null`. **MediaPipe rejects repeated or earlier timestamps**, so each call gets a later one than the last;
  - `close()` frees the model. It's safe to call twice, and `detect` after `close` returns `null` without touching the freed model, which matters for a late animation frame (found in review).
- **`app/tryon/live/bodyPose.ts`** (pure math, no browser APIs):
  - `LANDMARK`: the MediaPipe indices of the 13 joints used. **"left" always means the person's left.**
  - **`toViewPoint(u, v, view)`** places a video point in the preview. The preview crops the video to 3:4 **like CSS `object-cover`**, and is mirrored like a mirror (task 42).
    - So it scales, crops the centered overflow, then mirrors.
    - Without that, a 16:9 webcam's joints would land in the wrong places (found in review).
  - **`toBodyPose(image, world, view)`** gives each joint in preview pixels, with its depth in metres and a `visible` flag (visibility ≥ 0.5). It also works out:
    - `shoulderCenter`, `hipCenter`;
    - `shoulderWidth`, the garment's scale;
    - `torsoHeight`;
    - `roll`, the shoulder tilt (0 = level; positive when the screen-right shoulder is lower);
    - `yaw`, the turn, `atan2(Δdepth, Δwidth)` from the world landmarks, positive when the left shoulder is farther away;
    - `mirrored`.
  - **Only the shoulders are required.** With the hips out of frame, which is typical when seated at a laptop, `hipCenter` is **estimated** 1.35 shoulder widths "down" (perpendicular to the shoulder line), and `hipsEstimated: true` tells the garment code (found in review).
  - It returns `null` for fewer than 33 points, an unclear shoulder, or shoulders closer than 4% of the width.
  - `smoothPose(previous, next, alpha)` evens out frame-to-frame jitter: each joint moves `alpha` of the way, visibility comes from the new frame, and sizes and angles are recomputed. It never mixes poses placed for differently mirrored previews: then it takes the new one.

## 4. MediaPipe's usage metrics (found in review)

- MediaPipe Tasks has **built-in telemetry**. About once a minute (and on `close()`), it POSTs to `https://odml.pa.googleapis.com/v1/log` with:
  - the task type and running mode;
  - the OS (from the user agent);
  - the library version;
  - speed figures.
- It sends **no camera images and no landmarks**. Its README says so ("Privacy Notice"), and adds: "**You are responsible for obtaining informed consent from your app users**".
- **There's no switch to turn it off** (searched the bundle).
- **The developer chose to block it** (2026-10-01). Task 66's Live 3D page gets a **Content-Security-Policy** that only allows connections to our own app and Clerk, so the browser refuses the metrics request. Task 66 will check that tracking still works then.
- Row 64's first wording ("no third-party calls") was wrong, and is corrected.

```bash
sed -n 212,226p node_modules/@mediapipe/tasks-vision/README.md
```
**Why:** reads MediaPipe's own privacy notice, which confirms the metrics and that input data stays on the device.

## 5. Tests

- **`app/tryon/live/bodyPose.test.ts`**, with a person standing straight facing the camera:
  - mirrored and unmirrored pixels, the centers, sizes, `mirrored`, and real hips;
  - **estimated hips**, straight below, perpendicular to tilted shoulders, and with only one hip unclear;
  - the tilt sign both ways, yaw, depth, an unsure elbow, and the 4 "no pose" cases;
  - **`toViewPoint` with a 16:9 → 3:4 crop:** the center stays centered, the sides are cropped (not stretched), mirroring is around the center, and with no source size it maps straight across;
  - smoothing: no previous pose, halfway moves, alpha 1, visibility from the new frame, yaw, and **no mixing across mirroring**.
- **`app/tryon/live/poseTracker.test.ts`** (MediaPipe faked):
  - our paths and options, the CPU fallback with a warning, and a throw when both fail;
  - `detect` and `null`;
  - the timestamp guard (100, 100, 50, 200 become 100, 101, 102, 200);
  - **`close` once even when called twice**, and **`detect` after `close`**.
- **`scripts/copy-mediapipe-wasm.test.ts`:** the copy (temp folders), a missing file, the installed package having every file, and **the committed model's SHA-256**.
- **`package.test.ts`:** `predev` and `prebuild` run the copy script.
- **`e2e/mediapipe-assets.spec.ts`:** the model at its exact size, and both WASM builds as **`application/wasm`** (needed for fast streaming compilation), with their loaders. It also checks there's **no Clerk header**, since the matcher now skips these files.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
node scripts/copy-mediapipe-wasm.mts
```
**Why:** runs the copy script by hand once: "Copied 4 WASM files (23.4 MB) to public/mediapipe/wasm". Node 22.23 runs `.mts` directly, with no warning.

```bash
npx vitest run app/tryon/live scripts/copy-mediapipe-wasm.test.ts
```
**Why:** the new unit tests. The first version had `27 passed`.
- One test first failed on floating point: (1 − 0.57) × 1000 isn't exactly 430, so the centers are compared with `toBeCloseTo`.

```bash
npx tsc --noEmit -p .
```
**Why:** a typecheck while building. It rejected `import … from "./copy-mediapipe-wasm.mts"`: TypeScript only allows a `.mts` ending with `allowImportingTsExtensions`. The fix was to import `./copy-mediapipe-wasm.mjs`: TypeScript maps it to the `.mts` source, and Vitest finds the file too.

```bash
npm run build && npm run lint
```
**Why:** **lint after a build**, the case the first version missed. With the ESLint ignore it's now clean, even though the build has just copied MediaPipe's JS into `public/`.

```bash
npm test
```
**Why:** runs the whole suite: `Test Files 53 passed`, `Tests 597 passed` (36 new).

```bash
npx playwright test --reporter=line
```
**Why:** E2E, run 4 times. **3 runs: `26 passed, 11 skipped`** (36 s to 1.3 min).
- **One run had 4 failures** and was slow everywhere: the middleware's simple page checks took 10–12 s instead of about 2 s. That fits slow responses from Clerk, which those and the sign-in tests depend on. That run's list didn't show which 4 failed.
- The same code then passed 3 times in a row. CI runs everything again.

```bash
bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the guardrail hook's own tests: `Failures: 0`.

## 6. Commit, publish, PR, auto-merge

```bash
git add .gitignore eslint.config.mjs proxy.ts package.json package-lock.json package.test.ts scripts/copy-mediapipe-wasm.mts scripts/copy-mediapipe-wasm.test.ts public/mediapipe/pose_landmarker_lite.task public/mediapipe/NOTICE.md public/mediapipe/LICENSE-APACHE-2.0.txt app/tryon/live/bodyPose.ts app/tryon/live/bodyPose.test.ts app/tryon/live/poseTracker.ts app/tryon/live/poseTracker.test.ts e2e/mediapipe-assets.spec.ts docs/task-list.md docs/learning/64_add_live_body_tracking.md
```
**Why:** stages this task's files. It includes the 5.8 MB model and its notice, but **not** the git-ignored WASM copies.

```bash
git commit -m "64_add_live_body_tracking Add on-device body tracking for Live 3D"
```
**Why:** saves the snapshot.

```bash
git push -u origin 64_add_live_body_tracking
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 64_add_live_body_tracking --title "64_add_live_body_tracking Add on-device body tracking for Live 3D" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Read what a library sends home.** MediaPipe "runs on device" for the images, but still sends usage metrics. Check the bundle and the README before promising "no third-party calls".
- **ESLint doesn't read `.gitignore`.** Generated or copied files need their own entry in `globalIgnores`. Test lint *after* the build, not only before.
- **`grep "rror"` matches "mi*rror*-ai".** Filter build logs with `Compiled|Failed to compile` instead.
- **MediaPipe needs strictly increasing timestamps** in `VIDEO` mode. Guard them yourself, and stop calling it after `close()`.
- **Pin model versions** (`…/float16/1/…`, not `latest`), test the file's hash, and ship the licence with what you redistribute.
- **A cropped preview needs the crop in the math:** `object-cover` scales and cuts, it doesn't stretch.
- **Serve WASM as `application/wasm`** (Next's static files do), or browsers fall back to slower compilation.
- **Don't commit what `npm install` already brings.** Copy it into `public/` before `dev` and `build`.
- **Importing a `.mts` file in TypeScript:** write `.mjs` in the import.
