# Task list

Each task is one branch. The branch name is the `Branch` column exactly.

**Status:** ❌ = not done. ✅ = changes done and checked (tests, lint, type-check, build, learning doc). Switch ❌ to ✅ in the task's own branch **before** asking to commit.

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
| ❌ | 10 | `10_add_typecheck_script` | `"typecheck": "tsc --noEmit"` in `package.json` | `npm run typecheck` passes |
| ❌ | 11 | `11_setup_vitest` | Vitest + Testing Library, `npm test` script | One sample test passes |
| ❌ | 12 | `12_setup_playwright` | Playwright, `e2e/` folder | Smoke test: home page loads |
| ❌ | 13 | `13_add_ci_workflow` | GitHub Actions: lint, typecheck, test, build on every PR | Workflow runs green on a PR |

## Group C: Phase 1 foundation

| Status | # | Branch | What | Tests |
|---|---|---|---|---|
| ❌ | 14 | `14_add_project_plan_doc` | Add the project plan (incl. `Product` / `TryOn` fields) to `docs/` | None (docs) |
| ❌ | 15 | `15_replace_boilerplate_page` | Replace the starter page and metadata | Page unit test, and update the e2e smoke test |
| ❌ | 16 | `16_update_readme` | Replace the `create-next-app` README with a project README | None (docs) |
| ❌ | 17 | `17_add_env_example` | `.env.example`: `DATABASE_URL`, Clerk keys, `CLOUDINARY_*`, `HF_TOKEN`, `INNGEST_*` | None (no code) |
| ❌ | 18 | `18_install_prisma_6` | `prisma@6.19.3` + `@prisma/client@6.19.3`, init for MongoDB | `prisma validate` passes |
| ❌ | 19 | `19_add_prisma_schema` | `Product` and `TryOn` models from the plan | `prisma validate` + `prisma generate` |
| ❌ | 20 | `20_add_prisma_client_lib` | `lib/prisma.ts` singleton | Same instance returned (mocked) |
| ❌ | 21 | `21_setup_clerk_auth` | `@clerk/nextjs@7.9.7`, provider in the layout | Layout renders with Clerk mocked |
| ❌ | 22 | `22_add_clerk_proxy` | `proxy.ts` protecting routes (Next 16's replacement for middleware) | E2E: a protected route redirects when signed out |
| ❌ | 23 | `23_add_clerk_sign_in_pages` | Sign-in and sign-up pages | E2E: both pages render |
| ❌ | 24 | `24_add_cloudinary_client` | `cloudinary@2.11.0`, `lib/cloudinary.ts` upload helper | Upload success and failure (SDK mocked) |
| ❌ | 25 | `25_decide_tryon_model` | Record the model choice (OOTDiffusion / self-host / wait) in docs | None (decision) |
| ❌ | 26 | `26_install_gradio_client` | `@gradio/client@2.7.0` | Import works in a server-only test |
| ❌ | 27 | `27_add_tryon_model_client` | `lib/tryon.ts` with `runTryOn()`: maps `UPPER`/`LOWER`/`OVERALL`; handles timeout, quota, and bad input | Category mapping and each error path (Gradio mocked) |

## Blockers

- **Base for `main`:** the developer picks (a) or (b) before the first PR.
- **07:** these are third-party skills.
  - Read each one's files before installing.
  - Installing the guardrail hook changes `.claude/settings.json`, so the developer must approve that step.
  - `skill-creator` may already be available here as `anthropic-skills:skill-creator`.
- **08:** creating `.claude/agents/rules-reviewer.md` needs the developer's approval.
- **14:** needs the plan from the developer. It blocks 19.
- **18–24:** need a MongoDB Atlas URL, Clerk keys, and Cloudinary credentials in the developer's local `.env`, never in chat or commits.
- **26–27:** need the decision from 25.

## Later (Phase 3+, not yet split into tasks)

- Confirm the Gradio `api_name` with `/gradio_api/info`.
- Check the ZeroGPU free and PRO quotas.
- Test sarees on the chosen model.
- Set up Inngest.
- Self-host CatVTON (if chosen).
