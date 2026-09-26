# 09 Pin the Node version

**Branch:** `09_pin_node_version` (starts from `main`)
**Goal:** everyone, including Claude, uses the right Node, and npm complains if they don't.

## 1. Create the branch

```bash
git checkout -b 09_pin_node_version
```
**Why:** new task, new branch, from the up-to-date `main`.

## 2. Find the real minimum Node version

```bash
find node_modules -path '*eslint-visitor-keys/package.json'
```
**Why:** there are several copies of this package at different versions. We need the one that broke on 22.12.0.

```bash
node -p "require('./node_modules/@typescript-eslint/visitor-keys/node_modules/eslint-visitor-keys/package.json').engines.node"
```
**Why:** prints the Node range a package supports. `eslint-visitor-keys@5.0.1` needs `^20.19.0 || ^22.13.0 || >=24`, the strictest in the project. Next 16 only needs `>=20.9.0`.

## 3. Add `.nvmrc`

```bash
printf '22.23.2\n' > .nvmrc
```
**Why:** `.nvmrc` holds the exact Node version for the project. fnm and nvm both read it. Your `~/.zshrc` runs `fnm env --use-on-cd`, so `cd mirror-ai` now switches to 22.23.2 automatically.

## 4. Add `engines` to `package.json`

```json
"engines": {
  "node": "^22.13.0 || >=24"
}
```
- `.nvmrc` = the exact version we use.
- `engines` = the range that works: 22.13+ on the 22 line, or 24+. **Not** plain `>=22.13.0`, because that would allow Node 23, which `eslint-visitor-keys@5` doesn't support. (The rules-reviewer caught this.)
- With the wrong Node, `npm install` warns `EBADENGINE`. It fails outright only with `--engine-strict`.

## 5. Keep `package-lock.json` in sync

npm copies the root `engines` into the lock file (`packages[""].engines`).

```bash
npm install --package-lock-only
```
**Why:** updates only the lock file, without touching `node_modules`. But it also added 6 unrelated optional Tailwind WebAssembly entries, because this npm resolves slightly differently from the one that created the lock file.

```bash
git restore package-lock.json
```
**Why:** throws that noisy change away, to stay in scope.

Then add **only** the `engines` block by hand. In `package-lock.json`, under `"packages": { "": { ... } }`, after `devDependencies`:

```json
"engines": {
  "node": "^22.13.0 || >=24"
}
```
- It must match `package.json` exactly. The diff is 3 lines.

```bash
npm ci --dry-run
```
**Why:** `npm ci` refuses to run if the lock file and `package.json` disagree. A dry run checks that without installing.

## 6. Tests

```bash
fnm use
```
**Why:** with no version given, fnm reads `.nvmrc`. It printed `Using Node v22.23.2`.

```bash
PATH="$HOME/.local/share/fnm/node-versions/v22.12.0/installation/bin:$PATH" npm install --dry-run --engine-strict
```
**Why:** runs npm with the **old** Node 22.12.0. Expected and got: `EBADENGINE ... Required: {"node":"^22.13.0 || >=24"} Actual: v22.12.0`, exit 1.

```bash
PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH" npm install --dry-run --engine-strict
```
**Why:** the same command with the pinned Node 22.23.2 passes, exit 0.

```bash
node -p "['22.12.0','22.13.0','23.1.0','24.0.0'].map(v => v + ':' + require('semver').satisfies(v, '^22.13.0 || >=24')).join(' ')"
```
**Why:** checks the range against sample versions, using npm's own `semver` package. Got `22.12.0:false 22.13.0:true 23.1.0:false 24.0.0:true`.

```bash
npm run lint && npx tsc --noEmit && npm run build && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** end-of-task checklist.

## 7. Commit, push, PR

```bash
git add .nvmrc package.json package-lock.json docs/learning/09_pin_node_version.md docs/task-list.md
```
**Why:** stages only this task's files.

```bash
git commit -m "09_pin_node_version Pin Node 22.23.2 with .nvmrc and engines"
```
**Why:** saves the snapshot.

```bash
git push -u origin 09_pin_node_version
```
**Why:** publishes the branch for the PR.

```bash
gh pr create --base main --head 09_pin_node_version --title "..." --body-file <file>
```
**Why:** opens the PR for review.

## Gotchas

- **Several copies of one package:** `node_modules` can hold several versions of the same package, nested under whoever needs them. Check the nested ones too.
- **`npm install --package-lock-only` can add unrelated changes** when your npm version differs. Always read the lock file diff.
- **`engines` alone only warns.** A strict failure needs `--engine-strict` or `engine-strict=true` in `.npmrc`, which isn't done here because it's outside this task's scope.
