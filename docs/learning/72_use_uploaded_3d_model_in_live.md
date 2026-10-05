# 72 Use uploaded 3D model in Live 3D

**Branch:** `72_use_uploaded_3d_model_in_live` (starts from `main`)
**Goal:** when a garment has an uploaded rigged `.glb` (task 67), Live 3D draws that model instead of the built-in template, and fits its Mixamo skeleton to the tracked body every frame. If the model can't be loaded or used, Live 3D falls back to the template. The security policy allows the model's download.
- Split from task 67 by the developer on 2026-10-02.
- No new packages: three.js already includes `GLTFLoader` (`three/addons/loaders/GLTFLoader.js`).

## 1. Branch and setup

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #71 (task 71).

```bash
git checkout -b 72_use_uploaded_3d_model_in_live
```
**Why:** new task, new branch.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 (`.nvmrc`) in a shell where `fnm` isn't on the PATH.

## 2. Before writing code: what had to be true

```bash
sed -n 1,140p app/tryon/live/garmentPose.ts
```
**Why:** the pose a model must follow. For each of our 10 bones it gives a start point, an angle (0 = up the screen, counter-clockwise) and a length in preview pixels, plus the shoulder width (`scale`), the torso's `turn`, and `legsInView`. The person's left arm is on the screen's left in the mirrored preview.

```bash
ls node_modules/three/examples/jsm/loaders/GLTFLoader.js node_modules/three/examples/jsm/utils/SkeletonUtils.js; grep -n "createImageBitmap\|ImageBitmapLoader" node_modules/three/examples/jsm/loaders/GLTFLoader.js | head -5
```
**Why:** checks that `GLTFLoader` ships with three 0.186, and how it loads textures: with `ImageBitmapLoader`, which **fetches** them. That matters for the security policy (section 4).
- `SkeletonUtils.retarget` copies one skeleton's animation onto another. Our source is a 2D pose, not a skeleton, so a small aiming method fits better (section 3).

```bash
for u in "https://res.cloudinary.com/demo/image/upload/sample.jpg" "https://res.cloudinary.com/demo/raw/upload/sample.json" "https://res.cloudinary.com/demo/raw/upload/v1/sample_spreadsheet.xls"; do curl -s -o /dev/null -D - -H "Origin: https://mirror.example" "$u" --max-time 20 | grep -iE "^HTTP|access-control-allow-origin|content-type"; done
```
**Why:** checks **CORS** on Cloudinary's public demo account, so no upload to ours was needed. The browser may only fetch a model from another site if that site allows it. Cloudinary's raw files send `access-control-allow-origin: *`, even on a 404.

```bash
grep -n "CLOUDINARY\|env:" .github/workflows/ci.yml; docker --version
```
**Why:** CI sets **no** `CLOUDINARY_CLOUD_NAME` (section 5 handles that). Docker isn't installed on this Mac, so the database-backed browser test can only run in CI, like the other seeded specs.

## 3. How it works

- **`garmentPose.ts`:** the pose gets **`mirrored`**. A model faces the camera, so in a mirrored preview its **right** side follows the person's left. That keeps prints readable, like the templates.
- **`app/tryon/live/garmentModel.ts`** (new):
  - `loadGarmentModel(url, kind)` loads the `.glb` with `GLTFLoader` (imported only when a model is used) and calls `fitGarmentModel(scene, kind)`.
  - `fitGarmentModel` finds the skinned meshes (`frustumCulled = false`) and the bones by name (task 65's `normalizeBoneName`). It refuses a model without a rigged mesh, or without the bones its kind needs (`REQUIRED_BONES` from task 67).
  - It returns a **`LiveGarment`**: `{ object, pose(pose), dispose() }`. The template now gets the same shape in `LiveTryOn`, so the frame loop doesn't care which one it has.
- **Every frame (`pose`):**
  1. **Back to the rest pose** (each bone's rest rotation and scale), so nothing drifts.
  2. **Size:** scale = the person's shoulder width ÷ the model's (`LeftArm` to `RightArm`). A model without arms (trousers) uses hip width instead.
  3. **Turn and place:** `rotation.y = turn`, then move so the model's hips (between its thighs, else its `Hips` bone) sit on the person's hips, with screen y flipped to scene y.
  4. **Aim:** the torso first (from `Spine` to between the shoulders), then upper arms, forearms, thighs and shins. Each bone is turned by the **shortest rotation** that points the line from it to its child (`LeftArm` → `LeftForeArm`, and so on) in the person's direction. Because this uses **world positions**, the axes the artist gave the bones don't matter.
  5. **Legs shrink away** (scale 0.0001) when the hips aren't in view, like the templates' legs.
- `dispose()` frees every geometry, material, texture and skeleton, and takes the model out of the scene.
- **`LiveTryOn.tsx`:**
  - It loads the model **at the same time** as the tracker and the photo's look. If the model fails, it logs "The garment's 3D model couldn't be used; showing the built-in shape." and uses the template. Live 3D keeps working.
  - A model that finishes loading after Live 3D was closed is freed. So is one that arrives **after the tracker or the photo's look failed**: those fail `Promise.all` straight away, so the model load runs on its own and is freed if it's no longer needed (found by the rules-reviewer).
  - The canvas says which garment it draws: `data-garment="model"` or `"template"`, for tests and debugging. It's cleared when Live 3D closes or the product changes, so it never shows the previous garment.
  - `product.modelUrl` is in the effect's dependencies (lint caught it), so a different model reloads.
- **`app/tryon/page.tsx` → `TryOnStudio` → `LiveTryOn`:** each garment's `modelUrl` (or `null`) reaches the browser. Prices and links still don't.

## 4. The security policy (`lib/csp.ts`, `next.config.ts`)

- **`cloudinaryModelSource(cloudName)`** adds `https://res.cloudinary.com/<cloud>/raw/upload/`. A source ending in `/` matches that path and below, so **only our account's raw files** are allowed, not all of Cloudinary. Missing or placeholder cloud names add nothing. `next.config.ts` passes `CLOUDINARY_CLOUD_NAME`.
- **`blob:`** is now allowed for connections. `GLTFLoader` unpacks a model's **embedded textures** into `blob:` URLs and fetches them; without `blob:`, the policy blocked the texture. Blob URLs are made by the page itself from data it already has, so this reaches no other server. `data:` stays blocked (task 67 refuses `data:` links in models anyway).
- **Found in a real browser**, with a temporary page (`app/zz-live-harness/`) that rendered Live 3D with a model URL, and a temporary spec that served the generated model (with a texture) for it. Both were deleted afterwards:

```bash
npx playwright test e2e/zz-live-model.spec.ts --reporter=list
```
**Why:** first run: `data-garment = model` (the model itself loaded), but `Connecting to 'blob:…' violates … connect-src` and `THREE.GLTFLoader: Couldn't load texture`. After adding `blob:`: the model loaded, with no blocks and no texture errors. Tracking still ran ("Step back…").

```bash
rm -r app/zz-live-harness && rm e2e/zz-live-model.spec.ts
```
**Why:** deletes the temporary page and spec.

```bash
npm run typecheck
```
**Why:** after deleting the temporary page, plain `tsc` still saw it in Next's generated route types (`.next/types/validator.ts`). `next typegen` (part of this script) regenerates them.

## 5. The test model and the CI browser test

- **`scripts/rigged-glb.ts`** builds a **real `.glb`** at test time, rather than committing a binary file. It's a box "shirt" skinned to the same Mixamo-style T-pose (19 bones, `mixamorig:` names, inverse bind matrices), with an optional embedded 1×1 PNG texture.
- **Gotcha found by its test:** three.js's `GLTFLoader` **removes `:` from node names** (it's reserved in animation paths), so `mixamorig:LeftArm` arrives as `mixamorigLeftArm`. `normalizeBoneName` (task 65) already accepts the prefix without a separator.
- **`scripts/e2e-db.ts`** seeds **"E2E 3D Shirt"** with `modelUrl` = a raw file URL in Cloudinary's `demo` account. Its `createdAt` is 2020, so pages that open the newest garment still pick the same one as before.
- **`playwright.config.ts`:** with the test database, the app is also built with `CLOUDINARY_CLOUD_NAME=demo`. The seeded garments live in that account, so the policy and `next/image` allow them, and CI's workflow needs no change.
- **`e2e/tryon-live.spec.ts`**, new test (seeded database only, so CI): it serves the generated model with its texture for the seeded URL, opens Live 3D for the 3D shirt, and expects:
  - `canvas[data-garment="model"]`;
  - "Step back…";
  - the model fetched once;
  - no blocked connections apart from MediaPipe's metrics.
- **What the browser test can't show, and where that's covered instead.** The row's Tests column (written when the task was split) says "a fixture model follows the fake camera view". But Chromium's fake camera shows a test pattern with **no person**, so the model stays hidden and can't follow anything there.
  - The browser test proves everything up to that point: download past the policy, the texture via `blob:`, parsing, fitting (`"model"`, not the fallback), and tracking running.
  - **Following** is proven by `garmentModel.test.ts` (joint directions on a synthetic Mixamo model) and by `scripts/rigged-glb.test.ts` (the same fixture through the **real** `GLTFLoader`, then posed).
  - A browser test of real following would need a fake camera video **of a person** (Chromium's `--use-file-for-fake-video-capture`), which is the developer's call (found by the rules-reviewer).

## 6. Tests

- **`app/tryon/live/garmentModel.test.ts`** (a synthetic Mixamo model built in three.js, with real skinned-mesh bones):
  - finds the bones (with the prefix), and keeps the mesh drawn;
  - puts the hips on the person's hips and sizes by shoulder width;
  - points torso, upper arms and forearms, and thighs and shins;
  - the mirror swap;
  - the turn's direction;
  - legs shrink when seated and come back;
  - **no drift**, over a non-retracing cycle of poses (see the mutation note below);
  - works with odd bone axes and centimetre rigs;
  - trousers are sized by hips;
  - refuses unrigged models or missing bones;
  - `dispose`;
  - `loadGarmentModel` with an injected loader, and a load failure passed on.
- **`scripts/rigged-glb.test.ts`:** the fixture passes **the real upload check** (task 67) for all three kinds, with and without a texture. It loads with **the real `GLTFLoader`** and is posed correctly: the whole pipeline on real bytes.
- **`app/tryon/live/LiveTryOn.test.tsx`:** the model is drawn and posed (`data-garment="model"`); it falls back to the template with a warning (`"template"`, no alert); without a model nothing is loaded; the model is freed on close, after a late load, and **after a failed start**; `data-garment` is cleared for a new product.
- **`app/tryon/live/garmentPose.test.ts`:** `mirrored` passes through.
- **`lib/csp.test.ts` and `next.config.test.ts`:** our raw folder only, never all of Cloudinary; no source for missing or placeholder names; `blob:` but never `data:`; `CLOUDINARY_CLOUD_NAME` reaches the header.
- **`scripts/e2e-db.test.ts`, `app/tryon/page.test.tsx`, `TryOnStudio.test.tsx`:** the seeded 3D shirt; `modelUrl` passed to the browser and on to Live 3D.

```bash
npx vitest run app/tryon/live/garmentModel.test.ts scripts/rigged-glb.test.ts app/tryon/live/LiveTryOn.test.tsx lib/csp.test.ts next.config.test.ts scripts/e2e-db.test.ts
```
**Why:** this task's main unit tests while building.
- **First runs:**
  - one failure was my own wrong expectation: a centimetre rig's armature scale cancels out, so the model's scale is the same;
  - the fixture test first looked a bone up with the `:` (the GLTFLoader gotcha above).

```bash
npx eslint app/tryon/live
```
**Why:** caught `product.modelUrl` missing from the effect's dependency list.

```bash
mutate() { cp "$1" <scratch>/mutant.bak && sed -i '' "$2" "$1" && npx vitest run "$3"; cp <scratch>/mutant.bak "$1"; }
```
**Why:** the mutation helper from task 67: plant a bug, run the tests, restore the file.

```bash
mutate app/tryon/live/garmentModel.ts 's/        aim(side(limb.bone), () => at(side(limb.tip)), pose.bones\[limb.follows\].angle);/        void limb;/' app/tryon/live/garmentModel.test.ts
```
**Why:** mutation 1, limbs not aimed: 3 tests fail.

```bash
mutate app/tryon/live/garmentModel.ts 's/        const side = (name: string) => (pose.mirrored ? otherSide(name) : name);/        const side = (name: string) => name;/' app/tryon/live/garmentModel.test.ts
```
**Why:** mutation 2, no mirror swap: the mirror test fails.

```bash
mutate app/tryon/live/garmentModel.ts 's/        r.bone.quaternion.copy(r.quaternion);/        void r;/' app/tryon/live/garmentModel.test.ts
```
**Why:** mutation 3, no reset to the rest pose. **It survived twice before it was caught:**
1. The first test went A → B → A and compared positions. Aiming is absolute, and going straight back undoes each shortest rotation exactly (they're inverses).
2. The second compared rotations, still over A → B → A: the same reason.
3. **Caught** with a cycle that doesn't retrace itself (A → B → C → A), different torso turns, and arms resting a little forward: the hand drifts by 0.2 px per cycle, and its rotation changes.

```bash
mutate app/tryon/live/garmentModel.ts 's/      root.rotation.set(0, pose.turn, 0);/      root.rotation.set(0, 0, 0);/' app/tryon/live/garmentModel.test.ts
```
**Why:** mutation 4, no turn: the turn test fails.

```bash
mutate app/tryon/live/garmentModel.ts 's/        for (const name of \["LeftUpLeg", "RightUpLeg"\]) bone(name)?.scale.setScalar(HIDDEN_SCALE);/        void HIDDEN_SCALE;/' app/tryon/live/garmentModel.test.ts
```
**Why:** mutation 5, legs not hidden: the seated test fails.

```bash
mutate app/tryon/live/LiveTryOn.tsx '/showing the built-in shape/{n;s/    return null;/    throw modelError;/;}' app/tryon/live/LiveTryOn.test.tsx
```
**Why:** mutation 6, no fallback (a model failure stops Live 3D): the fallback test fails.
- A first, badly written version of this mutation (an odd `.catch … && null`) isn't a real check, so it's not counted.

```bash
mutate lib/csp.ts '/^    "blob:",$/d' lib/csp.test.ts
```
**Why:** mutation 7, no `blob:`: 4 policy tests fail.

```bash
mutate app/tryon/live/LiveTryOn.tsx '/            void modelLoad.then((late) => late?.dispose());/d' app/tryon/live/LiveTryOn.test.tsx
```
**Why:** mutation 8, a model arriving after a failed start isn't freed: "frees a model that finishes loading after the tracker failed" fails.

```bash
mutate app/tryon/live/LiveTryOn.tsx '/      setGarmentSource(null); \/\/ a new product shows no stale/d' app/tryon/live/LiveTryOn.test.tsx
```
**Why:** mutation 9, `data-garment` not cleared: "forgets which garment it drew when it closes" fails. Every file was restored afterwards.

```bash
npx playwright test e2e/tryon-live.spec.ts --reporter=list
```
**Why:** locally: `2 passed, 1 skipped` (the new model test needs the seeded database, so it runs in CI). The existing Live 3D tests pass with the new policy.

```bash
npm run build && { npm run lint; echo "lint exit code: $?"; }
```
**Why:** build, then lint after it (task 64's ESLint ignore for the copied MediaPipe files): `lint exit code: 0`.

```bash
npm run typecheck && npm test
```
**Why:** `Test Files 63 passed`, `Tests 826 passed` (31 new: 29 at first, plus the two tests added after the review).

```bash
npm run test:e2e > <scratch>/e2e.log 2>&1; grep -E '__clerk_(db_jwt|testing_token)=' <scratch>/e2e.log | grep -cv '=<redacted>'
```
**Why:** the whole E2E suite: `31 passed, 12 skipped` (the skipped specs need CI's seeded database), with `0` unredacted tokens (task 71).

```bash
bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the git-safety hook's tests: `Failures: 0`.

## 7. Commit, publish, PR, auto-merge

```bash
git add app/tryon/live/garmentModel.ts app/tryon/live/garmentModel.test.ts app/tryon/live/garmentPose.ts app/tryon/live/garmentPose.test.ts app/tryon/live/LiveTryOn.tsx app/tryon/live/LiveTryOn.test.tsx app/tryon/TryOnStudio.tsx app/tryon/TryOnStudio.test.tsx app/tryon/page.tsx app/tryon/page.test.tsx lib/csp.ts lib/csp.test.ts next.config.ts next.config.test.ts playwright.config.ts scripts/rigged-glb.ts scripts/rigged-glb.test.ts scripts/e2e-db.ts scripts/e2e-db.test.ts e2e/tryon-live.spec.ts docs/task-list.md docs/learning/72_use_uploaded_3d_model_in_live.md
```
**Why:** stages this task's files.

```bash
git commit -m "72_use_uploaded_3d_model_in_live Use a garment's uploaded 3D model in Live 3D"
```
**Why:** saves the snapshot.

```bash
git -c credential.helper= -c credential.helper='!f() { test "$1" = get || exit 0; echo username=<repo-owner>; echo "password=$(gh auth token --user <repo-owner>)"; }; f' push -u origin 72_use_uploaded_3d_model_in_live
```
**Why:** publishes the branch with the repo owner's stored login, without switching the GitHub CLI's active account (see task 71). The token goes straight to git and is never printed.

```bash
GH_TOKEN="$(gh auth token --user <repo-owner>)" gh pr create --base main --head 72_use_uploaded_3d_model_in_live --title "72_use_uploaded_3d_model_in_live Use a garment's uploaded 3D model in Live 3D" --body-file <file>
```
**Why:** opens the PR as the repo owner. `<file>` is a placeholder for a Markdown description file.

```bash
GH_TOKEN="$(gh auth token --user <repo-owner>)" gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes. Run it once CI's check has registered for the new commit: too early, GitHub answers "Required status check … is expected".

## Gotchas

- **Check the risky assumptions before building on them:** CORS with `curl` on a public account, and the policy with a temporary page in a real browser. The `blob:` block only showed up there.
- **`GLTFLoader` sanitizes node names** (`:` removed). Match bone names with and without Mixamo's separator.
- **Aim with world positions, not bone axes.** Rigs give bones arbitrary local axes; the line from a bone to its child is what matters.
- **A drift test that retraces its steps can't fail.** Shortest rotations undo each other, so use a cycle (A → B → C → A) with out-of-plane motion. The mutation check showed this.
- **A model faces the camera.** In a mirrored view, its right side follows the person's left (or prints would read backwards).
- **Fall back, don't fail:** a broken model must never stop Live 3D. The template is always there.
- **Seeded test data can change what other specs see** (`/tryon` opens the newest garment). Date the new row in the past.
- **`Promise.all` fails fast.** Anything else still loading in it keeps going and must be cleaned up when it lands.
- **Keep test titles true.** When a rule widens (the policy now allows `blob:` and our models), update the names that describe it too.
