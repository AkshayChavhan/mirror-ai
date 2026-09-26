# 11 Set up Vitest

**Branch:** `11_setup_vitest` (starts from `main`)
**Goal:** a unit-test runner, so every feature from now on ships with tests (our testing rule).

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings local `main` up to date after PR #9 (task 10) merged.

```bash
git checkout -b 11_setup_vitest
```
**Why:** new task, new branch.

## 2. Read the guide and check versions

```bash
cat node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md
```
**Why:** the Next 16 guide lists the packages and config. Vitest can't render `async` Server Components, so those get E2E tests (task 12).

```bash
for p in vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths vite @testing-library/jest-dom; do echo "$p"; npm view $p version engines.node peerDependencies --json; done
```
**Why:** for each package, shows the latest version, the Node versions it supports, and what it needs installed alongside it (peer dependencies). This runs **before** installing, to catch conflicts early.

```bash
npm view vitest@5.0.2 dependencies.vite peerDependenciesMeta --json
```
**Why:** checks whether `vite` comes with Vitest or must be installed separately. `peerDependenciesMeta` shows `vite` as `optional: false` (a required peer) and `@types/node` as an optional peer.

```bash
node -p "require('./node_modules/@types/node/package.json').version"
```
**Why:** shows the installed `@types/node`, which was 20.19.43, too old for Vitest 5's `^22.0.0 || >=24.0.0`.

What that showed:
- Vitest 5 needs `vite` as a **required peer**, meaning it isn't installed automatically, so it's installed explicitly.
- Vitest 5 only accepts `@types/node` 22 or newer. Ours was `^20`, so npm would refuse the install. It was bumped to 22, which also matches our Node.
- `jsdom` 30 needs Node `^22.22.2 || ^24.15.0 || >=26`, so `engines` was tightened to match (see step 6).

## 3. Install the packages (dev only)

```bash
npm install -D vitest@5.0.2 vite@8.3.1 @vitejs/plugin-react@6.1.1 jsdom@30.1.1 @testing-library/react@16.3.3 @testing-library/dom@10.4.2 @testing-library/jest-dom@7.0.1 @types/node@22.20.4 vite-tsconfig-paths@6.1.1
```
**Why:** `-D` saves them as devDependencies, since they're only used for testing and never shipped.

| Package | Version | Role |
|---|---|---|
| `vitest` | 5.0.2 | Test runner |
| `vite` | 8.3.1 | Build tool Vitest runs on (required peer) |
| `@vitejs/plugin-react` | 6.1.1 | Compiles JSX in tests |
| `jsdom` | 30.1.1 | Fake browser DOM for rendering components |
| `@testing-library/react` | 16.3.3 | `render`, and `screen` queries by role or text, like a user |
| `@testing-library/dom` | 10.4.2 | Peer of `@testing-library/react` |
| `@testing-library/jest-dom` | 7.0.1 | Readable checks: `toBeInTheDocument()`, `toHaveTextContent()` |
| `@types/node` | 22.20.4 | Node types, bumped from 20 (Vitest 5 needs 22+) |

`vite-tsconfig-paths@6.1.1` is in the install command above, but it was removed right after (next step), so it isn't in the final table.

```bash
npm uninstall vite-tsconfig-paths
```
**Why:** npm warned `tsconfck@3.1.6: unmaintained` (a dependency of `vite-tsconfig-paths`). Vite 8 has this built in: `resolve.tsconfigPaths: true` (found in `node_modules/vite/dist/node/index.d.ts`). So the package was removed, which means one less dependency.

## 4. Config files

`vitest.config.mts`:
- `plugins: [react()]` compiles JSX.
- `resolve.tsconfigPaths: true` makes `@/...` imports work (Vite 8 built-in).
- `environment: "jsdom"` renders into a fake browser.
- `setupFiles: ["./vitest.setup.ts"]` runs before every test file.
- `exclude: [...configDefaults.exclude, "e2e/**"]` means Playwright specs (task 12) won't be run by Vitest.

`vitest.setup.ts`:
- `import "@testing-library/jest-dom/vitest"` adds the jest-dom checks and their TypeScript types.
- `afterEach(() => cleanup())` unmounts components after each test. Without Vitest globals, Testing Library can't do this itself, and tests would leak into each other.

## 5. Scripts

In `package.json` → `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```
- `npm test` runs once and exits. Use it for the checklist, CI, and the reviewer.
- `npm run test:watch` re-runs on every save, while you work. Plain `vitest` watches by default, which would hang the checklist.

## 6. Tighten `engines`

`"node": "^22.13.0 || >=24"` → `"^22.22.2 || ^24.15.0 || >=26"`.
- jsdom 30 needs 22.22.2+ or 24.15+. Vitest 5 skips Node 25.

```bash
sed -i '' 's/"node": "^22.13.0 || >=24"/"node": "^22.22.2 || ^24.15.0 || >=26"/' package.json
```
**Why:** replaces the range in `package.json`. `-i ''` edits the file in place (macOS `sed` needs the empty `''`).

```bash
python3 -c "import json; p='package-lock.json'; d=json.load(open(p)); d['packages']['']['engines']={'node':'^22.22.2 || ^24.15.0 || >=26'}; open(p,'w').write(json.dumps(d,indent=2,ensure_ascii=False)+'\n')"
```
**Why:** sets the same range in the lock file (`packages[""].engines`), changing nothing else. `npm install --package-lock-only` could also re-resolve unrelated packages (see task 09).

```bash
node -p "['22.21.0','22.22.2','22.23.2','24.14.0','24.15.0','25.0.0','26.0.0'].map(v => v + ':' + require('semver').satisfies(v, '^22.22.2 || ^24.15.0 || >=26')).join(' ')"
```
**Why:** checks the range against sample versions. (`semver` isn't one of our own dependencies; it's installed as a dependency of other packages, so this only works while npm keeps it at the top of `node_modules`.) Got `22.21.0:false 22.22.2:true 22.23.2:true 24.14.0:false 24.15.0:true 25.0.0:false 26.0.0:true`.

## 7. Sample test

`app/page.test.tsx`, colocated next to `app/page.tsx`:
- The home page renders its `h1` heading text.
- The "Documentation" link points to `nextjs.org/docs`.
- Task 15 replaces the starter page, and updates this test with it.

## 8. Tests of the setup

```bash
npm test
```
**Why:** runs all tests once. Got `Test Files 1 passed`, `Tests 2 passed`.

```bash
cat > app/planted.test.tsx <<'EOF'
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import Home from "@/app/page";
it("resolves the @/ alias", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
});
it("fails on purpose", () => {
  expect(1 + 1).toBe(3);
});
EOF
```
**Why:** creates a temporary test file with two tests: one checks that the `@/` import works, and one fails on purpose.

```bash
npm test
```
**Why:** proves failures are reported. Got `AssertionError: expected 2 to be 3`, `1 failed | 3 passed`, exit 1. The `@/` import test passed, so the built-in alias works.

```bash
rm app/planted.test.tsx
```
**Why:** removes the planted tests. `npm test` passes again (exit 0).

```bash
npm ci --dry-run
```
**Why:** checks that `package-lock.json` still matches `package.json`.

```bash
npm run lint && npm run typecheck && npm run build && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** end-of-task checklist. Typecheck also accepts `toHaveTextContent`, because `vitest.setup.ts` loads jest-dom's types.

## 9. Commit, push, PR

```bash
git add package.json package-lock.json vitest.config.mts vitest.setup.ts app/page.test.tsx docs/learning/11_setup_vitest.md docs/task-list.md
```
**Why:** stages only this task's files.

```bash
git commit -m "11_setup_vitest Add Vitest + Testing Library with a sample page test"
```
**Why:** saves the snapshot.

```bash
git push -u origin 11_setup_vitest
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 11_setup_vitest --title "..." --body-file <file>
```
**Why:** opens the PR.

## Gotchas

- **Read the lock file diff properly.** `git diff --stat` showed about 5,200 insertions and 3,450 deletions, which looked alarming.
  ```bash
  git show HEAD:package-lock.json > /tmp/lock-old.json
  ```
  **Why:** saves the committed (old) lock file so it can be compared with the new one.
  ```bash
  python3 -c "import json; o=json.load(open('/tmp/lock-old.json'))['packages']; n=json.load(open('package-lock.json'))['packages']; print('removed', [k for k in o if k not in n]); print('added', len([k for k in n if k not in o])); print('changed', [k for k in o if k in n and o[k].get('version') != n[k].get('version')])"
  ```
  **Why:** compares the package lists directly. Got 0 removed, 109 added, and 1 changed (`@types/node`). The big "deletions" came from how git lines up new entries inserted between old ones.
  ```bash
  git diff --stat --diff-algorithm=patience package-lock.json
  ```
  **Why:** a smarter diff algorithm shows the real change: 1,764 insertions and 6 deletions.
- **Peer dependencies:** an optional peer that's already installed at the wrong version (`@types/node` 20) still blocks npm. Check `peerDependencies` before installing.
- **`vitest` vs `vitest run`:** watch mode never exits. Scripts used by tools must use `run`.
