# 73 Fit uploaded models to the body

**Branch:** `73_fit_uploaded_models_to_body` (starts from `main`)
**Goal:** an uploaded 3D garment should cover the person's own clothes and match their body length.
- Testing a real Mixamo sweater (Mixamo's `Ch31` character, converted with Blender) on the developer's camera showed it **didn't cover their clothes**: too slim, wrong length.
- Chosen by the developer on 2026-10-05. Rows 73 and 74 (realistic lighting) were added in this branch.
- No new packages.

## 1. Branch and setup

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #72 (task 72).

```bash
git checkout -b 73_fit_uploaded_models_to_body
```
**Why:** new task, new branch.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 (`.nvmrc`) in a shell where `fnm` isn't on the PATH.

## 2. Why it didn't cover the clothes

- **One number sized it:** the model was scaled so its shoulder joints matched the person's. But MediaPipe's shoulder points are **joint centres**, inside the body's outline, and clothes are looser than the body anyway. So the garment came out narrower than the person.
- **The length was the character's, not the person's:** a uniform scale keeps the model's own torso proportions, which rarely match the wearer's.

## 3. The fix (`app/tryon/live/garmentModel.ts`)

- **`EASE = 1.12`:** the width (and depth) is the person's shoulder width × 1.12 (hip width for trousers), so the garment is a little looser than the joints and covers the person's clothes.
- **Torso length:** the height is set so the model's torso (between its thighs to between its shoulders, measured at rest) matches the person's (`pose.bones.Spine.length`, their hips to shoulders). This only happens when:
  - **the hips are really in view** (`legsInView`). Close up or seated, the hips are estimated from the shoulders, so the garment keeps its own proportions;
  - **the model has a torso** (arms). Trousers keep their proportions.
- **`TORSO_STRETCH = { min: 0.75, max: 1.4 }`:** the height may differ from the width by at most this much, so noisy tracking can't make it absurdly long or short.
- **Aiming in the model's own space:**
  - With an uneven scale (height ≠ width), world angles are bent by the stretch, so turning bones by world directions would point sleeves slightly wrong.
  - `aim()` therefore works in the root's **local, unscaled, unturned** space: the bone and its child's positions via `root.worldToLocal`, and the wanted screen direction with the root's turn undone, then divided by its scale.
  - Rotations are combined below the root (`rotationInModel`), not decomposed from world matrices, which would be skewed by the stretch.

## 4. Tests

- **`app/tryon/live/garmentModel.test.ts`**, new "fitting the body (task 73)" group:
  - shoulders end up 200 px × ease apart, and depth matches width;
  - with the hips in view, the model's hips-to-shoulders distance equals the person's (300 px);
  - close up (hips estimated), height = width;
  - the stretch is limited both ways;
  - **arms and torso still point exactly while stretched unevenly** (with odd bone axes and a turn).
  - The size expectations in the existing tests now include the ease.
- **`scripts/rigged-glb.test.ts`:** the real-`GLTFLoader` fixture's scale includes the ease.

```bash
npx vitest run app/tryon/live/garmentModel.test.ts scripts/rigged-glb.test.ts
```
**Why:** this task's tests: `23 passed`.
- The first run, before updating the tests, had 4 failures: only the old size expectations (622.2 = 555.6 × 1.12; 560 = 500 × 1.12). All the aiming tests already passed with the uneven scale.

```bash
mutate() { cp "$1" <scratch>/mutant.bak || return 1; sed -i '' "$2" "$1"
  if cmp -s "$1" <scratch>/mutant.bak; then echo "sed matched nothing!"; else npx vitest run ${=3}; fi
  cp <scratch>/mutant.bak "$1"; }
```
**Why:** the mutation helper exactly as run: plant a bug, run the tests, restore the file.
- **The `cmp` guard matters:** `sed -i` succeeds silently when its pattern matches nothing, and the tests then "pass" on the unchanged file. The guard prints `sed matched nothing!` instead.
- `${=3}` is zsh for splitting the test-files argument (task 69).

```bash
mutate app/tryon/live/garmentModel.ts 's/      const width = (personWidth \/ restWidth.size) \* EASE;/      const width = personWidth \/ restWidth.size;/' app/tryon/live/garmentModel.test.ts
```
**Why:** mutation 1, no ease: 4 tests fail.

```bash
mutate app/tryon/live/garmentModel.ts 's/      root.scale.set(width, height, width);/      root.scale.set(width, width, width);/' app/tryon/live/garmentModel.test.ts
```
**Why:** mutation 2, no torso matching: 3 tests fail.

```bash
mutate app/tryon/live/garmentModel.ts 's/THREE.MathUtils.clamp(torso \/ width, TORSO_STRETCH.min, TORSO_STRETCH.max)/(torso \/ width)/' app/tryon/live/garmentModel.test.ts
```
**Why:** mutation 3, no stretch limit: the limit test fails.

```bash
mutate app/tryon/live/garmentModel.ts 's/\.divide(root\.scale)\.normalize();/.normalize();/' app/tryon/live/garmentModel.test.ts
```
**Why:** mutation 4, aiming that ignores the stretch: 4 aiming tests fail, which proves the local-space aiming matters.
- My first try at this mutation had the wrong indentation in its pattern (6 spaces instead of 4), and the helper's `cmp` guard printed `sed matched nothing!`. **That isn't a pass**: I fixed the pattern and reran it.

```bash
mutate app/tryon/live/garmentModel.ts 's/      const torso = pose.legsInView \&\& restTorso > 0/      const torso = restTorso > 0/' app/tryon/live/garmentModel.test.ts
```
**Why:** mutation 5, matching the torso even when the hips are only estimated: the close-up test fails. Every file was restored afterwards.

```bash
npm run build && { npm run lint; echo "lint exit code: $?"; }
```
**Why:** build, then lint after it (task 64's ESLint ignore for the copied MediaPipe files): `lint exit code: 0`.

```bash
npm run typecheck && npm test
```
**Why:** `Test Files 63 passed`, `Tests 831 passed` (5 new).

```bash
npm run test:e2e > <scratch>/e2e.log 2>&1; grep -E '__clerk_(db_jwt|testing_token)=' <scratch>/e2e.log | grep -cv '=<redacted>'
```
**Why:** the whole E2E suite: `31 passed, 12 skipped` (the skipped specs need CI's seeded database), with `0` unredacted tokens (task 71).

```bash
bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the git-safety hook's tests: `Failures: 0`.

## 5. How the test garment was made (outside the repo)

- The sweater the developer tested came from a free Mixamo character (`Ch31_nonPBR.fbx`, downloaded by the developer as FBX Binary, T-pose, with skin).
- A Blender script, run in my scratch folder and **not committed**, kept only the garment. The commands:

```bash
brew install --cask blender
```
**Why:** installs Blender, a free 3D app (or download it from blender.org; the developer installed it one of these two ways). The script runs it without a window (`-b`).

```bash
mv ~/Downloads/Ch31_nonPBR.fbx ~/Desktop/Projects/
```
**Why:** macOS didn't let the editor's processes read `~/Downloads` (`Operation not permitted`), so the developer moved the file next to the project, outside the repo (with this command or by dragging it in Finder).

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b -P <scratch>/extract_garment.py -- ~/Desktop/Projects/Ch31_nonPBR.fbx
```
**Why:** list mode, showing the character's meshes, materials and bones. It had separate `Ch31_Sweater` and `Ch31_Collar` meshes, and its bones were named **`mixamorig9:`** (a numbered prefix, which the app doesn't accept yet).

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b -P <scratch>/extract_garment.py -- ~/Desktop/Projects/Ch31_nonPBR.fbx <scratch>/sweater.glb sweater collar && cp <scratch>/sweater.glb ~/Desktop/Projects/sweater.glb
```
**Why:** keeps the sweater and collar with the armature. It renames `mixamorigN:` to `mixamorig:` (Blender renames the matching vertex groups too), makes the material **matte fabric**, shrinks the textures to 1024 px, and exports an uncompressed `.glb`. The result is 558 KB and passes the upload check.
- The first export had **Metallic 0.5 and the Glossiness map wired as roughness**, from the FBX import. It rendered as dark shiny plastic, so the script now sets Metallic 0, Roughness 0.9 and Specular IOR Level 0.2, and disconnects those maps.

```bash
MODEL_GLB=<scratch>/sweater.glb npx vitest run scripts/zz-check-glb.test.ts; rm scripts/zz-check-glb.test.ts
```
**Why:** a temporary test, deleted right after, that ran the exported file through the real code before the developer uploaded it:
- `checkGarmentModel` passed for all three kinds;
- `GLTFLoader` loaded it (with `self` set to `globalThis`, since three's texture loaders expect a browser);
- `fitGarmentModel` posed it: the sleeves pointed as posed, the hips sat on the person's hips, and the shoulders were 200 px apart.
- Its first version only printed the numbers, which Vitest hides for passing tests, so it was rewritten with assertions.

- **The script** (`<scratch>/extract_garment.py`):

```python
"""Keeps only a garment from a Mixamo character and exports it as a .glb that Mirror AI accepts (task 67/72).

List the character's meshes and materials:
    blender -b -P extract_garment.py -- <character.fbx>
Keep the parts whose mesh or material name contains a keyword, then export:
    blender -b -P extract_garment.py -- <character.fbx> <out.glb> <keyword> [<keyword>...]

The export is glTF Binary with textures inside (no Draco, no external files), textures shrunk to <= 1024 px,
the Mixamo armature kept, with numbered prefixes ("mixamorig9:") renamed to "mixamorig:", and every material made matte fabric.
"""

import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if not args:
    sys.exit("usage: blender -b -P extract_garment.py -- <character.fbx> [<out.glb> <keyword>...]")
source = args[0]
output = args[1] if len(args) > 1 else None
keywords = [k.lower() for k in args[2:]]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=source)


def meshes():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def describe(label):
    print(f"--- {label}")
    for o in meshes():
        materials = [m.name for m in o.data.materials if m]
        weighted = [g.name for g in o.vertex_groups][:3]
        print(f"MESH {o.name!r}: {len(o.data.vertices)} vertices, materials {materials}, bones e.g. {weighted}")
    for o in bpy.data.objects:
        if o.type == "ARMATURE":
            names = [b.name for b in o.data.bones]
            print(f"ARMATURE {o.name!r}: {len(names)} bones, e.g. {names[:4]}")


describe("imported")
if not output:
    sys.exit(0)  # list mode
if not keywords:
    sys.exit("give at least one keyword (part of the garment's mesh or material name)")


def matches(name):
    return any(k in name.lower() for k in keywords)


# Meshes whose own name matches are kept whole. A mesh with matching *materials* (body and clothes in one mesh)
# is split by material first, and only the matching parts are kept.
for o in list(meshes()):
    if matches(o.name):
        continue
    if any(m and matches(m.name) for m in o.data.materials):
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type="MATERIAL")
        bpy.ops.object.mode_set(mode="OBJECT")

for o in list(meshes()):
    keep = matches(o.name) or (len(o.data.materials) == 1 and o.data.materials[0] and matches(o.data.materials[0].name))
    if not keep:
        bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o.type not in ("MESH", "ARMATURE"):
        bpy.data.objects.remove(o, do_unlink=True)

if not meshes():
    sys.exit("nothing matched those keywords: run list mode and pick a mesh or material name")

# Mixamo sometimes numbers its prefix ("mixamorig9:Hips"). Rename to the plain "mixamorig:" (Blender renames the
# meshes' matching vertex groups too, so the skin weights stay attached).
import re

for o in bpy.data.objects:
    if o.type == "ARMATURE":
        for bone in o.data.bones:
            bone.name = re.sub(r"^mixamorig\d+:", "mixamorig:", bone.name)

# Fabric, not metal: Mixamo's FBX comes in with Metallic 0.5 and its Glossiness map wired as roughness (the
# opposite), which renders as dark shiny plastic. Make every material a matte, non-metallic fabric.
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    for node in material.node_tree.nodes:
        if node.type != "BSDF_PRINCIPLED":
            continue
        for name, value in (("Metallic", 0.0), ("Roughness", 0.9), ("Specular IOR Level", 0.2)):
            socket = node.inputs.get(name)
            if socket is None:
                continue
            for link in list(socket.links):
                material.node_tree.links.remove(link)
            socket.default_value = value
    print(f"MATTE {material.name}")

# Smaller textures, so the file fits Mirror AI's 5 MB limit.
for image in bpy.data.images:
    if image.size[0] > 1024 or image.size[1] > 1024:
        scale = 1024 / max(image.size[0], image.size[1])
        image.scale(max(1, int(image.size[0] * scale)), max(1, int(image.size[1] * scale)))
        image.pack()

describe("kept")
bpy.ops.export_scene.gltf(
    filepath=output,
    export_format="GLB",
    export_image_format="JPEG",
    export_draco_mesh_compression_enable=False,
    export_animations=False,
    export_skins=True,
)
print(f"EXPORTED {output}")
```

## 6. Commit, publish, PR, auto-merge

```bash
git add app/tryon/live/garmentModel.ts app/tryon/live/garmentModel.test.ts scripts/rigged-glb.test.ts docs/task-list.md docs/learning/73_fit_uploaded_models_to_body.md
```
**Why:** stages this task's files.

```bash
git commit -m "73_fit_uploaded_models_to_body Fit uploaded models to torso length with ease"
```
**Why:** saves the snapshot.

```bash
git -c credential.helper= -c credential.helper='!f() { test "$1" = get || exit 0; echo username=<repo-owner>; echo "password=$(gh auth token --user <repo-owner>)"; }; f' push -u origin 73_fit_uploaded_models_to_body
```
**Why:** publishes the branch with the repo owner's stored login, without switching the GitHub CLI's active account (task 71).

```bash
GH_TOKEN="$(gh auth token --user <repo-owner>)" gh pr create --base main --head 73_fit_uploaded_models_to_body --title "73_fit_uploaded_models_to_body Fit uploaded models to torso length with ease" --body-file <file>
```
**Why:** opens the PR as the repo owner. `<file>` is a placeholder for a Markdown description file.

```bash
GH_TOKEN="$(gh auth token --user <repo-owner>)" gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes (after the CI check has registered for the new commit).

## Gotchas

- **Body landmarks are joint centres, not the body's outline.** Garments need ease to cover the person.
- **An uneven scale bends angles.** Aim in the object's own unscaled space, and combine rotations rather than decomposing a skewed world matrix.
- **Only fit what's really seen:** an estimated torso length would stretch the garment wrongly when the person is close up.
- **"sed matched nothing" from a mutation check is a failed check,** not a pass. Mind the indentation in the pattern, and keep a `cmp` guard in the helper.
- **Known limit, a future task (found by the rules-reviewer):** the uneven scale stretches the whole model, so **hanging sleeves and legs** also get longer or shorter with the torso, by at most the 0.75–1.4 limit, and diagonal limbs shear slightly. The tests check limb *directions*, not lengths. Keeping limb length independent of the torso would need per-bone compensation.
