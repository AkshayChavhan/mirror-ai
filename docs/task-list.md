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
| ❌ | 16 | `16_add_project_plan_doc` | Add the project plan (incl. `Product` / `TryOn` fields) to `docs/` | None (docs) |
| ✅ | 17 | `17_replace_boilerplate_page` | Replace the starter page and metadata with a temporary Mirror AI home (no fake links); remove starter SVGs | Page unit tests (3) and e2e title/description check pass |
| ✅ | 18 | `18_update_readme` | Replace the `create-next-app` README with a project README | None (docs) |
| ✅ | 19 | `19_add_env_example` | `.env.example`: `DATABASE_URL`, Clerk keys, `CLOUDINARY_*`, `HF_TOKEN`, `INNGEST_*` (placeholders only); `!.env.example` exception in `.gitignore` | `env-example.test.ts`: all vars listed, placeholders only, `.env` still ignored |
| ✅ | 20 | `20_install_prisma_6` | `prisma@6.19.3` + `@prisma/client@6.19.3`, `prisma/schema.prisma` for MongoDB with the classic `prisma-client-js` generator (no models yet; `prisma.config.ts` not used) | `prisma/schema.test.ts`: provider/generator checks and `prisma validate` passes |
| ❌ | 21 | `21_add_prisma_schema` | `Product` and `TryOn` models from the plan | `prisma validate` + `prisma generate` |
| ❌ | 22 | `22_add_prisma_client_lib` | `lib/prisma.ts` singleton | Same instance returned (mocked) |
| ❌ | 23 | `23_setup_clerk_auth` | `@clerk/nextjs@7.9.7`, provider in the layout | Layout renders with Clerk mocked |
| ❌ | 24 | `24_add_clerk_proxy` | `proxy.ts` protecting routes (Next 16's replacement for middleware) | E2E: a protected route redirects when signed out |
| ❌ | 25 | `25_add_clerk_sign_in_pages` | Sign-in and sign-up pages | E2E: both pages render |
| ❌ | 26 | `26_add_cloudinary_client` | `cloudinary@2.11.0`, `lib/cloudinary.ts` upload helper | Upload success and failure (SDK mocked) |
| ❌ | 27 | `27_decide_tryon_model` | Record the model choice (OOTDiffusion / self-host / wait) in docs | None (decision) |
| ❌ | 28 | `28_install_gradio_client` | `@gradio/client@2.7.0` | Import works in a server-only test |
| ❌ | 29 | `29_add_tryon_model_client` | `lib/tryon.ts` with `runTryOn()`: maps `UPPER`/`LOWER`/`OVERALL`; handles timeout, quota, and bad input | Category mapping and each error path (Gradio mocked) |

## Blockers

- **Base for `main`:** the developer picks (a) or (b) before the first PR.
- **07:** these are third-party skills.
  - Read each one's files before installing.
  - Installing the guardrail hook changes `.claude/settings.json`, so the developer must approve that step.
  - `skill-creator` may already be available here as `anthropic-skills:skill-creator`.
- **08:** creating `.claude/agents/rules-reviewer.md` needs the developer's approval.
- **16:** needs the plan from the developer. It blocks 21.
- **21–22:** need the plan (16), and a MongoDB Atlas URL in the developer's local `.env` to run against a real database.
- **23–25:** need Clerk keys in the local `.env`, and as GitHub Actions secrets for CI (the build fails without a publishable key).
- **26:** needs Cloudinary credentials only for real uploads. Its unit tests mock the SDK.
- **28–29:** need the decision from 27.

## Later (Phase 3+, not yet split into tasks)

- Confirm the Gradio `api_name` with `/gradio_api/info`.
- Check the ZeroGPU free and PRO quotas.
- Test sarees on the chosen model.
- Set up Inngest.
- Self-host CatVTON (if chosen).
