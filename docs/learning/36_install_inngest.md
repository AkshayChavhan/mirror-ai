# 36 Install Inngest

**Branch:** `36_install_inngest` (starts from `main`)
**Goal:** add Inngest (background jobs) and create the client plus the first typed event, `tryon/requested`, which tasks 38–39 will send and handle.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #35 (task 35, the landing page).

```bash
git checkout -b 36_install_inngest
```
**Why:** new task, new branch. `inngest@4.21.0` is pre-approved (named in the task list).

## 2. Check the package before installing

```bash
npm view inngest@4.21.0 version engines.node peerDependencies --json
```
**Why:** it needs Node ≥20, and lists many peers: `next`, `react`, `zod`, `typescript >=5.8`, and so on.

```bash
npm view inngest dist-tags.latest
```
**Why:** `4.21.0` is also the latest (published 2026-09-22).

```bash
npm view inngest@4.21.0 peerDependenciesMeta --json
```
**Why:** checks which peers are optional. All are optional **except `zod`**. A required peer is auto-installed by npm, so this needed checking.

```bash
npm view inngest@4.21.0 dependencies --json
```
**Why:** `zod` is also one of inngest's **own dependencies**, so it arrives indirectly, and our `package.json` gets nothing unapproved.

```bash
node -p "require('typescript/package.json').version"
```
**Why:** we have TypeScript 5.9.3, which meets the `>=5.8` peer.

## 3. Install

```bash
npm install inngest@4.21.0
```
**Why:** a normal dependency (the server sends events and serves functions).

| Package | Version | Type |
|---|---|---|
| `inngest` | 4.21.0 | dependency |

```bash
git show HEAD:package-lock.json > /tmp/lock-old.json
```
**Why:** saves the old lock file for comparison.

```bash
python3 -c "import json; o=json.load(open('/tmp/lock-old.json'))['packages']; n=json.load(open('package-lock.json'))['packages']; print('removed', [k for k in o if k not in n]); print('added', len([k for k in n if k not in o]))"
```
**Why:** 0 removed, **0 version changes**, and **200 added**. (26 existing entries changed only their `dev` flag, because inngest now reaches packages like `debug` and `ms` at runtime.) That's heavy, mostly OpenTelemetry tracing packages that inngest uses for observability. Only `inngest` itself is in our `package.json`.

```bash
npm audit
```
**Why:** nothing new, only the existing Prisma CLI findings.

## 4. Read the installed version's API (v4)

```bash
grep -v '^$' node_modules/inngest/README.md | head -60
```
**Why:** in v4, `createFunction({ id, triggers: [{ event }] }, handler)` takes the **trigger inside the options**. Older (v3) tutorials pass it as a separate argument.

```bash
sed -n 885,1060p node_modules/inngest/types.d.ts
```
**Why:** the client options: `id` (required), `eventKey` (sends events to Inngest Cloud), `isDev`, and `signingKey` (defaults to `INNGEST_SIGNING_KEY`).

```bash
grep -n -B30 'declare function eventType' node_modules/inngest/components/triggers/triggers.d.ts
```
**Why:** v4's typed events are **`eventType(name, { schema })`**. `staticSchema<T>()` gives TypeScript types **without a validation library**; the docs say it's for "type safety without pulling in … Zod".

## 5. `lib/inngest.ts`

```ts
export const inngest = new Inngest({ id: "mirror-ai" });
export const tryOnRequested = eventType("tryon/requested", {
  schema: staticSchema<{ tryOnId: string }>(),
});
```
- **Production:** sending events uses `INNGEST_EVENT_KEY`, and Inngest calls our route (task 37) signed with `INNGEST_SIGNING_KEY`. Both are already in `.env.example` (task 19).
- **Locally:** the Inngest dev server needs neither (task 37).

## 6. Tests: `lib/inngest.test.ts`

Node env, no network. It checks:
- the client is an Inngest client with id `mirror-ai`;
- the event name is `tryon/requested`;
- `tryOnRequested.create({ tryOnId })` builds a typed payload;
- **a compile-time check:** `// @ts-expect-error` on a wrong payload (`{ productId }`), with a comment explaining why. If the types stopped working, `npm run typecheck` would fail on the now-unused directive.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** `Tests 161 passed` (4 new).

```bash
cp lib/inngest.ts /tmp/inngest.bak
```
**Why:** saves the good file before planting a bug.

```bash
sed -i '' 's/staticSchema<{ tryOnId: string }>()/staticSchema<Record<string, unknown>>()/' lib/inngest.ts
```
**Why:** plants a bug: a loose schema that accepts any payload.

```bash
npx tsc --noEmit
```
**Why:** must fail. Got `error TS2578: Unused '@ts-expect-error' directive`, so the compile-time test works.

```bash
cp /tmp/inngest.bak lib/inngest.ts
```
**Why:** restores the file. Typecheck passes again.

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build.

## 7. Commit, publish, PR, auto-merge

```bash
git add package.json package-lock.json lib/inngest.ts lib/inngest.test.ts docs/learning/36_install_inngest.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "36_install_inngest Install inngest 4.21.0 with client and try-on event"
```
**Why:** saves the snapshot.

```bash
git push -u origin 36_install_inngest
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 36_install_inngest --title "36_install_inngest Install inngest 4.21.0 with client and try-on event" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **v3 vs v4:** `createFunction` takes `triggers` in its options in v4. Check the installed types, not old blog posts.
- **`@ts-expect-error` as a test:** it's allowed by our rules when a comment says why. It turns "these types work" into something typecheck enforces.
- **200 new packages** mostly come from OpenTelemetry. That's normal for inngest, but it's a bigger install and lock file.
