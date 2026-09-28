# Task list

Each task is one branch. The branch name is the `Branch` column exactly.

**Status:** ❌ = not done. ✅ = changes done and checked (tests, lint, type-check, build, learning doc). Switch ❌ to ✅ in the task's own branch **before** committing.

## Group A: commit the work already done

| Status | # | Branch | What | Tests |
|---|---|---|---|---|
| ✅ | 01 | `01_installation_setup` | Next.js scaffold, `docs/phase-0-findings.md`, Node 22.23.2 PATH fix, learning doc | None (scaffold) |
| ✅ | 02 | `02_adding_rules_for_learning_document` | Learning-doc rule in `CLAUDE.md` | None (docs) |
| ✅ | 03 | `03_adding_rules_for_creating_branch` | Branch and commit rules | None (docs) |
| ✅ | 04 | `04_adding_rules_for_testing` | Testing rule | None (docs) |
| ✅ | 05 | `05_adding_code_and_security_rules` | Code rules, security and secrets | None (docs) |
| ✅ | 06 | `06_adding_workflow_and_git_rules` | Workflow rules, git extras, task-list rule, this file | None (docs) |
| ✅ | 07 | `07_adding_skills` | Add Claude Code skills: **verification-before-completion** (run the proving command and read its output before saying "done"), **systematic-debugging** (find the root cause before fixing), both from obra/superpowers; **git-guardrails-claude-code** (a hook that blocks `git push`, `reset --hard`, and force-deleting branches), from mattpocock/skills; **frontend-design** (avoid tell-tale AI-generated page patterns) and **skill-creator** (write and test our own skills), from anthropics/skills | Each skill shows up in Claude Code; the guardrail hook actually blocks a test `git push` |
| ✅ | 08 | `08_adding_rules_reviewer_subagent` | `.claude/agents/rules-reviewer.md`: a read-only reviewer (Read, Grep, Glob, Bash; no edit tools) that checks a finished task against `CLAUDE.md` before the commit request: right branch, in scope, no secrets, strict TS, tests present, checklist passes, learning doc updated, ✅ set. Reports problems and never fixes them. | Run it on a sample change with a planted problem (e.g. an `any`, a missing test); it must report the problem |

**Base for `main` (decide before the first PR):** `main` has no commits yet, so PRs can't target it. The developer picks one:
- (a) Push the approved `01_installation_setup` as the start of `main`.
- (b) Make a tiny first commit on `main`, such as a README.

## Group B: tooling and testing setup (before any feature)

| Status | # | Branch | What | Tests |
|---|---|---|---|---|
| ✅ | 09 | `09_pin_node_version` | `.nvmrc` (`22.23.2`) and `engines` in `package.json` | None (config) |
| ✅ | 10 | `10_add_typecheck_script` | `"typecheck": "next typegen && tsc --noEmit"` in `package.json`; point the `CLAUDE.md` checklist and `rules-reviewer` at it | `npm run typecheck` passes |
| ✅ | 11 | `11_setup_vitest` | Vitest 5 + Testing Library + jest-dom, `vitest.config.mts` (Vite 8 built-in `@/` paths), `npm test` / `npm run test:watch`; `@types/node` 20 → 22 and `engines` tightened for jsdom 30 | Sample `app/page.test.tsx` passes; planted failure is reported |
| ✅ | 12 | `12_setup_playwright` | `@playwright/test` 1.63.0 (Chromium only), `playwright.config.ts` (prod build on port 3100), `e2e/` folder, `npm run test:e2e`; checklist and reviewer run it | Smoke test: home page loads; planted failure is reported |
| ✅ | 13 | `13_add_ci_workflow` | GitHub Actions `.github/workflows/ci.yml`: Node from `.nvmrc`, `npm ci`, lint, `npm run typecheck`, `npm test`, Playwright Chromium + `npm run test:e2e` (includes build), on every PR and every update to `main` | Workflow runs green on its PR; a planted failing test turns it red |
| ✅ | 14 | `14_add_branch_protection` | Branch protection on `main`: the CI check must pass, the PR branch must be up to date, rules apply to admins too, no force updates or deletion of `main`, no required reviews (solo developer) | Settings read back via `gh api`; a PR with a failing test shows merging blocked |
| ✅ | 15 | `15_enable_auto_merge` | Full auto-merge (developer's choice): `CLAUDE.md` rules so Claude commits, opens the PR, and runs `gh pr merge --auto --merge` on every task; GitHub merges only when CI passes; Claude stops only when a task needs the developer | This task's own PR merges by itself once CI is green |

## Group C: Phase 1 foundation

| Status | # | Branch | What | Tests |
|---|---|---|---|---|
| ✅ | 16 | `16_add_project_plan_doc` | `docs/project-plan.md`: users and access, pages, `Product` / `TryOn` (+ assumed `WishlistItem`) fields, category mapping, 24 h privacy auto-delete, job lifecycle | None (docs) |
| ✅ | 17 | `17_replace_boilerplate_page` | Replace the starter page and metadata with a temporary Mirror AI home (no fake links); remove starter SVGs | Page unit tests (3) and e2e title/description check pass |
| ✅ | 18 | `18_update_readme` | Replace the `create-next-app` README with a project README | None (docs) |
| ✅ | 19 | `19_add_env_example` | `.env.example`: `DATABASE_URL`, Clerk keys, `CLOUDINARY_*`, `HF_TOKEN`, `INNGEST_*` (placeholders only); `!.env.example` exception in `.gitignore` | `env-example.test.ts`: all vars listed, placeholders only, `.env` still ignored |
| ✅ | 20 | `20_install_prisma_6` | `prisma@6.19.3` + `@prisma/client@6.19.3`, `prisma/schema.prisma` for MongoDB with the classic `prisma-client-js` generator (no models yet; `prisma.config.ts` not used) | `prisma/schema.test.ts`: provider/generator checks and `prisma validate` passes |
| ✅ | 21 | `21_add_prisma_schema` | `Product`, `TryOn`, `WishlistItem` (anonymous or user, duplicates allowed) models and `Category` / `TryOnStatus` enums, with indexes and cascade deletes | `prisma validate`, plus generated-client field and enum checks |
| ✅ | 22 | `22_add_prisma_client_lib` | `lib/prisma.ts`: one `PrismaClient`, cached on `globalThis` in development (hot-reload safe) | `lib/prisma.test.ts` (mocked): created once, reused across reloads, not cached in production |
| ✅ | 23 | `23_setup_clerk_auth` | `@clerk/nextjs@7.9.7` (Clerk Core 3), `<ClerkProvider>` inside `<body>` in `app/layout.tsx`; Clerk secrets passed to CI | `app/layout.test.tsx` (Clerk mocked): provider wraps the page inside `<body>`; build and e2e pass with the real provider |
| ✅ | 24 | `24_add_clerk_proxy` | `proxy.ts` runs `clerkMiddleware()` with Clerk's matcher (Core 3: no path-based protection); `lib/auth.ts`: `requireUser()` (redirect to sign-in) and `requireAdmin()` (404 for non-admins) for protected pages; `/tryon/[id]` decided public | `lib/auth.test.ts` (Clerk mocked) plus E2E: public pages stay public, middleware runs, static files skipped |
| ✅ | 25 | `25_add_clerk_sign_in_pages` | `/sign-in` and `/sign-up` (optional catch-all routes) with Clerk's `<SignIn />` / `<SignUp />`; `ClerkProvider` URL props (no new env vars) | Unit (Clerk mocked) plus E2E with real Clerk: both forms render; fail without keys |
| ✅ | 26 | `26_add_cloudinary_client` | `cloudinary@2.11.0`, `lib/cloudinary.ts`: `uploadImage()` with friendly `ImageUploadError`s and server-side logging | `lib/cloudinary.test.ts` (SDK mocked): success, empty file, missing env, provider error hidden from users |
| ✅ | 27 | `27_decide_tryon_model` | Chose **OOTDiffusion** (`levihsu/OOTDiffusion`, `/process_dc`); verified status and API; recorded params, return shape, and risks (non-commercial license, shared ZeroGPU quota) in `docs/project-plan.md` | None (decision) |
| ✅ | 28 | `28_install_gradio_client` | `@gradio/client@2.7.0`; one-off read-only `view_api()` check against the OOTDiffusion Space | `lib/gradio-client.test.ts` (Node env): `Client.connect` and `handle_file` load |
| ✅ | 29 | `29_add_tryon_model_client` | `lib/tryon.ts`: `runTryOn()` on OOTDiffusion `/process_dc` (both images always passed, first image result), `UPPER`/`LOWER`/`OVERALL` mapping, `TryOnError` codes for bad input, unavailable, quota, timeout, no result, failed | `lib/tryon.test.ts` (Gradio mocked): mapping, each category, every error path |

## Phase 2 (approved by the developer on 2026-09-27)

Built from `docs/project-plan.md`. Every page task includes its unit and E2E tests. Protected pages call `requireUser()` / `requireAdmin()` and have a signed-out redirect E2E test.

### Group D: Database and admin

| Status | # | Branch | What | Tests |
|---|---|---|---|---|
| ✅ | 30 | `30_add_db_push_script` | `npm run db:push` (`prisma db push`) to create the MongoDB collections and indexes from the schema | Script runs against the developer's Atlas database |
| ✅ | 31 | `31_add_product_queries` | `lib/products.ts`: list active, get one, create, update, delete | Unit (Prisma mocked) |
| ✅ | 32 | `32_add_admin_products_list` | `/admin/products` list page (`requireAdmin`) | Unit + E2E: signed-out redirect, non-admin 404 |
| ✅ | 33 | `33_add_admin_product_form` | Create/edit product form, with garment image upload to Cloudinary | Unit + E2E |
| ✅ | 34 | `34_add_admin_product_delete` | Delete, and hide/show (`isActive`) | Unit + E2E |
| ✅ | 35 | `35_add_landing_page` | Landing page: public product grid and a "Try it on" button (replaces the temporary home) | Unit + E2E |

### Group E: Try-on flow

| Status | # | Branch | What | Tests |
|---|---|---|---|---|
| ✅ | 36 | `36_install_inngest` | `inngest@4.21.0` and its client | Client loads (unit) |
| ✅ | 37 | `37_add_inngest_route` | `app/api/inngest` route (local Inngest dev server) | Unit + route responds |
| ✅ | 38 | `38_add_tryon_create_action` | "Try on" action: `requireUser`, upload the person photo, create a `PENDING` try-on, send the job event | Unit (mocks) |
| ✅ | 39 | `39_add_tryon_job` | Job: `PROCESSING` → `runTryOn()` → result to Cloudinary → `DONE` / `FAILED` | Unit (mocks), every path |
| ✅ | 40 | `40_add_tryon_status_endpoint` | Status endpoint for polling | Unit + E2E |
| ❌ | 41 | `41_add_tryon_page_upload` | `/tryon`: product carousel, gallery upload, preview (Retake / Try on) | Unit + E2E incl. signed-out redirect |
| ❌ | 42 | `42_add_tryon_camera` | Live camera capture with a pose guide overlay | Unit + E2E (fake camera) |
| ❌ | 43 | `43_add_tryon_loading_screen` | Loading screen that polls until the try-on is done or has failed | Unit + E2E |
| ❌ | 44 | `44_add_tryon_result_page` | `/tryon/[id]` (public link): before/after slider, download | Unit + E2E |
| ❌ | 45 | `45_add_whatsapp_share` | Share-to-WhatsApp button | Unit + E2E |

### Group F: History and wishlist

| Status | # | Branch | What | Tests |
|---|---|---|---|---|
| ✅ | 46 | `46_add_history_page` | `/history`: the last 24 h of try-ons (`requireUser`) | Unit + E2E incl. signed-out redirect |
| ✅ | 47 | `47_add_wishlist_cookie` | Anonymous-id cookie for signed-out visitors | Unit |
| ✅ | 48 | `48_add_wishlist_actions` | Add to / remove from the wishlist | Unit (Prisma mocked) |
| ✅ | 49 | `49_add_wishlist_page` | `/wishlist` page (public) | Unit + E2E |
| ✅ | 50 | `50_add_wishlist_merge_on_sign_in` | Move anonymous items to the account on sign-in | Unit |

### Group G: Privacy and limits

| Status | # | Branch | What | Tests |
|---|---|---|---|---|
| ❌ | 51 | `51_add_cleanup_cron` | Hourly Inngest cron: delete try-ons older than 24 h and their Cloudinary images | Unit (mocks) |
| ❌ | 52 | `52_add_tryon_rate_limit` | Per-user try-on limit | Unit: under/at/over the limit |
| ❌ | 55 | `55_cleanup_images_on_product_delete` | Deleting a product also deletes its Cloudinary images: the garment image, **and** the `personUrl`/`resultUrl` of its try-ons (their rows cascade-delete, so the 24 h cron could never find them). Reuses `deleteImage()` (task 38). **Must be done before task 41**, the first page that lets users create try-ons. Added by task 38, waiting for the developer's OK | Unit (mocks): images deleted before the rows; a failed image delete is logged |
| ❌ | 56 | `56_add_tryon_share_token` | Give each `TryOn` a random, unguessable share token (e.g. `shareId`, 128-bit, unique) and use it in the public `/tryon/[id]` link instead of the ObjectId. ObjectIds are a timestamp, a per-process value and a counter, so they can be guessed from one shared link. Fix the "random ObjectIds" line in `docs/project-plan.md`. **Must be done before task 44.** Added by task 38's review, waiting for the developer's OK | Unit: token is random and unique; the page looks up by token, and an ObjectId doesn't work |
| ❌ | 57 | `57_add_wishlist_item_limit` | Cap how many wishlist items one owner (user or anonymous id) can have, e.g. N items, with a friendly message when full. Anonymous visitors could otherwise add rows without limit. Suggested by task 48's review, waiting for the developer's OK (and the number) | Unit: under/at/over the cap |

### Group H: Housekeeping

| Status | # | Branch | What | Tests |
|---|---|---|---|---|
| ✅ | 53 | `53_tidy_docs` | Add phase 2 tasks 30–54 to this list; remove stale blocker notes; fix the out-of-date line in `CLAUDE.md` | None (docs) |
| ❌ | 54 | `54_reviewer_page_auth_check` | rules-reviewer check that every protected page calls `requireUser()` / `requireAdmin()` (approved) | Planted unprotected page is flagged |

## Blockers

- **26:** needs Cloudinary credentials only for real uploads. Its unit tests mock the SDK.
- **52:** needs the developer's limit and time window (e.g. N try-ons per user per day).
- **55:** a new task (added in task 38), so it needs the developer's OK before its branch is created.
- **41:** waits for 55, so no user can create a try-on whose photo a product delete would leave behind forever.
- **56:** a new task (added in task 38's review), so it needs the developer's OK before its branch is created.
- **44:** waits for 56, so public result links can't be guessed.
- **57:** a new task (added in task 48's review): needs the developer's OK and the item limit.
- **42, 43:** build on the `/tryon` page (41). **45:** builds on the result page (44). They follow those tasks.

## Later (not yet split into tasks)

- Check the ZeroGPU free and PRO quotas.
- Test sarees on the chosen model.
- Self-host CatVTON (if quality or the non-commercial license becomes a problem).
- Decide on the Prisma CLI `npm audit` finding (downgrade to 6.12.0 or accept).
- Decide on the `server-only` package.
- Task 51 idea (from task 38's review): besides deleting rows older than 24 h, also sweep Cloudinary's `mirror-ai/people` (and results) folder by upload time with the Admin API. That catches photos with no row, e.g. when a best-effort `deleteImage` failed. Needs the developer's OK to change task 51.
- (Moved to task 55.) Deleting a product only deletes database rows (task 34). Task 38 adds only a Server Action that no page calls yet, so try-ons first ship with task 41, and task 55 must come before it.
