# 70 Harden try-on studio tests

**Branch:** `70_harden_tryon_studio_tests` (starts from `main`)
**Goal:** make `app/tryon/TryOnStudio.test.tsx` pass reliably under heavy CPU load (it failed once while the machine was busy).
- Approved by the developer on 2026-10-01.
- Test-only change, no new packages.

## 1. Branch and setup

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #69 (task 69). I waited for its merge, because rows 69 and 70 are adjacent lines in the task list.

```bash
git checkout -b 70_harden_tryon_studio_tests
```
**Why:** new task, new branch.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 (`.nvmrc`) in a shell where `fnm` isn't on the PATH.

## 2. Reproduce first

- The past failure (found in the session log): "puts the try-on in the address, so a refresh keeps the loading screen" failed once during a full `npm test`, then passed alone.
- **A stress script** runs the file many times while busy loops compete for the CPU (8 cores here). The `trap` kills the busy loops on exit, even after an error or Ctrl-C:

```bash
cat > <scratch>/stress-studio.sh <<'EOF'
#!/bin/bash
# Usage: stress-studio.sh <runs> <busy-processes>
cd <project> || exit 1
RUNS=${1:-10}; LOAD=${2:-16}; pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT INT TERM
for _ in $(seq 1 "$LOAD"); do (while :; do :; done) & pids+=($!); done
pass=0; fail=0
for i in $(seq 1 "$RUNS"); do
  out=$(npx vitest run app/tryon/TryOnStudio.test.tsx 2>&1)
  if echo "$out" | grep -q "Tests .*failed"; then fail=$((fail + 1)); echo "run $i: FAILED"; echo "$out" | grep -E " × |Error:|Unable to find" | head -6
  else pass=$((pass + 1)); echo "run $i: passed"; fi
done
echo "RESULT: $pass passed, $fail failed (load: $LOAD busy processes)"
EOF
```
**Why:** saves the script (`<scratch>` is any temporary folder, `<project>` the repo). It isn't committed, since it's a measuring tool for this task.

```bash
bash <scratch>/stress-studio.sh 15 16; pgrep -f stress-studio.sh | wc -l
```
**Why:** 15 runs with 16 busy processes (twice the cores), then a check that nothing is left running (`0`).
- **Search for the script's name, not the loop's text.** A loop started with `(while :; do :; done) &` is a copy of the script's shell, and its command line is the script's. My first check, `pgrep -f 'while :; do :; done'`, **could never find one**. The rules-reviewer caught this, and the next command proves it.

```bash
printf '%s\n' '(while :; do :; done) & pid=$!' 'trap "kill $pid" EXIT' 'sleep 4' > <scratch>/one-loop.sh && bash <scratch>/one-loop.sh & sleep 1; pgrep -f 'while :; do :; done' | wc -l; pgrep -f one-loop.sh | wc -l; wait
```
**Why:** runs one busy loop for 4 seconds inside a script (its `trap` kills the loop on exit) and counts it both ways while it runs. The loop's text always gives `0`. The script's name gives a non-zero count (`2` or `3` in my runs: the script, its loop, and sometimes the shell this line was typed in, whose own command line contains the name).

```bash
pgrep -fl one-loop.sh
```
**Why:** run on its own afterwards, it lists each match with its command line, so a match on your own shell can't be mistaken for a leftover. It listed nothing.
- **Before the fix: `13 passed, 2 failed`**, in three different tests:
  - "never goes back to a dismissed try-on…": `Unable to find … "Try again"`, after only 379 ms;
  - "when it's slow…": the status text was wrong, after only 176 ms;
  - "when it can't be checked any more…": a `waitFor` timed out at 1,072 ms. This turned out to be a **knock-on failure** from the one before it (section 3).

## 3. The cause

- The studio starts a try-on in **`startTransition`** (an action called outside a `<form>` must run in one). React renders a transition in **small slices it can pause**, so under load there can be a gap between **rendering** (when the mocked `useTryOnStatus` hook is called with the new id) and **updating the page**.
- The tests waited for `m.useTryOnStatus` to be **called** with the id, then checked the page straight away. Under load, the call had happened but the page hadn't changed yet. That's why two failures came after only 176 and 379 ms: not timeouts, a race.
- **The third failure was a leak between tests.**
  - "never goes back…" queues two `mockResolvedValueOnce` results on `createTryOnAction`. When it failed early, the second one (an upload error) was still queued, and the next test, "when it can't be checked any more…", received it.
  - In Vitest 5.0.2, `vi.clearAllMocks()` (in `afterEach`) runs `mockClear`, which **keeps queued "once" results**; only `mockReset` empties them (`node_modules/@vitest/spy/dist/index.js`). Found by the rules-reviewer.

## 4. The fix (`app/tryon/TryOnStudio.test.tsx` only)

- A `watching(id)` helper waits for something that happens **only after the page was updated**: the component writes `?tryon=<id>` to the address in an **effect**, and effects run after the update. Then it checks the hook's last call.
- `startTryOn()` and the "never goes back…" test (try-on B) now use it, instead of waiting on the hook call.
- "puts the try-on in the address…" now just checks the address, because `startTryOn()` already waited for it.
- `beforeEach` first runs `mockReset()` on every mock, then sets the defaults, so nothing queued by one test can reach the next.
- **Trade-off:** every loading-screen test now waits on the address. If writing the address ever broke, they would all fail with an address message. A visible signal (for example, the photo choices becoming disabled) would also work as the wait point.
- **No timeouts were raised.** After the fix, the 1-second waits held under three times the load (below), so a bigger limit would only hide future problems.

```bash
npx vitest run app/tryon/TryOnStudio.test.tsx
```
**Why:** the file normally: `23 passed`.

```bash
cp app/tryon/TryOnStudio.test.tsx <scratch>/studio.bak && sed -i '' 's|      fireEvent.click(screen.getByRole("button", { name: "Try again" })); // dismiss B|      throw new Error("planted early failure");|' app/tryon/TryOnStudio.test.tsx && npx vitest run app/tryon/TryOnStudio.test.tsx; cp <scratch>/studio.bak app/tryon/TryOnStudio.test.tsx
```
**Why:** proves the leak. It plants an early failure in "never goes back…" (after try-on B starts, so the second queued result is still there), runs the file, and restores it.
- **Without the `mockReset` fix** (run it with the `for (const fn of Object.values(m)) fn.mockReset();` line in `beforeEach` deleted, as it was before the fix): 2 failed, the planted one plus "when it can't be checked any more…" at 1,028 ms, the same signature as the stress run's 1,072 ms.
- **With the fix:** only the planted one fails.

```bash
bash <scratch>/stress-studio.sh 15 16; bash <scratch>/stress-studio.sh 25 24
```
**Why:** after the race fix, `15 passed, 0 failed` with 16 busy processes, and `25 passed, 0 failed` with 24 (three times the cores, each run 10–17 s instead of about 4 s). The leftover check after those two used the blind pattern; the reviewer's `ps` listing showed nothing left.

```bash
bash <scratch>/stress-studio.sh 15 16; pgrep -f stress-studio.sh | wc -l
```
**Why:** after the `mockReset` fix too: `15 passed, 0 failed`, and the corrected check shows `0` left running.

```bash
npm run build && { npm run lint; echo "lint exit code: $?"; }
```
**Why:** build, then lint after it (task 64's ESLint ignore for the copied MediaPipe files): `lint exit code: 0`. The braces make the echo report lint's own exit code. In the older form (`… && npm run lint; echo …`), a failed build would have printed the build's code under the "lint" label (found in review).

```bash
npm run typecheck && npm test
```
**Why:** `Test Files 61 passed`, `Tests 781 passed` (the same count: no tests added or removed).

```bash
npm run test:e2e 2>&1 | grep -v -i "clerk_db_jwt\|FAPI request"
```
**Why:** the whole E2E suite: `31 passed, 11 skipped` (the skipped specs need CI's seeded database). Unchanged code, so this checks nothing else broke.

```bash
bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the git-safety hook's tests: `Failures: 0`.

## 5. Commit, publish, PR, auto-merge

```bash
git add app/tryon/TryOnStudio.test.tsx docs/task-list.md docs/learning/70_harden_tryon_studio_tests.md
```
**Why:** stages this task's files.

```bash
git commit -m "70_harden_tryon_studio_tests Wait for the page, not the hook call, in studio tests"
```
**Why:** saves the snapshot.

```bash
git push -u origin 70_harden_tryon_studio_tests
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 70_harden_tryon_studio_tests --title "70_harden_tryon_studio_tests Wait for the page, not the hook call, in studio tests" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **Reproduce a flaky test before fixing it.** Without the stress runs, "raise the timeout" looked like the fix. The failures at 176 and 379 ms showed a race instead.
- **Wait for what the user sees (or an effect), not for a mock called during render.** With transitions or concurrent rendering, a render-time call doesn't mean the page has changed.
- **Busy loops in the background need a `trap`** to kill them, or a failed run leaves the CPU pinned. Check afterwards with `pgrep -fl <script name>` as a **separate** command: the loops carry the script's command line, not their own text. A count taken in the same command line can include your own shell.
- **`vi.clearAllMocks()` keeps queued `mockResolvedValueOnce` results.** Use `mockReset()` in `beforeEach`, or a test that fails early can make the next one fail too.
- **Test your checks.** A check that can't fail (like my first `pgrep` pattern) gives false confidence, just like a test that can't fail.
- **Other test files may wait on render-time mock calls too.** I left them alone (outside this task's scope); a future task could check them with the same stress script.
