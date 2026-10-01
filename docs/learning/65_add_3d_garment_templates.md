# 65 Add 3D garment templates

**Branch:** `65_add_3d_garment_templates` (starts from `main`)
**Goal:** the 3D garments for Live 3D try-on. There's a built-in template, with bones, for **Top**, **Bottom** and **Dress**, coloured and printed from the product photo, and posed from the body pose of task 64.
- Showing them on the camera is task 66.
- Package: **`three@0.186.1`** (+ **`@types/three@0.186.0`**, dev), approved by the developer on 2026-09-30.
- This branch also adds **rows 68–71** to the task list: the developer said "yes" on 2026-10-01 to all four suggested follow-ups (image size check, camera unplugged, studio test reliability, quieter Clerk test logs).

## 1. Branch and install

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #64 (task 64).

```bash
git checkout -b 65_add_3d_garment_templates
```
**Why:** new task, new branch.

```bash
npm install three@0.186.1 && npm install -D @types/three@0.186.0
```
**Why:** adds three.js (3D in the browser) and its TypeScript types (dev only). `npm audit` still shows only the accepted Prisma finding. three's extras are imported from `three/addons/…`, here `BufferGeometryUtils` for merging parts.

## 2. How it works

Four new modules in `app/tryon/live/`:

- **`skeleton.ts`:** the 10 bones, with **Mixamo-style names**: `Spine` (hips → shoulders), `Hips` (hips → knees, for a skirt), `LeftArm`/`RightArm`, `LeftForeArm`/`RightForeArm`, `LeftUpLeg`/`RightUpLeg`, `LeftLeg`/`RightLeg`.
  - `normalizeBoneName` strips Mixamo's prefix (`mixamorig:`, `mixamorig_`, `mixamorig`), so a garment rigged to a Mixamo skeleton in Blender (task 67) can be **matched** bone by bone.
  - Matching names isn't enough to pose it: Mixamo nests its bones, doesn't rest at the origin, and its `Hips` is the pelvis pointing up. **Task 67 needs to retarget** (found in review).
- **`garmentPose.ts`** (pure math): `toGarmentPose(bodyPose)` gives each bone its start point (preview pixels), angle and length.
  - `segmentAngle(from, to)` converts screen directions (y grows **down**) into the 3D scene's convention (y grows **up**; 0 = up, positive = counter-clockwise).
  - `segmentEnd` is its inverse.
  - **Out of view:**
    - an arm whose elbow isn't visible **hangs down along the body**, at an average length (0.75 shoulder widths for the upper arm, 0.7 for the forearm);
    - **a thigh whose knee is below the frame hangs down the same way**, as long as the hips are in view, so a webcam framing (hips in, knees out) still shows trouser legs. The first version hid the whole leg (found in review);
    - **with the hips estimated** (seated), `legsInView` is false, and legs and skirt are left out.
  - `scale` is the shoulder width (pixels per template unit).
  - **`turn`** is the torso's turn **in the scene's convention**: it's the body's yaw, **flipped for a mirrored preview**.
    - The first version passed the yaw straight through, so in the mirrored preview **the shirt turned the opposite way to the person** (found in review).
    - That's because a positive yaw means the person's left shoulder is farther away, and in the mirror that shoulder is on the screen's left; three.js's `rotation.y > 0` brings the screen-left side *towards* the camera.
- **`garmentLook.ts`:** the product photo becomes a colour and a print.
  - `garmentMask` **flood-fills from the image's border** over pixels close to the border's colour. That finds the plain background but **keeps a white logo inside the garment**, because the logo isn't connected to the border. Transparent pixels count as background.
  - `borderColor` **skips transparent pixels**, which a canvas reads back as black. On a **cut-out** (a border **at least half transparent**) it returns `null`: there's no background colour, so **only transparency counts as background**, and the colour fallback skips transparent pixels too.
    - Found in two review rounds: first, black garments on transparent PNGs were erased.
    - Then my fix ("assume white") erased **white and cream** ones instead.
    - Now all four (white, cream, light grey, black) keep their pixels and real colour.
    - **A cut-out is any image whose border is at least half transparent.** Then the garment can also touch the edges, as product cut-outs that fill the frame do: its own pixels on the border are no longer taken for the background colour. That flaw dated from the first version (found in review).
  - `dominantColor` is the garment's average colour. For a white shirt on white, where nothing stands out, it uses the whole image's colour.
  - `printPixels` keeps the garment's pixels, with the background replaced by the garment colour, so edges and corners look plain.
  - `loadGarmentLook(url)` is the browser-only part: it loads the photo (`crossOrigin = "anonymous"`, shrunk to 512 px), reads its pixels, and returns `{ color, print }`. **It never throws:** if the photo can't be read, it returns a neutral grey with no print, so the garment still shows.
- **`garmentTemplates.ts`** (three.js):
  - **The rig:** every bone **rests at the origin pointing up**, so its bind matrix is the identity. Each part's vertices are written **in its own bone's space**, from y = 0 (the segment's start) to its rest length.
    - Posing a bone then moves, turns and stretches its part **rigidly**. That's simple and robust, and there's no blending between bones.
    - Parts overlap a little at joints to hide gaps.
  - **Units:** one template unit = one shoulder width.
  - **The templates** (`TEMPLATES`), made of open oval tubes (`CylinderGeometry`, flattened front-to-back):
    - **UPPER:** the body (slightly above the shoulder line for the neckline) and two short sleeves;
    - **LOWER:** a waistband, thighs and shins;
    - **OVERALL:** a sleeveless body and a flared skirt down to the knees.
  - **Materials:** a printed material (the photo as a texture) on the **body** tube. Its UVs project the photo's middle 60% (the shirt's body rather than its sleeves) from the front; the sides and back get the same projection, facing away from the camera. Everything else uses a plain material in the garment's colour, through one geometry group per part. With no print, all parts are plain.
  - `buildGarment(kind, { color, print })` returns a `SkinnedMesh` with the 10 named bones (`frustumCulled = false`, because a skinned mesh's bounds don't follow its bones), and a `dispose()` that frees the geometry, both materials **and the skeleton**. The renderer gives every skinned mesh a GPU bone texture that only `Skeleton.dispose()` frees; the first version leaked it (found in review).
  - **`applyGarmentPose(garment, pose)`:**
    - each bone goes to its start point, with **y flipped** (screen → scene);
    - `rotation.z` is the angle; the `Spine` also gets `rotation.y` = turn (Euler order `ZYX`: turn first, then the screen angle);
    - the scale is (shoulder width, length ÷ rest length, shoulder width);
    - **with the hips out of view (seated), legs and skirt shrink to nothing** (`HIDE_WHEN_UNSEEN`, when `legsInView` is false). Arms always keep their sleeves.
  - **Normals:** stretching a bone unevenly skews the lighting slightly, because three.js skins normals with the same matrix. That's acceptable for these shapes.

## 3. Tests

- **`skeleton.test.ts`:** the bone names; Mixamo prefixes read correctly; other bones (`Head`, `Spine2`) aren't ours.
- **`garmentPose.test.ts`:**
  - the cardinal directions of `segmentAngle`, and `segmentEnd` undoing it;
  - torso, arms, forearms and legs from a standing person;
  - an unseen elbow hangs down at the average length, and the forearm starts where it ends;
  - **a knee below the frame makes the thigh hang down**, with `legsInView` still true;
  - seated (hips estimated) gives `legsInView: false`;
  - **`turn` is the yaw flipped when mirrored**, and not flipped otherwise.
- **`garmentLook.test.ts`** (hand-made 7×7 images):
  - the border colour;
  - the mask keeps the block and **the white logo inside it**;
  - transparent pixels are background;
  - the average colour, and the white-on-white fallback;
  - `toHex` rounding and clamping;
  - the print;
  - **cut-out PNGs:** an all-transparent border gives no background colour; **the whole-image fallback keeps a real colour** (blue on blue stays blue); **white, cream, light grey and black** garments keep all their pixels and their real colour; **garments touching the edges** (trousers to the bottom, a tee filling the width with a logo) are kept whole; a border that's only a little transparent still gives its colour; the whole-image fallback isn't darkened by transparency;
  - `loadGarmentLook`'s **normal path**, with jsdom's missing parts faked (decode, natural size, a 2D canvas holding the 7×7 shirt): the colour, the print canvas, and the shrunk draw (found in review);
  - `loadGarmentLook` falls back to grey with no print in jsdom, which can't decode images or draw, like a browser that blocks reading the photo.
- **`garmentTemplates.test.ts`** (three.js runs without a GPU, so these check **real skinned vertex positions** with `SkinnedMesh.applyBoneTransform`):
  - the 10 bones and both materials;
  - each kind uses only its own bones, with the print only on the body;
  - no print means all plain;
  - `dispose`, **including the skeleton**;
  - posing sets position (y flipped), angle, stretch, thickness and the torso's turn;
  - **the turn's direction, with a real skinned vertex:** with the person's left shoulder farther away, the body's front center moves to the screen's **left** when mirrored, and to the **right** when not;
  - a thigh stays (hanging) with the knee below the frame;
  - **the sleeve's end lands on the shoulder → elbow line**;
  - the body's top lands just above the shoulder line;
  - seated trousers' legs collapse, while sleeves stay.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx tsc --noEmit -p .
```
**Why:** a typecheck while building. It caught `new ImageData(printPixels(...))`: newer type definitions make typed arrays generic, and `ImageData` needs one backed by a plain `ArrayBuffer`. The fix was `printPixels(...): Uint8ClampedArray<ArrayBuffer>`.

```bash
npx vitest run app/tryon/live
```
**Why:** all Live 3D unit tests: `6 passed` files. That was `66 passed` in the first version, and `79 passed` after the review fixes.
- The first run had 5 failures, all in the tests:
  - **sorting:** a helper compared bone lists in two different orders;
  - **the body's top:** the test looked for vertices at the rest length (1.35), but the tube reaches 1.4 (the neckline), so it averaged nothing. It now checks the real top;
  - **`image.decode`:** jsdom has no `image.decode` to spy on. Calling it throws, which is exactly the fallback path, so the spy was removed.

```bash
cp app/tryon/live/garmentTemplates.ts <scratch>/templates.bak && sed -i '' 's/bone.position.set(target.x, -target.y, 0);/bone.position.set(target.x, target.y, 0);/' app/tryon/live/garmentTemplates.ts && npx vitest run app/tryon/live/garmentTemplates.test.ts; cp <scratch>/templates.bak app/tryon/live/garmentTemplates.ts
```
**Why:** a mutation check. It drops the screen → scene y flip, and 3 posing tests fail (the skinned-vertex checks among them). Then the file is restored. `<scratch>` is any temporary folder.

```bash
cp app/tryon/live/garmentPose.ts <scratch>/pose.bak && sed -i '' 's/turn: pose.mirrored ? -pose.yaw : pose.yaw,/turn: pose.yaw,/' app/tryon/live/garmentPose.ts && npx vitest run app/tryon/live; cp <scratch>/pose.bak app/tryon/live/garmentPose.ts
```
**Why:** mutation check 2. It puts back the first version's turn (no flip for the mirror), and both direction tests fail, including the skinned-vertex one. Then the file is restored.

```bash
cp app/tryon/live/garmentTemplates.ts <scratch>/templates.bak && sed -i '' '/mesh.skeleton.dispose();/d' app/tryon/live/garmentTemplates.ts && npx vitest run app/tryon/live/garmentTemplates.test.ts; cp <scratch>/templates.bak app/tryon/live/garmentTemplates.ts
```
**Why:** mutation check 3. Without the skeleton disposal, the dispose test fails. Then the file is restored. Each check makes its own backup, so it works on its own.

```bash
cp app/tryon/live/garmentLook.ts <scratch>/look.bak && sed -i '' 's/: b \/ opaque } : null;/: b \/ opaque } : { r: 255, g: 255, b: 255 };/' app/tryon/live/garmentLook.ts && npx vitest run app/tryon/live/garmentLook.test.ts; cp <scratch>/look.bak app/tryon/live/garmentLook.ts
```
**Why:** mutation check 4. It makes `borderColor` assume a white background for cut-outs again (the version review round 2 caught), changing only its return line. **4 tests fail**: no `null`, white erased, cream erased, and the edge-touching garment erased. Then the file is restored.
- The first version of this command matched an older line, and after the cut-out change it silently mutated `dominantColor` instead. It's now anchored to `borderColor`'s unique `b / opaque` (found in review).

```bash
cp app/tryon/live/garmentLook.ts <scratch>/look2.bak && sed -i '' 's/  return opaque > 0 \&\& opaque \* 2 > total ? /  return opaque > 0 ? /' app/tryon/live/garmentLook.ts && npx vitest run app/tryon/live/garmentLook.test.ts; cp <scratch>/look2.bak app/tryon/live/garmentLook.ts
```
**Why:** mutation check 5. It drops the "at least half transparent" rule, and the edge-touching test fails. Then the file is restored.

```bash
npm run build && npm run lint; echo "lint exit code: $?"
```
**Why:** lint **after** a build, which copies MediaPipe's JS into `public/` (task 64's ESLint ignore): `lint exit code: 0`.

```bash
npm test
```
**Why:** runs the whole suite: `Test Files 57 passed`, `Tests 646 passed` (49 new, after the review fixes).

```bash
npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist, and all of it passes. E2E: `26 passed, 11 skipped`. Nothing shows the templates on a page yet; that's task 66, with its own E2E tests.

## 4. Commit, publish, PR, auto-merge

```bash
git add package.json package-lock.json app/tryon/live/skeleton.ts app/tryon/live/skeleton.test.ts app/tryon/live/garmentPose.ts app/tryon/live/garmentPose.test.ts app/tryon/live/garmentLook.ts app/tryon/live/garmentLook.test.ts app/tryon/live/garmentTemplates.ts app/tryon/live/garmentTemplates.test.ts docs/task-list.md docs/learning/65_add_3d_garment_templates.md
```
**Why:** stages this task's files.

```bash
git commit -m "65_add_3d_garment_templates Add rigged 3D garment templates for Live 3D"
```
**Why:** saves the snapshot.

```bash
git -c http.postBuffer=524288000 push -u origin 65_add_3d_garment_templates
```
**Why:** publishes the branch. The bigger HTTP buffer is what fixed task 64's "the remote end hung up unexpectedly", when that push carried the 5.8 MB model. It's harmless for small pushes.

```bash
gh pr create --base main --head 65_add_3d_garment_templates --title "65_add_3d_garment_templates Add rigged 3D garment templates for Live 3D" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Screen y grows down, the 3D scene's y grows up.** Convert once, in one place (`segmentAngle`, and the `-y` when posing), and test it with a mutation.
- **A rig with identity bind poses** makes rigid, per-bone parts easy, but blending a vertex between two bones would then mix unrelated spaces. Overlap the parts instead.
- **Skinned meshes need `frustumCulled = false`** (or updated bounds), or they can vanish while posed.
- **Flood-fill the background from the border,** rather than "remove everything white", or white details on the garment disappear.
- **Newer TypeScript typed arrays are generic:** `ImageData` wants `Uint8ClampedArray<ArrayBuffer>`.
- **Known limit:** a cut-out that covers *more* than half the border (touching all four edges, with only the corners transparent) still counts as having a background colour. It loses its print but keeps its colour (found in review).
- **Mutation commands must be anchored to unique text.** After a refactor, a loose `sed` pattern can silently hit a different line and "pass". Check the diff each time.
- **jsdom has no `image.decode` and no 2D canvas.** Test the pixel math as pure functions. For the browser loader, fake those parts (`Object.defineProperty` for `decode`, a fake context) to test its normal path too.
- **Mirrored previews flip rotations too, not just x.** Test the *direction* of a turn with a real vertex, not only that a value was passed along.
- **`dispose()` for a SkinnedMesh must include `skeleton.dispose()`.**
- **For task 66:** the print's `CanvasTexture` needs `colorSpace = SRGBColorSpace`, or its colours look washed out.
- **Big files over HTTPS:** task 64's model upload failed with "the remote end hung up unexpectedly" until Git's `http.postBuffer` was raised for that command (section 4).
