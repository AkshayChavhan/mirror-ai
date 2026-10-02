# 66 Add Live 3D try-on mode

**Branch:** `66_add_live_3d_tryon_mode` (starts from `main`)
**Goal:** a **"Live 3D"** button on `/tryon`. It opens the front camera, tracks the body on the device (MediaPipe, task 64), and draws the garment's 3D template (task 65) over the person, following them every frame.
- **"Take photo"** captures the camera (without the 3D overlay) and continues to the AI photo try-on, so both modes are kept (decided 2026-09-30).
- **MediaPipe's usage metrics to Google are blocked** by a Content-Security-Policy (decided 2026-10-01), and tracking still works.
- No new packages: `three` and `@mediapipe/tasks-vision` came with tasks 64 and 65.

## 1. Branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #65 (task 65).

```bash
git checkout -b 66_add_live_3d_tryon_mode
```
**Why:** new task, new branch.

```bash
eval "$(fnm env)" && fnm use
```
**Why:** switches this shell to the project's Node (`.nvmrc`: 22.23.2). One shell had Node 20, where `npm run build` failed (see Gotchas).

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** the same Node 22, for a shell where `fnm` itself isn't on the PATH (`command not found: fnm`).

## 2. How it works

### The Content-Security-Policy (`lib/csp.ts`, `next.config.ts`)

- **What MediaPipe sends:** `@mediapipe/tasks-vision` posts usage metrics with `fetch` to `https://odml.pa.googleapis.com/v1/log`, every 60 s and when the tracker closes. That's no camera data, but still a call to Google the developer chose to block.
- **The policy sets only `connect-src`**, which limits which servers a page may *talk to* (fetch, XHR, WebSocket, beacons). It leaves scripts, styles and images alone, so nothing else breaks. Allowed:
  - `'self'`: our pages, server actions, the status endpoint and the MediaPipe files;
  - **Clerk's Frontend API**, read from the publishable key. `clerkFrontendApiOrigin()` decodes `pk_test_`/`pk_live_` + base64(`<host>$`), and anything that isn't a plain host name gives `null`;
  - `https://clerk-telemetry.com` (Clerk's development telemetry);
  - `ws:` **in development only**, for Next's hot reload.
- **`next.config.ts` → `headers()`** sends it with **every page** (`source: "/:path*"`, which also matches `/`).
  - **Why not just `/tryon`:** the browser keeps the policy of the page it **first loaded**. The app's links to `/tryon` (home, product cards, wishlist, history) are `<Link>`s, so they navigate **client-side** without loading a new page. The policy has to be there already. The first version sent it only with `/tryon`; the E2E test then opened `/tryon` directly and passed, while a real visit through a link let the metrics out (section 3).
  - **Checked before widening it:** the only browser code that uses the network calls our own `/api/tryon/[id]/status`; Cloudinary is server-only; there are no analytics or third-party scripts. That matches Clerk's own CSP guide (`connect-src` = Frontend API).

```bash
sed -n 425,470p node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md
```
**Why:** Next 16's guide to CSP: static headers through `headers()` in `next.config.ts`, with no nonces needed when only `connect-src` is set.

```bash
grep -o -E 'new XMLHttpRequest|navigator\.sendBeacon|fetch\(' node_modules/@mediapipe/tasks-vision/vision_bundle.mjs | sort | uniq -c
```
**Why:** finds how MediaPipe sends its metrics (`fetch`), so the right CSP directive (`connect-src`) blocks it.

### The 3D scene (`app/tryon/live/liveScene.ts`)

- `createLiveScene(canvas, garment)` wraps a **transparent** `WebGLRenderer` (`alpha: true`), so the camera shows through.
- An **orthographic camera in preview pixels**: `left 0, right width, top 0, bottom -height`. The garment pose (task 65) is already in preview pixels, with y flipped.
- Ambient plus directional light, so the garment reads as 3D.
- `resize(width, height, pixelRatio)` runs every frame but only resizes when something changed. `dispose()` frees the renderer.
- The renderer factory is a parameter, so unit tests pass a fake (jsdom has no WebGL).

### Live 3D (`app/tryon/live/LiveTryOn.tsx`, `"use client"`)

1. **Camera:** `getUserMedia`, front camera, video only (the same request as the photo camera). Errors use `cameraErrorMessage` from `CameraCapture`.
2. **Start:** `video.play()`, then the tracker (`createPoseTracker`) and the garment's look (`loadGarmentLook`) in parallel. Then the print becomes a `CanvasTexture` with **`colorSpace = SRGBColorSpace`** (or its colours look washed out), then `buildGarment(product.category, …)` (hidden until a body is found) and the scene.
   - **Any failure** (no WASM, no WebGL): "Live 3D isn't available on this device. You can still take or choose a photo.". It stops the camera and frees the tracker. Details go to `console.warn`.
   - **Closed while loading:** a tracker that finishes loading late is closed at once, because the cleanup already ran without it (found by a test).
3. **Every frame** (`requestAnimationFrame`): the view (the canvas's size, mirrored, plus the video's size) → `tracker.detect(video, performance.now())` → `toBodyPose` → `smoothPose` (`SMOOTHING = 0.5`) → `toGarmentPose` → `applyGarmentPose` → `scene.render()`.
   - No body: the garment is hidden, and the status says "Step back until we can see your shoulders.".
   - Body seen: "Move around: the {name} follows you.".
4. **Take photo:** draws **only the video** (the same 3:4 `coverCrop` as `CameraCapture`) to a JPEG `camera.jpg`, stops the camera, and hands it on.
5. **Cleanup** (closing, Cancel, leaving): cancels the frame loop, stops the camera, closes the tracker, and frees the garment, the texture and the scene.

### The studio (`app/tryon/TryOnStudio.tsx`, `app/tryon/page.tsx`)

- **"Live 3D"** sits next to "Use camera", shown when the browser has a camera.
- `LiveTryOn` is loaded with **`next/dynamic` and `ssr: false`**, so three.js and MediaPipe only download when Live 3D opens. Until then it shows "Loading Live 3D…".
- Its photo goes through the **same preview → Try on flow** as the camera (`preparePhoto`). Closing it puts focus back on the photo step's heading.
- `page.tsx` now also passes each garment's **`category`** (`UPPER`/`LOWER`/`OVERALL`), which picks the template. Prices and links still aren't sent to the browser.

### Tracking without a real GPU (`app/tryon/live/poseTracker.ts`)

- **Found by the E2E test:** Live 3D stayed on "Starting Live 3D…" for 30 s. A temporary debug spec (below) timed every WebGL call:
  - headless Chrome has **no GPU**, so WebGL runs on **SwiftShader** (software);
  - MediaPipe's **GPU** path, emulated on the CPU, **froze the page for 22–60 s** on its first frame (one `readPixels`), then took about 0.5 s a frame;
  - three.js's drawing was negligible.
- **The fix:** `preferredDelegate(rendererName)` returns `"CPU"` when WebGL's renderer is a software one (`SwiftShader`, `llvmpipe`, `softpipe`, "Software", "Microsoft Basic Render"), and otherwise `"GPU"`, as before. The name comes from WebGL's `WEBGL_debug_renderer_info`; the probe's context is freed straight away with `WEBGL_lose_context`.
  - On the CPU (XNNPACK), tracking started **about 0.5 s** after the model loaded.
  - The same freeze would hit real users with no GPU (VMs, remote desktops, blocked drivers).
  - An unknown renderer still tries the GPU first and falls back to the CPU, as before.

```bash
npx playwright test e2e/zz-debug-live.spec.ts --reporter=list
```
**Why:** a **temporary** spec (deleted before committing). It printed the browser console, failed requests and CSP violations, timed every WebGL call per canvas and every slow animation frame, and polled the page's state. It showed the 22–60 s `readPixels` on MediaPipe's canvas, and the `SwiftShader` renderer.

## 3. Tests

- **`lib/csp.test.ts`:** reading the Clerk host from fake keys (`pk_test_` + base64 of a made-up host); `null` for no key, the placeholder, a secret key, or a key that doesn't decode to a host; the exact policy; **no Google and no `*`**; only `connect-src`; `ws:` in development only; still blocking Google without a Clerk key.
- **`next.config.test.ts`:** the header rule (the exact policy), and that it covers **every page** (`/:path*`).
- **`app/tryon/live/liveScene.test.ts`:** a transparent clear colour, the garment and lights in the scene, the camera in preview pixels, resizing only on change, rendering, dispose, and a missing WebGL throwing.
- **`app/tryon/live/LiveTryOn.test.tsx`** (camera, tracker, photo loader and scene faked; the pose math and the 3D garment are real; frames run by hand):
  - the camera request, starting the tracker and the product's template (hidden at first), with focus on Cancel;
  - "Step back…" with no body, and Take photo enabled;
  - **with a body:** shown, posed in the preview's pixels (the spine centred at x ≈ 150 of 300), the scene sized to the preview, and "follows you";
  - hidden again when the body leaves;
  - the print as an **sRGB** `CanvasTexture`;
  - Take photo draws **only the video** (crop 140, 0, 360 × 480), stops the camera, and hands over `camera.jpg`;
  - **if the browser can't draw the frame, or it can't be encoded:** "We couldn't take the photo…", with the camera still on, nothing handed over, and Take photo still usable (added after the rules review);
  - Cancel; cleanup frees everything; **a tracker finishing after close is freed**;
  - a blocked camera; the tracker or WebGL failing; "Starting…" with Take photo disabled.
- **`app/tryon/live/poseTracker.test.ts`:** `preferredDelegate` for SwiftShader, llvmpipe, Microsoft Basic Render (CPU), Apple, NVIDIA, Safari's "Apple GPU" and an unknown name (GPU). Plus **a software renderer goes straight to the CPU** (and frees the probe's context), and a real GPU uses the GPU.
- **`app/tryon/TryOnStudio.test.tsx`:** no Live 3D without a camera; it opens for the chosen garment with its category; its photo goes to the preview with focus; Cancel closes it.
- **`app/tryon/page.test.tsx`:** the studio gets each garment's category.
- **`e2e/tryon-live.spec.ts`** (Chromium's fake camera, which shows a test pattern with no person; no traces, because the repo is public):
  - **every page** (home and `/tryon`) sends the policy, without Google;
  - sign in at home → **the home page's "Try it on" link (client-side, checked: the document is still the home page's)** → Live 3D → "Step back…" (MediaPipe's WASM, model and three.js all started) → Take photo → "Your photo" → **the browser blocked `odml.pa.googleapis.com`**. Marked `test.slow()` (about 17 s locally).

```bash
npx vitest run app/tryon lib/csp.test.ts next.config.test.ts
```
**Why:** this task's unit tests while building.

```bash
npx vitest run app/tryon/live/poseTracker.test.ts
```
**Why:** the tracker's tests after the delegate fix: `17 passed`.

```bash
cp app/tryon/live/poseTracker.ts <scratch>/pt.bak && sed -i '' 's/  if (preferredDelegate(webglRendererName()) === "CPU") {/  if (false) {/' app/tryon/live/poseTracker.ts && npx vitest run app/tryon/live/poseTracker.test.ts; cp <scratch>/pt.bak app/tryon/live/poseTracker.ts
```
**Why:** a mutation check. It ignores the renderer, and "goes straight to the CPU when WebGL is software only" fails. Then the file is restored. `<scratch>` is any temporary folder.

```bash
cp app/tryon/live/LiveTryOn.tsx <scratch>/live.bak && sed -i '' 's/if (closed) return loadedTracker.close();/if (closed) return;/' app/tryon/live/LiveTryOn.tsx && npx vitest run app/tryon/live/LiveTryOn.test.tsx; cp <scratch>/live.bak app/tryon/live/LiveTryOn.tsx
```
**Why:** mutation check 2. A tracker that finishes loading after close is no longer freed, and "frees a tracker that finishes loading after Live 3D was closed" fails. Then the file is restored.

```bash
cp app/tryon/live/LiveTryOn.tsx <scratch>/live2.bak && sed -i '' '/texture.colorSpace = THREE.SRGBColorSpace;/d' app/tryon/live/LiveTryOn.tsx && npx vitest run app/tryon/live/LiveTryOn.test.tsx; cp <scratch>/live2.bak app/tryon/live/LiveTryOn.tsx
```
**Why:** mutation check 3. Without the sRGB colour space, the print test fails. Then the file is restored.

```bash
cp app/tryon/live/LiveTryOn.tsx <scratch>/live3.bak && sed -i '' 's/        if (!blob) return setError("We couldn.t take the photo. Try again, or choose a photo instead.");/        if (!blob) return;/' app/tryon/live/LiveTryOn.tsx && npx vitest run app/tryon/live/LiveTryOn.test.tsx; cp <scratch>/live3.bak app/tryon/live/LiveTryOn.tsx
```
**Why:** mutation check 5. A frame that can't be encoded fails silently, and "if the frame can't be encoded…" fails. Then the file is restored.

```bash
cp app/tryon/live/LiveTryOn.tsx <scratch>/live4.bak && sed -i '' 's/    if (!context) return setError("We couldn.t take the photo. Try again, or choose a photo instead.");/    if (!context) return;/' app/tryon/live/LiveTryOn.tsx && npx vitest run app/tryon/live/LiveTryOn.test.tsx; cp <scratch>/live4.bak app/tryon/live/LiveTryOn.tsx
```
**Why:** mutation check 6. A browser that can't draw fails silently, and "if the browser can't draw the frame…" fails. Then the file is restored.

```bash
cp next.config.ts <scratch>/config.bak && sed -i '' 's|source: "/:path\*"|source: "/tryon"|' next.config.ts && npx playwright test e2e/tryon-live.spec.ts --reporter=list -g "metrics are blocked"; cp <scratch>/config.bak next.config.ts
```
**Why:** mutation check 4 (E2E, numbered in the order the checks were written). It puts back the first version's `/tryon`-only header. Arriving through the home page's link, **nothing was blocked** (`Received array: []`): the metrics reached Google. That's the bug the site-wide header fixes. Then the file is restored.
- That run sends one real MediaPipe metrics request from the test browser. It's part of the check.

```bash
npx playwright test e2e/tryon-live.spec.ts --reporter=list
```
**Why:** both Live 3D E2E tests: `2 passed`.

```bash
npm run build && npm run lint; echo "lint exit code: $?"
```
**Why:** build, then lint **after** the build, which copies MediaPipe's JS into `public/` (task 64's ESLint ignore): `lint exit code: 0`.

```bash
npm run typecheck && npm test
```
**Why:** types and the whole unit suite: `Test Files 60 passed`, `Tests 690 passed` (44 new).

```bash
npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist, and all of it passes. E2E: `28 passed, 11 skipped` (the skipped specs need CI's seeded test database). Hooks: `Failures: 0`.

## 4. Commit, publish, PR, auto-merge

```bash
git add next.config.ts next.config.test.ts lib/csp.ts lib/csp.test.ts app/tryon/TryOnStudio.tsx app/tryon/TryOnStudio.test.tsx app/tryon/page.tsx app/tryon/page.test.tsx app/tryon/live/LiveTryOn.tsx app/tryon/live/LiveTryOn.test.tsx app/tryon/live/liveScene.ts app/tryon/live/liveScene.test.ts app/tryon/live/poseTracker.ts app/tryon/live/poseTracker.test.ts e2e/tryon-live.spec.ts docs/task-list.md docs/learning/66_add_live_3d_tryon_mode.md
```
**Why:** stages this task's files.

```bash
git commit -m "66_add_live_3d_tryon_mode Add Live 3D try-on mode with a CSP blocking MediaPipe metrics"
```
**Why:** saves the snapshot.

```bash
git -c http.postBuffer=524288000 push -u origin 66_add_live_3d_tryon_mode
```
**Why:** publishes the branch. The bigger buffer is task 64's fix for large pushes; it's harmless here.

```bash
gh pr create --base main --head 66_add_live_3d_tryon_mode --title "66_add_live_3d_tryon_mode Add Live 3D try-on mode with a CSP blocking MediaPipe metrics" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **A CSP header only applies to the page the browser loads.** With Next's `<Link>`, users reach `/tryon` without a new page load, so a `/tryon`-only header never applied in real use. Send the policy with every page, and test the **real route** (a link click), not just `page.goto`.
- **MediaPipe's GPU path is a trap without a GPU.** On software WebGL (SwiftShader in headless Chrome and CI), the first frame froze the page for 22–60 s. Check the renderer's name and use the CPU there.
- **Measure before fixing.** Wrapping `WebGL2RenderingContext.prototype` methods in a debug spec showed exactly which call (MediaPipe's `readPixels`) was slow, rather than guessing.
- **`.mts` scripts need Node 22+.** Under Node 20, `npm run build` (whose `prebuild` runs `scripts/copy-mediapipe-wasm.mts`) failed with `ERR_UNKNOWN_FILE_EXTENSION`, and Vitest's jsdom failed to load. `fnm use` switched to the `.nvmrc` version, or the `PATH` export where `fnm` wasn't available (section 1).
- **Guard shell variables in chained commands.** A mutation command failed at `fnm` and skipped the line that set the backup folder, so the restore `cp` ran with an empty path (`cp: /live3.bak: No such file`). Nothing was damaged, because the mutation hadn't run either. Check that the backup exists (`test -n "$S"`) before mutating.
- **Cleanup must cover work that finishes after closing.** An `async` start can return a tracker after the effect's cleanup ran, so close it there.
- **Take photo draws the video, not the 3D canvas:** the AI try-on needs the real photo.
- **Load heavy client code on demand:** `next/dynamic` with `ssr: false` keeps three.js and MediaPipe out of the page until Live 3D opens (`ssr: false` is only allowed in client components).
- **Fake camera in Playwright:** `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` plus `permissions: ["camera"]`, set at the top level (launch options are per worker).
- **Playwright's 30 s limit is per test:** a long flow (sign-in, MediaPipe, the metrics flush) needs `test.slow()`, or it times out while still working.
