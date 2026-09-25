@AGENTS.md

# Learning docs rule (always follow)

This project is for learning. Every step we take gets written up in `docs/learning/`.

- **File names:** two-digit number, underscore, snake_case topic, `.md`. For example `01_installation_setup.md` and `02_prisma_setup.md`. Pick the next unused number, and don't renumber existing files.
- **Every command goes in the doc, even small ones like `cd mirror-ai`.** Show each one in a code block. Under it, add a one-line **Why:** saying what it does and why we run it.
- **Keep it short, but complete.** Use bullets, not paragraphs. Skip filler, but don't leave out any step, flag, env var, or file needed to reproduce the work.
- Include the config and code changes we made, plus any gotchas we hit (errors, version pins, workarounds) and how we fixed them.
- Update the matching learning doc in the same turn as the work. Don't leave it for later.

# Branch and commit rules (always follow, never skip)

- **Never work on `main`.** Before changing any file, check the current branch. If it's `main`, stop and create a task branch first.
- **Split work into very small tasks, one branch per task.** Branch names use the same numbering as the learning docs: two-digit number, underscore, snake_case task name. For example:
  - `01_installation_setup`
  - `02_adding_rules_for_learning_document`
  - `03_adding_rules_for_creating_branch`
- Pick the next unused number. Check with `git branch -a` and `docs/learning/`.
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
