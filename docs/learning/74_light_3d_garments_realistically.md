# 74 Light 3D garments realistically

**Branch:** `74_light_3d_garments_realistically` (starts from `main`)
**Goal:** Live 3D's garments look less pasted on.
- They get soft surroundings to reflect (three.js's built-in `RoomEnvironment`), and their lighting follows the room's brightness, measured from the camera.
- Chosen by the developer on 2026-10-05, after testing a real Mixamo sweater (task 73).
- No new packages: `RoomEnvironment` and `PMREMGenerator` ship with three.js 0.186.

## 1. Branch and setup

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #73 (task 73). I waited for its merge, because rows 73 and 74 are adjacent lines in the task list.

```bash
git checkout -b 74_light_3d_garments_realistically
```
**Why:** new task, new branch.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 (`.nvmrc`) in a shell where `fnm` isn't on the PATH.

```bash
ls node_modules/three/examples/jsm/environments/; grep -n "environmentIntensity" node_modules/three/src/scenes/Scene.js | head -3
```
**Why:** checks that three 0.186 has `RoomEnvironment` and `Scene.environmentIntensity`, which scales the environment light as a whole.

## 2. Why the garment looked pasted on

- It had **two fixed lights** (ambient and one directional) and **nothing around it to reflect**, so fabrics got flat shading. It was lit **the same in a dim room as in daylight**, never matching the camera image around it.

## 3. How it works

- **`app/tryon/live/liveScene.ts`:**
  - **Environment:** `roomEnvironment()` prepares three.js's `RoomEnvironment`, a soft, evenly lit room, with a `PMREMGenerator`, the form three.js needs for lighting with reflections. It sets the result as `scene.environment`. Fabrics then get gentle shading and highlights from every side.
    - The room and the generator are freed right after; the texture is freed with the scene.
    - It needs a real `WebGLRenderer`. With unit tests' fake renderer it returns `null` and the scene works without it.
    - It's passed in as `makeEnvironment` (default `roomEnvironment`), so tests can use a fake texture.
    - **If it fails** (e.g. a lost GPU context), Live 3D carries on with the two plain lights and logs a warning, instead of saying "isn't available" and leaking the renderer (found by the rules-reviewer).
  - **Gentler lights:** the environment gives soft light from all around, so ambient goes 1.1 → 0.35 and the key light 1.4 → 0.9 (`LIGHTING`).
  - **`setBrightness(factor)`** scales the environment (`environmentIntensity`) and both lights together.
- **`app/tryon/live/cameraBrightness.ts`** (pure, except one browser function):
  - `averageLuminance(rgba)`: the eye-weighted brightness (Rec. 709: green counts most, blue least), 0–1.
  - `brightnessFactor(luminance)`: 1 at `NEUTRAL_LUMINANCE` (0.45), limited to **0.5–1.3** (`BRIGHTNESS_RANGE`), so a black frame never makes the garment vanish and a bright window never blows it out.
  - `easeToward(current, target)`: a quarter of the way per step, so the lighting changes smoothly.
  - `sampleCameraBrightness(video, context)`: draws the frame into a **16×16** canvas and averages it. Null if it can't be read.
- **`app/tryon/live/LiveTryOn.tsx`:** after the scene is created, a 16×16 canvas (`willReadFrequently`) samples the camera **every 15 frames** (about twice a second), and `scene.setBrightness(eased factor)` follows. Without a 2D canvas the lighting just stays normal.

## 4. Tests

- **`app/tryon/live/cameraBrightness.test.ts`:** black, white and grey; green > red > blue; averaging and empty input; neutral = 1; dimmer and brighter within the limits; easing gets there smoothly; sampling draws small and averages; an unreadable frame gives `null`.
- **`app/tryon/live/liveScene.test.ts`:** the environment comes from the factory, made with the scene's renderer; it works without one; **a failing factory leaves plain lights and a warning**; `setBrightness` scales the environment and both lights; `dispose` frees the environment.
- **`app/tryon/live/LiveTryOn.test.tsx`:**
  - a dim room: measured on frame 0, dimmer but only part of the way, not measured again until frame 15, and still easing down;
  - with no 2D canvas, nothing is measured and Live 3D carries on.
  - jsdom has no 2D canvas, so the tests' default `getContext` returns `null`. This also avoids jsdom's "not implemented" noise.
- **`app/tryon/live/liveScene.test.ts`** restores mocks in `afterEach`, so the `console.warn` spy can't leak into later tests if one fails early.
- **`e2e/tryon-live.spec.ts`:** the tracking test collects `console` warnings and expects none saying "Soft lighting isn't available" (the real environment was built in the browser).

```bash
npx vitest run app/tryon/live
```
**Why:** the Live 3D tests: `10 files`, `152 passed`, then `153` after the review's fallback test.

```bash
mutate() { cp "$1" <scratch>/mutant.bak || return 1; sed -i '' "$2" "$1"
  if cmp -s "$1" <scratch>/mutant.bak; then echo "sed matched nothing!"; else npx vitest run ${=3}; fi
  cp <scratch>/mutant.bak "$1"; }
```
**Why:** the mutation helper from task 73, with its `cmp` guard: a pattern that matches nothing is reported instead of silently "passing".

```bash
mutate app/tryon/live/liveScene.ts 's/      key.intensity = LIGHTING.key \* factor;/      void factor;/' app/tryon/live/liveScene.test.ts
```
**Why:** mutation 1, brightness not applied to the key light: the `setBrightness` test fails.

```bash
mutate app/tryon/live/liveScene.ts 's/  scene.environment = environment;/  void environment;/' app/tryon/live/liveScene.test.ts
```
**Why:** mutation 2, no environment: the environment test fails.

```bash
mutate app/tryon/live/liveScene.ts '/      environment?.dispose();/d' app/tryon/live/liveScene.test.ts
```
**Why:** mutation 3, environment not freed: the dispose test fails.

```bash
mutate app/tryon/live/LiveTryOn.tsx 's/          if (sampler \&\& frameCount++ % SAMPLE_EVERY_FRAMES === 0) {/          if (sampler) {/' app/tryon/live/LiveTryOn.test.tsx
```
**Why:** mutation 4, measuring every frame: the "every 15 frames" test fails.

```bash
mutate app/tryon/live/LiveTryOn.tsx 's/              brightness = easeToward(brightness, brightnessFactor(luminance));/              brightness = brightnessFactor(luminance);/' app/tryon/live/LiveTryOn.test.tsx
```
**Why:** mutation 5, no easing (sudden jumps): the same test fails.

```bash
mutate app/tryon/live/cameraBrightness.ts 's/  return Math.min(BRIGHTNESS_RANGE.max, Math.max(BRIGHTNESS_RANGE.min, luminance \/ NEUTRAL_LUMINANCE));/  return luminance \/ NEUTRAL_LUMINANCE;/' app/tryon/live/cameraBrightness.test.ts
```
**Why:** mutation 6, no limits: the "within limits" test fails.

```bash
cp app/tryon/live/liveScene.ts <scratch>/mutant.bak && python3 -c 'import re,sys; p="app/tryon/live/liveScene.ts"; s=open(p).read(); s=re.sub(r"  let environment: THREE.Texture \| null = null;\n  try \{\n    environment = makeEnvironment\(renderer\);\n  \} catch \(environmentError\) \{\n.*?\n  \}", "  const environment = makeEnvironment(renderer);", s, flags=re.S); open(p,"w").write(s)' && npx vitest run app/tryon/live/liveScene.test.ts; cp <scratch>/mutant.bak app/tryon/live/liveScene.ts
```
**Why:** mutation 7, no fallback when the environment fails (a multi-line change, so Python instead of `sed`): "carries on with plain lights…" fails.

```bash
cp app/tryon/live/liveScene.ts <scratch>/mutant.bak && python3 -c 'p="app/tryon/live/liveScene.ts"; s=open(p).read(); s=s.replace("const roomEnvironment: EnvironmentMaker = (renderer) => {\n", "const roomEnvironment: EnvironmentMaker = (renderer) => {\n  if (Math.random() >= 0) throw new Error(\"planted: environment broken\");\n", 1); open(p,"w").write(s)' && npx playwright test e2e/tryon-live.spec.ts -g "tracks in the browser" > <scratch>/e2e-mut.log 2>&1; cp <scratch>/mutant.bak app/tryon/live/liveScene.ts
```
**Why:** mutation 8, in a real browser: the environment always fails. Its output goes to a file (read below).

```bash
grep -E "✓|✘|passed|failed|Expected|Received|Soft lighting|Failed to" <scratch>/e2e-mut.log | grep -v -i "clerk_db_jwt\|FAPI" | cut -c1-170 | head -8
```
**Why:** reads that run's result with the Clerk lines filtered out, so no session token can reach the terminal (task 71). Next time, also drop `__clerk` lines (as the command below does), to catch the testing token too. The E2E test fails, showing `"[live] Soft lighting isn't available here; using plain lights. Error: planted: environment broken"`.
- **My first plant didn't compile:** `if (renderer) throw …` narrowed `renderer`'s type, so the build's type check failed and **no test ran**. Its output had no test lines, so I checked the log instead of counting it as caught:

```bash
grep -v -i "clerk_db_jwt\|FAPI\|__clerk" <scratch>/e2e-mut.log | grep -vE "^\s*$|WebServer\] *[│├└▲○ƒ●]" | tail -15 | cut -c1-200
```
**Why:** the last lines of that log, Clerk lines filtered out: `Failed to type check.` and `Process from config.webServer was not able to start`. `if (Math.random() >= 0)` throws just the same without changing any types. Every file was restored afterwards.

```bash
npx playwright test e2e/tryon-live.spec.ts --reporter=list > <scratch>/e2e-live.log 2>&1; grep -E "✓|✘|-  |passed|failed|skipped" <scratch>/e2e-live.log | grep -v -i "clerk_db_jwt\|FAPI"
```
**Why:** the Live 3D specs alone, with the real environment: `2 passed, 1 skipped` (the skip is task 72's seeded-database test). The tracking test, with its new console-warning check, passes.

```bash
npm run build && { npm run lint; echo "lint exit code: $?"; }
```
**Why:** build, then lint after it (task 64's ESLint ignore for the copied MediaPipe files): `lint exit code: 0`.

```bash
npm run typecheck && npm test
```
**Why:** `Test Files 64 passed`, `Tests 846 passed` (15 new).

```bash
npm run test:e2e > <scratch>/e2e.log 2>&1; grep -E '__clerk_(db_jwt|testing_token)=' <scratch>/e2e.log | grep -cv '=<redacted>'
```
**Why:** the whole E2E suite: `31 passed, 12 skipped` (the skipped specs need CI's seeded database), with `0` unredacted tokens.
- The Live 3D specs build the **real** `RoomEnvironment` in headless Chrome. Since the fallback, a failure there only **warns**, so `e2e/tryon-live.spec.ts` now collects the browser's console warnings and expects no "Soft lighting isn't available". That checks the real environment builds (found by the rules-reviewer: the earlier wording relied on Live 3D failing, which it no longer does).

```bash
bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the git-safety hook's tests: `Failures: 0`.

## 5. Commit, publish, PR, auto-merge

```bash
git add app/tryon/live/cameraBrightness.ts app/tryon/live/cameraBrightness.test.ts app/tryon/live/liveScene.ts app/tryon/live/liveScene.test.ts app/tryon/live/LiveTryOn.tsx app/tryon/live/LiveTryOn.test.tsx e2e/tryon-live.spec.ts docs/task-list.md docs/learning/74_light_3d_garments_realistically.md
```
**Why:** stages this task's files.

```bash
git commit -m "74_light_3d_garments_realistically Light 3D garments with an environment and the room's brightness"
```
**Why:** saves the snapshot.

```bash
git -c credential.helper= -c credential.helper='!f() { test "$1" = get || exit 0; echo username=<repo-owner>; echo "password=$(gh auth token --user <repo-owner>)"; }; f' push -u origin 74_light_3d_garments_realistically
```
**Why:** publishes the branch with the repo owner's stored login, without switching the GitHub CLI's active account (task 71).

```bash
GH_TOKEN="$(gh auth token --user <repo-owner>)" gh pr create --base main --head 74_light_3d_garments_realistically --title "74_light_3d_garments_realistically Light 3D garments with an environment and the room's brightness" --body-file <file>
```
**Why:** opens the PR as the repo owner. `<file>` is a placeholder for a Markdown description file.

```bash
GH_TOKEN="$(gh auth token --user <repo-owner>)" gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes (after the CI check has registered for the new commit).

## Gotchas

- **Physically based materials need surroundings.** Without an environment, fabric (and anything metallic) looks flat or dark; `RoomEnvironment` is a free, built-in fix.
- **Optional extras must fail soft, but stay visible to tests.** A nice-to-have (soft lighting) must never take down the whole feature: catch, warn, and carry on. A test then has to watch for the warning, or the failure becomes invisible.
- **A mutation must compile.** If the planted change breaks the build, no test runs, and an empty result proves nothing.
- **Free what you make:** `PMREMGenerator` and the room scene can be freed right after generating; the environment texture lives until the scene is disposed.
- **Measure brightness cheaply:** a 16×16 copy every 15 frames is enough for an average, with `willReadFrequently` for fast reads.
- **Limit and ease anything driven by the camera:** a covered lens or a bright window must not make the garment vanish or flash.
- **Not tested here:** how good it *looks*. Lighting values (`LIGHTING`, `NEUTRAL_LUMINANCE`) are reasonable defaults that the developer can tune by eye.
