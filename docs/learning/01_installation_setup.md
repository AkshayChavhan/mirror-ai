# 01 Installation setup

**Branch:** `01_installation_setup`
**Goal:** create the Next.js project, get the right Node version working, and record the Phase 0 research.

> The scaffold steps (1–3) were run before these docs existed. They are rebuilt from `package.json` and `docs/phase-0-findings.md`.

## 1. Install the right Node version

```bash
fnm install 22.23.2
```
**Why:** installs Node 22.23.2 using fnm (Fast Node Manager). 22.12.0 is too old: `eslint-visitor-keys@5` needs Node `^22.13.0`.

```bash
fnm use 22.23.2
```
**Why:** switches the current shell to that version.

```bash
node -v
```
**Why:** checks it worked. Expect `v22.23.2`.

## 2. Create the Next.js app

```bash
cd ~/Desktop/Projects/Project
```
**Why:** go to the folder that should contain the new project.

```bash
npx create-next-app@latest mirror-ai --ts --eslint --tailwind --app --no-src-dir --import-alias "@/*" --use-npm
```
**Why:** generates the starter project. Flags:
- `--ts`: TypeScript.
- `--eslint`: linting.
- `--tailwind`: Tailwind CSS 4.
- `--app`: App Router.
- `--no-src-dir`: code lives in `app/`, not `src/app/`.
- `--import-alias "@/*"`: lets you import `@/lib/x` instead of `../../lib/x`.
- `--use-npm`: npm as the package manager.
- If it asks about the React Compiler, answer **No**.

Result: Next.js 16.3.6, React 19.2.8. It also runs `git init` and `npm install`.

```bash
cd mirror-ai
```
**Why:** every later command runs from inside the project folder.

## 3. Connect the GitHub repo

```bash
git remote add origin https://github.com/AkshayChavhan/mirror-ai.git
```
**Why:** links the local repo to GitHub so branches can be pushed later.

```bash
git remote -v
```
**Why:** checks the remote is set.

## 4. Make Node work inside Claude Code (VS Code)

Claude Code sessions launched from VS Code don't load `~/.zshrc`, so fnm isn't active and `node` isn't found. Put this at the start of shell commands there:

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** puts Node 22.23.2 first on `PATH` without needing fnm.

## 5. Check the project works

```bash
npm run dev
```
**Why:** starts the dev server at http://localhost:3000 to confirm the starter page loads. Stop it with `Ctrl+C`.

```bash
npm run lint
```
**Why:** runs ESLint for code problems. No output means it passed.

```bash
npx tsc --noEmit
```
**Why:** type-checks all TypeScript without writing files.

```bash
npm run build
```
**Why:** builds for production. This catches errors the dev server doesn't show.

## 6. Phase 0 research (recorded in `docs/phase-0-findings.md`)

```bash
curl -s https://huggingface.co/api/spaces/zhengchong/CatVTON/runtime
```
**Why:** asks Hugging Face whether a Space is running (`RUNNING`, `RUNTIME_ERROR`, `PAUSED`, …). We checked every CatVTON copy this way, and all were down.

```bash
npm view prisma dist-tags
```
**Why:** shows which version each npm tag points to. `latest` was an RC (8.0.0-rc.17), which is how we found out to pin Prisma 6.19.3.

## 7. Create the task branch

```bash
git checkout -b 01_installation_setup
```
**Why:** creates this task's branch and switches to it. Our rule: never work on `main`.

## 8. Commit (only after the developer approves)

```bash
git add .gitignore AGENTS.md CLAUDE.md README.md app/ public/ docs/phase-0-findings.md docs/learning/01_installation_setup.md eslint.config.mjs next.config.ts package.json package-lock.json postcss.config.mjs tsconfig.json
```
**Why:** stages only this task's files. `git add .` would also pick up the other tasks' work.

```bash
git commit -m "01_installation_setup Scaffold Next.js app and record Phase 0 findings"
```
**Why:** saves the snapshot, using our `<branch_name> <commit_message>` format.

## Gotchas

- **Node not found in Claude Code:** see step 4.
- **Wrong Node version:** with 22.12.0, ESLint dependencies fail. Use 22.23.2.
- **`AGENTS.md` / `CLAUDE.md`:** Next 16's `create-next-app` generates them so AI agents read the bundled Next docs. `next dev` rewrites `AGENTS.md`, so our own rules go in `CLAUDE.md`.
- **`.env*` is git-ignored** by default. Keep secrets there.
