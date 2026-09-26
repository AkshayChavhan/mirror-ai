# 27 Decide the try-on model

**Branch:** `27_decide_tryon_model` (starts from `main`)
**Goal:** record the developer's choice, **OOTDiffusion (option 1)**, and check its API is still what the Phase 0 findings said, so task 29 is built on facts.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #23 (task 22).

```bash
git checkout -b 27_decide_tryon_model
```
**Why:** new task, new branch.

## 2. The options (from `docs/phase-0-findings.md`)

| Option | Result |
|---|---|
| 1. OOTDiffusion Space | ✅ **Chosen.** Free, running, and covers upper, lower, and dress |
| 2. Self-host CatVTON | Best quality, but a paid GPU |
| 3. Wait for the official CatVTON Space | Down (it lost access to a gated model), with no fix date |

## 3. Check it's still running

```bash
curl -s https://huggingface.co/api/spaces/levihsu/OOTDiffusion/runtime
```
**Why:** Hugging Face's public API reports whether a Space is up. Got `stage: RUNNING` and `hardware: zero-a10g` (ZeroGPU on an A10G GPU).

```bash
curl -s https://huggingface.co/api/spaces/levihsu/OOTDiffusion
```
**Why:** the Space's metadata. Host `https://levihsu-ootdiffusion.hf.space`, Gradio `6.20.0`, **license `cc-by-nc-sa-4.0`**.

## 4. Read the API contract

```bash
curl -s --max-time 30 https://levihsu-ootdiffusion.hf.space/gradio_api/info
```
**Why:** every Gradio app publishes its endpoints and parameters at `/gradio_api/info`. It confirmed **`/process_dc`**:
- `vton_img`: the person image;
- `garm_img`: the garment image;
- `category`: `Upper-body` / `Lower-body` / `Dress`;
- `n_samples` (1), `n_steps` (20), `image_scale` (2.0), `seed` (-1);
- it returns a **Gallery**.
- `/process_hd` is upper-body only, so we don't use it.

```bash
curl -s --max-time 30 https://levihsu-ootdiffusion.hf.space/gradio_api/info | python3 -c "
import json,sys
d=json.load(sys.stdin)
for name,ep in d.get('named_endpoints',{}).items():
    print('ENDPOINT', name)
    for p in ep.get('parameters',[]):
        t=p.get('python_type',{}).get('type')
        print('   ', p.get('parameter_name'), '|', t, '| default:', p.get('parameter_default') if p.get('parameter_has_default') else '(required)', '|', p.get('component'))
    for r in ep.get('returns',[]):
        print('    returns:', r.get('component'), '|', (r.get('python_type') or {}).get('type','')[:80])
"
```
**Why:** the raw JSON is long, so this prints just each endpoint's parameter names, types, defaults, and return type.

Details the review found in that JSON (now recorded in the plan):
- `vton_img` and `garm_img` **have sample-image defaults**. If `runTryOn()` ever left one out, the Space would silently use its demo picture instead of failing, so both must always be passed.
- Allowed ranges: `n_samples` 1–4, `n_steps` 20–40, `image_scale` 1.0–5.0, `seed` −1 to 2147483647.
- The Gallery can also contain `{ video, caption }` items, so the code must pick an `image` item, not assume one.

## 5. Recorded in the docs

- `docs/project-plan.md`, new section **"Try-on model (decided …)"**: the Space, the verified parameter table with our values, the return shape, and the risks.
- `README.md`: the stack table says OOTDiffusion, with a non-commercial note.

**Risks recorded:**
- **License `cc-by-nc-sa-4.0` = non-commercial.** OK for learning and demos, but not for selling or charging without the authors' permission. It's flagged to the developer.
- **Shared ZeroGPU quota** on the server's `HF_TOKEN`, which is why try-ons are rate-limited per user.
- **Quality** is below CatVTON, and sarees are untested.
- **Switching later** only changes `lib/tryon.ts`.

## 6. Checklist

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** end-of-task checklist (docs only, but it always runs).

## 7. Commit, publish, PR, auto-merge

```bash
git add docs/project-plan.md README.md docs/learning/27_decide_tryon_model.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "27_decide_tryon_model Choose OOTDiffusion and record its verified API"
```
**Why:** saves the snapshot.

```bash
git push -u origin 27_decide_tryon_model
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 27_decide_tryon_model --title "27_decide_tryon_model Choose OOTDiffusion and record its verified API" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Spaces change without notice.** Re-check `/runtime` and `/gradio_api/info` before relying on them. Task 29's code should fail gracefully if the Space is down.
- **`sdk: None` in the runtime API** is normal. The SDK version shows in the Space metadata (`cardData.sdk_version`) instead.
