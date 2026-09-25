# Phase 0 findings and setup state (2026-09-25)

## State of the repo

- Scaffolded with `create-next-app`: Next.js 16.3.6, React 19.2.8, Tailwind 4, ESLint 9, TypeScript, App Router, no `src/`, alias `@/*`, **npm**.
- Nothing committed yet. The remote (`AkshayChavhan/mirror-ai`) is still empty.
- Next 16 ships its own docs in `node_modules/next/dist/docs/`. Read them before writing code (see `AGENTS.md`).

### Node on this machine

Claude Code sessions launched from VS Code don't have node on PATH, because fnm is loaded only in `~/.zshrc`. Prepend this in shell commands:

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```

Use **22.23.2**, not 22.12.0: `eslint-visitor-keys@5` requires Node `^22.13.0`.

## Blocker: every CatVTON Space is down

Checked through `https://huggingface.co/api/spaces/<id>/runtime`:

| Space                               | Status        | Why                                                                                                               |
| ----------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `zhengchong/CatVTON` (official)     | RUNTIME_ERROR | App startup loads gated `black-forest-labs/FLUX.1-Fill-dev`, and the Space's token no longer has access (401) |
| `xiaozaa/catvton-flux-try-on`       | RUNTIME_ERROR | `peft` version mismatch                                                                                           |
| `shahza1b/CatVTON`, `RageshAntony/RG-CatVTON`, `FIT-Check/CatVTON` | CONFIG_ERROR  | torch version not compatible with ZeroGPU                                                                         |
| `Nymbo/CatVTON`                     | PAUSED        | Paused (a10g-large)                                                                                               |

Running alternatives:

| Space                               | Categories                            | API                                                                                                                  |
| ----------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `levihsu/OOTDiffusion` (ZeroGPU)    | **Upper-body, Lower-body, Dress**     | `/process_dc(vton_img, garm_img, category, n_samples=1, n_steps=20, image_scale=2.0, seed=-1)` returns a Gallery |
| `yisol/IDM-VTON` (ZeroGPU)          | Upper body only                       | `/tryon(dict{background,layers,composite}, garm_img, garment_des, ...)`                                              |
| `Kwai-Kolors/Kolors-Virtual-Try-On` | n/a                                   | No API endpoints exposed                                                                                             |

OOTDiffusion is the only running free option that covers the plan's three categories (`UPPER`→`Upper-body`, `LOWER`→`Lower-body`, `OVERALL`→`Dress`). Its license is also CC BY-NC-SA.

### CatVTON API contract (for when it is self-hosted or fixed)

From the Space's `app.py`, `submit_function` (the "Mask-based & SD1.5" tab, `@spaces.GPU(duration=120)`):

| Param                 | Type                                                       | Default                   |
| --------------------- | ---------------------------------------------------------- | ------------------------- |
| `person_image`        | ImageEditor dict `{background, layers, composite}`; an empty layer means auto-mask | —   |
| `cloth_image`         | filepath                                                   | —                         |
| `cloth_type`          | `"upper" \| "lower" \| "overall"`                          | `upper`                   |
| `num_inference_steps` | 10–100, step 5                                             | 50                        |
| `guidance_scale`      | 0–7.5                                                      | 2.5                       |
| `seed`                | -1–10000                                                   | 42                        |
| `show_type`           | `"result only" \| "input & result" \| "input & mask & result"` | `input & mask & result`. **Pass `result only`** |

The endpoint is unnamed in the UI. Confirm the exact `api_name` with `/gradio_api/info` once a copy is running.

### Quota risk (applies to any ZeroGPU Space)

ZeroGPU bills GPU time to the calling HF token. Every user of the app would share the server's token and its daily quota, and CatVTON reserves 120 s per call. Check the current free and PRO quotas before relying on this in production.

## Decision needed: which model backs `runTryOn()`

1. **OOTDiffusion Space now** (free, running, covers all 3 categories, lower quality than CatVTON). Recommended to unblock Phase 3.
2. **Self-host CatVTON** (duplicate the Space onto paid GPU with the FLUX tab removed, or deploy on Modal). This moves the Phase 7 stretch goal into Phase 3.
3. Wait for the official Space to be fixed.

Keep the model behind one function in `lib/` so switching providers later touches only that file.

Sarees are still untested on every option.

## Prisma: use 6.x, not 7 or 8

- **Prisma 7.10.0**: a MongoDB schema validates (the URL has to move to `prisma.config.ts`), but the client refuses to run without a driver adapter, and there is no MongoDB adapter.
- **Prisma 8.0.0-rc.17** (`latest` tag on npm is an RC): new CLI, and `prisma validate` no longer exists.
- **Use `prisma@6.19.3` + `@prisma/client@6.19.3`**, with `url = env("DATABASE_URL")` in the datasource block.

Other versions checked: `@clerk/nextjs@7.9.7` peer-supports Next `^16.1.0-0` / React `~19.2.3` (OK). `inngest@4.21.0`, `@gradio/client@2.7.0` (Node ≥18), `cloudinary@2.11.0`, `zustand@5.0.15`.

## Phase 1: what's left

- [ ] Install Prisma 6 and add the plan's `Product` / `TryOn` schema
- [ ] Clerk auth (chosen over NextAuth; it's the same stack as msg2ai), with `proxy.ts` in Next 16
- [ ] `lib/prisma.ts`, `lib/cloudinary.ts`, and the try-on model client
- [ ] `.env.example` (`DATABASE_URL`, Clerk keys, `CLOUDINARY_*`, `HF_TOKEN`, `INNGEST_*`)
- [ ] Replace the create-next-app boilerplate page and metadata
- [ ] `npm run lint`, type-check, and `npm run build` all pass
