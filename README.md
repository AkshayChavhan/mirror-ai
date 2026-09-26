# Mirror AI

Virtual try-on: upload a photo of yourself and a garment, and see yourself wearing it. It covers tops, bottoms, and dresses.

This is also a **learning project**. Every step is written up in [`docs/learning/`](docs/learning/), with each command and why it was run.

## Status

Early setup. Tooling, tests, and CI are in place. The app itself (database, auth, uploads, try-on model) is being built task by task. See [`docs/task-list.md`](docs/task-list.md).

## Stack

| Area | In use | Planned |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript | |
| Styling | Tailwind CSS 4 | |
| Tests | Vitest + Testing Library (unit), Playwright (E2E) | |
| CI | GitHub Actions | |
| Database | Prisma 6 (MongoDB provider, schema in `prisma/`) | Models and a live MongoDB connection |
| Auth | | Clerk |
| Images | Cloudinary upload helper (`lib/cloudinary.ts`) | Wiring it into upload forms |
| Try-on model | | Hugging Face Space (OOTDiffusion or CatVTON, not decided yet, see [`docs/phase-0-findings.md`](docs/phase-0-findings.md)) |

## Requirements

- **Node 22.23.2**, pinned in [`.nvmrc`](.nvmrc). Run `fnm use` or `nvm use` in the project. fnm can switch automatically on `cd` if it's set up with `--use-on-cd`.
- npm (comes with Node).

## Getting started

```bash
git clone https://github.com/AkshayChavhan/mirror-ai.git
cd mirror-ai
npm ci
npm run dev
```

Then open http://localhost:3000.

For E2E tests, install Playwright's browser once:

```bash
npx playwright install chromium
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen && tsc --noEmit` (works on a fresh clone) |
| `npm test` | Vitest unit tests, run once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright E2E tests against a production build on port 3100 |

## How work happens

- Each task in [`docs/task-list.md`](docs/task-list.md) gets its own branch (`NN_task_name`), a learning doc, and tests.
- Every PR into `main`, and `main` itself after each merge, runs CI: lint, typecheck, unit tests, and E2E tests, which include the build.
- `main` is protected. Changes arrive only through PRs, and only after CI passes. PRs use GitHub **auto-merge**, so they merge themselves once CI is green.
- Rules for AI-assisted work (Claude Code) are in [`CLAUDE.md`](CLAUDE.md).

## Docs

- [`docs/task-list.md`](docs/task-list.md): all tasks and their status.
- [`docs/learning/`](docs/learning/): step-by-step notes for every task.
- [`docs/phase-0-findings.md`](docs/phase-0-findings.md): research on try-on models and package versions.
