# 69 Handle camera track ended

**Branch:** `69_handle_camera_track_ended` (starts from `main`)
**Goal:** on `/tryon`, if the camera stops mid-session (unplugged, or access turned off in the browser), show a message and disable **Take photo**, so a frozen last frame can't be saved as the user's photo.
- Approved by the developer on 2026-10-01.
- The row says "the /tryon camera". **Live 3D** (task 66) came later and uses the camera on the same page with the same risk, so it's covered too.
- No new packages.

## 1. Branch and setup

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** starts from the latest `main`, which includes PR #68 (task 68).
- I waited for PR #68 to merge first: rows 68 and 69 sit on adjacent lines of `docs/task-list.md`, and Git treats edits to adjacent lines on two branches as a conflict.

```bash
git checkout -b 69_handle_camera_track_ended
```
**Why:** new task, new branch.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 (`.nvmrc`) in a shell where `fnm` isn't on the PATH.

## 2. How it works

- **The browser's signal:** a camera's `MediaStreamTrack` fires **`ended`** when its source goes away (unplugged, permission revoked, the device sleeping). Browsers **don't** fire it for the app's own `track.stop()` (Cancel, Take photo, leaving), so listening for it catches exactly the unexpected stops.
- **`app/tryon/CameraCapture.tsx`:**
  - `whenCameraStops(stream, onStopped)` adds a one-time `ended` listener to each track, and is exported for Live 3D;
  - `CAMERA_STOPPED` is the shared message: "Your camera stopped (was it unplugged, or was access turned off?). Cancel and try again, or choose a photo instead.";
  - on `ended` it stops the camera, clears `streamRef` and sets the message as a **start error**, which disables Take photo (Cancel still works);
  - clearing `streamRef` also **drops a photo that was still being encoded**, since it could be the frozen frame (the `toBlob` callback already ignores a closed camera);
  - **the first message stays** here too: if showing the picture then fails, `setStartError((earlier) => earlier ?? …)` keeps "Your camera stopped" instead of "We couldn't show your camera" (made consistent with Live 3D after the rules review).
- **`app/tryon/live/LiveTryOn.tsx`:**
  - on `ended` it calls the existing `fail(CAMERA_STOPPED)`: it stops the camera, frees the tracker, shows the alert, and disables Take photo. The frame loop stops by itself, because it needs the tracker.
  - **A `failed` flag** fixes two ordering cases:
    - the camera stops **while MediaPipe is still loading**: when the tracker arrives later, it's freed instead of starting Live 3D with a dead camera;
    - **the first failure's message stays**: if starting the video then fails too, it doesn't replace "Your camera stopped" with "Live 3D isn't available".

## 3. Tests

- **The fake track** in both test files is now `Object.assign(new EventTarget(), { stop: vi.fn() })`, new for each test, so a test can fire a real `ended` event (`track.dispatchEvent(new Event("ended"))`). The old `{ stop }` object had no `addEventListener`.
- **`app/tryon/CameraCapture.test.tsx`:**
  - the camera stopping shows the message, disables Take photo (a click captures nothing), and leaves Cancel usable;
  - a photo being encoded when the camera stops is dropped;
  - stopping, then `play()` failing: the camera message stays (added after the review).
  - I removed another test, "ignores a camera that stops after it was closed", because **it couldn't fail**: React 19 silently ignores state updates after unmount, so it passed with or without the guard.
- **`app/tryon/live/LiveTryOn.test.tsx`:**
  - the camera stopping shows the message, disables Take photo, frees the tracker, and stops drawing (the queued frame draws nothing and no new frame is asked for);
  - stopping while MediaPipe loads: the late tracker is freed, the scene never starts, and the message stays;
  - stopping, then the video's `play()` failing: the camera message stays;
  - a photo being encoded when the camera stops is dropped (added after the review).

```bash
npx vitest run app/tryon/CameraCapture.test.tsx app/tryon/live/LiveTryOn.test.tsx
```
**Why:** this task's tests while building: `42 passed`, then `44` after the review's two tests.

```bash
mutate() { cp "$1" <scratch>/mutant.bak && sed -i '' "$2" "$1" && npx vitest run ${=3}; cp <scratch>/mutant.bak "$1"; }
```
**Why:** the mutation helper from task 67. `${=3}` is **zsh** for "split this argument on spaces": the first try used `$3`, and zsh passed both test files as one filename, so Vitest found no tests and printed nothing. **No output isn't a pass:** check that test results actually appear.

```bash
mutate app/tryon/CameraCapture.tsx 's/  for (const track of stream.getTracks()) track.addEventListener("ended", onStopped, { once: true });/  void stream; void onStopped;/' "app/tryon/CameraCapture.test.tsx app/tryon/live/LiveTryOn.test.tsx"
```
**Why:** mutation 1, never listening: all 7 new tests fail, in both components (rerun after the review's two tests were added; it was 5 of 5 before).

```bash
mutate app/tryon/CameraCapture.tsx '/        streamRef.current = null; \/\/ a photo being made right now is dropped/d' "app/tryon/CameraCapture.test.tsx app/tryon/live/LiveTryOn.test.tsx"
```
**Why:** mutation 2, keeping the camera "open" after it stopped: "drops a photo that was being made…" fails, because the frozen frame was handed over.

```bash
mutate app/tryon/live/LiveTryOn.tsx 's/        if (closed || failed) return loadedTracker.close();/        if (closed) return loadedTracker.close();/' "app/tryon/CameraCapture.test.tsx app/tryon/live/LiveTryOn.test.tsx"
```
**Why:** mutation 3: Live 3D starts with a dead camera, and "stops while MediaPipe is loading" fails.

```bash
mutate app/tryon/live/LiveTryOn.tsx 's/      if (closed || failed) return;/      if (closed) return;/' "app/tryon/CameraCapture.test.tsx app/tryon/live/LiveTryOn.test.tsx"
```
**Why:** mutation 4: a later failure overwrites the message, and "keeps the camera message…" fails.

```bash
mutate app/tryon/CameraCapture.tsx 's/setStartError((earlier) => earlier ?? "We couldn/setStartError(() => "We couldn/' "app/tryon/CameraCapture.test.tsx app/tryon/live/LiveTryOn.test.tsx"
```
**Why:** mutation 5: the photo camera's later message overwrites the first, and "keeps the camera-stopped message…" fails.
- The first run of this one was interrupted when the Mac went to sleep (the job was later killed at its time limit). In its output, Vitest also timed an unrelated test at 983,633 ms (about 16 minutes) and reported it failing: that was the sleep, not a real failure. I checked that no planted bug was left in the files, then reran it: only the expected test failed.

```bash
mutate app/tryon/live/LiveTryOn.tsx '/        if (!streamRef.current) return; \/\/ closed while the photo was being made/d' "app/tryon/CameraCapture.test.tsx app/tryon/live/LiveTryOn.test.tsx"
```
**Why:** mutation 6: Live 3D hands over the photo being made, and its "drops a photo…" test fails. Every file was restored afterwards.

```bash
npm run build && npm run lint; echo "lint exit code: $?"
```
**Why:** build, then lint after it (task 64's ESLint ignore for the copied MediaPipe files): `lint exit code: 0`.

```bash
npm run typecheck && npm test
```
**Why:** `Test Files 61 passed`, `Tests 781 passed` (7 new).

```bash
npm run test:e2e 2>&1 | grep -v -i "clerk_db_jwt\|FAPI request"
```
**Why:** the whole E2E suite: `31 passed, 11 skipped` (the skipped specs need CI's seeded database). The row asks for unit tests only: Chromium's fake camera can't be unplugged mid-test, and `track.stop()` doesn't fire `ended`.

```bash
bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the git-safety hook's tests: `Failures: 0`.

## 4. Commit, publish, PR, auto-merge

```bash
git add app/tryon/CameraCapture.tsx app/tryon/CameraCapture.test.tsx app/tryon/live/LiveTryOn.tsx app/tryon/live/LiveTryOn.test.tsx docs/task-list.md docs/learning/69_handle_camera_track_ended.md
```
**Why:** stages this task's files.

```bash
git commit -m "69_handle_camera_track_ended Stop offering Take photo when the camera stops"
```
**Why:** saves the snapshot.

```bash
git push -u origin 69_handle_camera_track_ended
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 69_handle_camera_track_ended --title "69_handle_camera_track_ended Stop offering Take photo when the camera stops" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **`ended` means "stopped by itself".** It doesn't fire for your own `track.stop()`, so it needs no extra bookkeeping to tell the two apart.
- **Async start-up needs a "first failure wins" flag.** Anything that finishes later (a tracker, a rejected `play()`) must check it, or it can undo the error state.
- **A test that can't fail is worse than none.** Check what a test would do without the code it guards (mutation checks do this).
- **zsh doesn't split unquoted variables.** Use `${=var}` (or separate arguments) when a variable holds several file names.
- **After an interrupted mutation run, check the source first.** A killed run can leave the planted bug in place. Look for the original line (or restore from the backup) before doing anything else.
- **Adjacent-line edits conflict in Git.** Wait for the previous task's merge before branching when both tick neighbouring task-list rows.
