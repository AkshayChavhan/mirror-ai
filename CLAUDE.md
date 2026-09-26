@AGENTS.md

# Learning docs rule (always follow)

This project is for learning. Every step we take gets written up in `docs/learning/`.

- **File names:** two-digit number, underscore, snake_case topic, `.md`. For example `01_installation_setup.md` and `02_prisma_setup.md`. Pick the next unused number, and don't renumber existing files.
- **Every command goes in the doc, even small ones like `cd mirror-ai`.** Show each one in a code block. Under it, add a one-line **Why:** saying what it does and why we run it.
- **Keep it short, but complete.** Use bullets, not paragraphs. Skip filler, but don't leave out any step, flag, env var, or file needed to reproduce the work.
- Include the config and code changes we made, plus any gotchas we hit (errors, version pins, workarounds) and how we fixed them.
- Update the matching learning doc in the same turn as the work. Don't leave it for later.

# Task list rule (always follow, never skip)

`docs/task-list.md` is the source of truth for tasks and branch names.

- **Before planning or creating a branch,** read `docs/task-list.md`. Take the next ❌ task, or the task the developer names. Use its `Branch` column exactly as the branch name, and base the plan on its `What` and `Tests` columns.
- **New work goes into the list first.** If a task isn't in the list, add it as a new ❌ row with the next number, and get the developer's OK before creating its branch.
- **Status marks:** ❌ = not done, ✅ = done. When the task's changes are finished and the end-of-task checklist passes, change its ❌ to ✅ in the task's own branch **before** asking to commit, so the tick is part of that commit.
- Never mark ✅ if tests, lint, type-check, or build fail. Never tick a task other than the current one.

# Branch and commit rules (always follow, never skip)

- **Never work on `main`.** Before changing any file, check the current branch. If it's `main`, stop and create a task branch first.
- **Split work into very small tasks, one branch per task.** Branch names use the same numbering as the learning docs: two-digit number, underscore, snake_case task name. For example:
  - `01_installation_setup`
  - `02_adding_rules_for_learning_document`
  - `03_adding_rules_for_creating_branch`
- Take the branch name from `docs/task-list.md` (see the task list rule). Don't invent names outside the list.
- **Never commit, push, merge, or open a PR without the developer's explicit permission.** Make the changes, show them for review, then wait. Permission for one commit doesn't carry over to the next.
- **Commit message format:** `<branch_name> <commit_message>`, with a short, clear message in the imperative mood. For example:
  - `03_adding_rules_for_creating_branch Add branch and commit rules to CLAUDE.md`

# Testing rule (always follow, never skip)

- **Every feature gets its tests in the same task and branch.** Write them together with the feature, not later. A feature isn't done until its tests exist and pass.
- **Colocate tests** next to the code: `lib/prisma.ts` gets `lib/prisma.test.ts`, and `app/components/Button.tsx` gets `app/components/Button.test.tsx`. E2E tests go in `e2e/`.
- **Choose the test type** using `node_modules/next/dist/docs/01-app/02-guides/testing/`:
  - Unit tests (Vitest) cover `lib/` functions, hooks, and synchronous Server and Client Components.
  - E2E tests (Playwright) cover `async` Server Components and user flows. Vitest can't render async Server Components.
- **Mock external services** in unit tests: the HF/Gradio try-on model, Cloudinary, Clerk, MongoDB, and Inngest. Unit tests must never call a real service or use real keys.
- Cover the happy path plus the important failures (bad input, a service error, auth missing), and keep tests short.
- Run the tests before asking to commit, and report the result honestly. Include failures with their output.
- Put the test commands, with their **Why:** lines, in that task's learning doc.
- The test framework isn't installed yet. Setting it up (Vitest + Testing Library, and Playwright) is its own task and branch, done before the first feature.

# Code rules

- **Try-on model behind one function.** Only `lib/` calls the try-on model, through a single function such as `runTryOn()`. Nothing else imports `@gradio/client` or calls the HF Space directly, so switching providers (OOTDiffusion → CatVTON) touches one file.
- **TypeScript is strict.** No `any`, `@ts-ignore`, or `@ts-expect-error` unless a comment explains why. Prefer `unknown` plus narrowing.
- **Keep secrets on the server.** Service SDKs and secret keys (Prisma, Cloudinary, HF token, Clerk secret, Inngest) are used only in server code: Server Components, Route Handlers, Server Actions, `lib/`. Add `"use client"` only when a component needs state, effects, or browser APIs. Only env vars prefixed `NEXT_PUBLIC_` may reach the browser.
- **Handle errors.** Catch model timeouts, quota or rate-limit errors, failed uploads, and DB errors. Show the user a clear, friendly message, never a raw stack trace or provider error. Log the details on the server. Every such failure path gets a test.

# Security and secrets (always follow, never skip)

- **Never commit `.env*` files, keys, or tokens.** Every new env var goes in `.env.example` with a placeholder value and a one-line comment saying what it's for.
- **Never write a real token** in code, learning docs, logs, terminal output shown to the developer, or commit messages. Use placeholders like `<HF_TOKEN>`.

# Workflow (always follow, never skip)

- **Plan first.** Before coding a task, give a short plan: the files to change, the commands to run, and the tests to add. Wait for the developer's OK.
- **Stay in scope.** Change only what the current task needs. No refactors or "improvements" elsewhere; suggest them separately as future tasks.
- **Ask when unsure.** If a requirement or product decision is unclear, ask instead of guessing.
- **Explain as you go.** This is a learning project, so after each change briefly say *why*, not just *what*.
- **Ask before adding any package.** Say what it's for and its version before installing. Record it in the task's learning doc.
- **End-of-task checklist.** Before asking to commit:
  - Tests pass: `npm test` (Vitest) and `npm run test:e2e` (Playwright).
  - `npm run lint` passes.
  - `npm run typecheck` passes (runs `next typegen && tsc --noEmit`).
  - `npm run build` passes.
  - The learning doc is updated.
  - A short summary of the changes is given for review.
  - Report any failure honestly, with its output.

# Git extras (always follow, never skip)

- **Branch base.** Each new task branch starts from the latest approved branch (or from `main` once merges start), never from an unapproved one, unless the developer says otherwise.
- **No destructive git.** No force-push, `reset --hard`, rebasing or amending pushed commits, or deleting branches without the developer's explicit permission.
- **Merge flow.** Claude never merges into `main`. After approval, Claude pushes the branch and opens a PR only when asked, and the developer reviews and merges it.
