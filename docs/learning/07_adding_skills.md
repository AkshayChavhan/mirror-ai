# 07 Adding skills

**Branch:** `07_adding_skills` (starts from `main`)
**Goal:** add Claude Code skills that make Claude verify, debug properly, design well, and never run destructive git.

## 0. Before this task: creating `main` and PRs for 02–06

```bash
git branch main 01_installation_setup
```
**Why:** `main` didn't exist yet. This creates it, pointing at task 01's commit.

```bash
git remote set-url origin https://AkshayChavhan@github.com/AkshayChavhan/mirror-ai.git
```
**Why:** the Mac keychain held a login for another GitHub account (`akshayvchavh`), which got a 403. Putting the username in the URL makes git use the `AkshayChavhan` login.

```bash
gh auth login
```
**Why:** logs the GitHub CLI in as `AkshayChavhan` (browser sign-in). `gh` is used to open PRs. The developer ran this in their own terminal.

```bash
git push -u origin main
```
**Why:** publishes `main`. `-u` makes local `main` track `origin/main`. The developer ran this, because it needed their login.

```bash
git -c credential.helper= -c credential.helper='!gh auth git-credential' push -u origin 02_adding_rules_for_learning_document
```
**Why:** publishes a task branch so it can get a PR. The `-c` options make git use `gh`'s login for this one command only, without changing any settings. The same was done for 03–06, one at a time after each merge.

```bash
gh auth setup-git
```
**Why (optional, not run yet):** makes plain `git push` use `gh`'s login permanently, so the `-c` options aren't needed.

```bash
gh pr create --base main --head 02_adding_rules_for_learning_document --title "..." --body "..."
```
**Why:** opens a PR into `main`. The developer reviews and merges it on GitHub.

```bash
git fetch origin
```
**Why:** downloads the new `main` after a merge.

```bash
git checkout main && git merge --ff-only origin/main
```
**Why:** moves local `main` up to GitHub's `main`. `--ff-only` refuses if the two have diverged, so nothing gets overwritten.

## 1. Create the task branch

```bash
git checkout -b 07_adding_skills
```
**Why:** new task, new branch, starting from the up-to-date `main`.

## 2. Read the skills before installing

```bash
gh api "repos/obra/superpowers/git/trees/HEAD?recursive=1" --jq '.tree[].path'
```
**Why:** lists every file in the repo, to find the skill folders. The same was done for `mattpocock/skills` and `anthropics/skills`.

```bash
gh api repos/obra/superpowers/contents/skills/verification-before-completion/SKILL.md -H "Accept: application/vnd.github.raw" > SKILL.md
```
**Why:** downloads one file's raw text into a scratch folder, not the project, so it can be read before installing. Repeated for each file.

- Every file was read before install. They contain only instructions, plus two small scripts: `find-polluter.sh` only runs `npm test`, and the hook only reads the command and blocks it.
- Licenses: superpowers and mattpocock are MIT. frontend-design is Apache 2.0. Each license file is kept next to its skill.

## 3. Install the skills into the project

```bash
mkdir -p .claude/skills/systematic-debugging .claude/skills/verification-before-completion .claude/skills/frontend-design .claude/hooks
```
**Why:** Claude Code loads project skills from `.claude/skills/<name>/SKILL.md`. Keeping them in the repo means every session and every clone gets them.

```bash
cp <scratch>/systematic-debugging/{SKILL.md,root-cause-tracing.md,defense-in-depth.md,condition-based-waiting.md,condition-based-waiting-example.ts,find-polluter.sh} .claude/skills/systematic-debugging/
```
**Why:** copies the skill and the files its `SKILL.md` refers to. The author's own test files (`test-pressure-*.md`, `CREATION-LOG.md`) are left out because nothing refers to them.

```bash
chmod +x .claude/skills/systematic-debugging/find-polluter.sh
```
**Why:** makes the script runnable.

| Skill | Source | What it makes Claude do |
|---|---|---|
| `verification-before-completion` | obra/superpowers | Run the command that proves a claim, and read its output, before saying "done" |
| `systematic-debugging` | obra/superpowers | Find the root cause before any fix. After 3 failed fixes, stop and question the design |
| `frontend-design` | anthropics/skills | Avoid tell-tale AI-generated page patterns; plan palette, type, and layout first |
| `skill-creator` | anthropics/skills | **Not installed:** it's already available as `anthropic-skills:skill-creator` |

## 4. Git guardrails hook

`git-guardrails-claude-code` (mattpocock/skills) is a **PreToolUse hook**. Claude Code runs it before every Bash command, and exit code `2` blocks the command. Only the hook script is installed, not the setup skill.

- `.claude/hooks/block-dangerous-git.sh`, based on the original script, with one project change: `git push -u origin NN_task_branch` is allowed, so Claude can still push task branches for PRs.
- It blocks:
  - pushes to `main` or any other push
  - `--force` / `-f` / `--force-with-lease`
  - `--delete`
  - `reset --hard`
  - `clean -f`
  - `branch -D`
  - `checkout .` / `restore .`
- `.claude/settings.json` registers it under `hooks.PreToolUse` with matcher `Bash`.

```bash
chmod +x .claude/hooks/block-dangerous-git.sh
```
**Why:** Claude Code runs the hook as a program, so it must be executable.

```bash
jq --version
```
**Why:** the hook uses `jq` to read the command from the JSON Claude Code sends it. macOS ships `jq`.

## 5. Tests

```bash
bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** feeds 17 sample commands to the hook and checks each is blocked (exit 2) or allowed (exit 0). Expect `Failures: 0`.

```bash
git branch -D zz_does_not_exist
```
**Why:** a live test. If the hook is active, Claude Code refuses to run it (`BLOCKED: ... 'git branch -D'`). If it's not active, git just says the branch doesn't exist, so nothing is harmed.

```bash
npm run lint && npx tsc --noEmit && npm run build
```
**Why:** end-of-task checklist. TypeScript skips the dot-folder `.claude/`, so the skill's example `.ts` file doesn't affect the build.

## 6. Commit, push, PR

```bash
git add .claude docs/learning/07_adding_skills.md docs/task-list.md
```
**Why:** stages only this task's files.

```bash
git commit -m "07_adding_skills Add verification, debugging, frontend-design skills and git guardrail hook"
```
**Why:** saves the snapshot in our format.

```bash
git push -u origin 07_adding_skills
```
**Why:** publishes the branch. The hook allows this because it's a task branch.

```bash
gh pr create --base main --head 07_adding_skills
```
**Why:** opens the PR for the developer to review and merge.

## Gotchas

- **zsh `path` variable:** in zsh, `path` is linked to `PATH`. Naming a shell variable `path` wipes out `PATH`, and then every command is "not found". Use another name, such as `src`.
- **Hook matches text, not intent:** any Bash command containing a blocked pattern is refused, even inside an `echo` or a message. Reword it, or ask the developer to run it.
- **The hook applies to Claude only.** You can still run any git command yourself in the terminal.
- **Project skills may need a new session** before they show up in Claude Code's skill list.
