# 60 Add a test database for E2E

**Branch:** `60_add_ci_test_database` (starts from `main`)
**Goal:** let E2E tests open pages that need **real rows**: a finished try-on, saved wishlist items, products.
- CI had no database, so it could only test signed-out redirects and empty states.
- Now CI starts a **throwaway local MongoDB**, and Playwright fills it with **known sample data** before each run.
- The developer chose this ("option b") on 2026-09-29, so that task 45 (WhatsApp share) and later tasks get real E2E tests.

## 1. Create the branch

```bash
git checkout -b 60_add_ci_test_database
```
**Why:** new task, new branch. `main` was already up to date after PR #53.

```bash
cat playwright.config.ts && cat vitest.config.mts && cat .github/workflows/ci.yml
```
**Why:** reads the current setup:
- Playwright tests the production build on port 3100;
- Vitest ignores `e2e/`;
- CI runs lint, typecheck, unit, then E2E.

```bash
sed -n 1,60p env-example.test.ts; tail -12 .env.example; docker --version; grep -n '"include"' -A3 tsconfig.json
```
**Why:** four checks:
- every new env var must go in `.env.example`, whose test also checks the placeholder format;
- **Docker isn't installed on this laptop**, so the seeding is proven in CI;
- `tsconfig.json` includes `**/*.ts`, so the new `scripts/` folder is typechecked.

## 2. How it fits together

| Where | What |
|---|---|
| `.github/workflows/ci.yml` | starts `mongo:7.0` in Docker as a **one-node replica set** (Prisma needs one), waits until it's primary (and **fails clearly** if it never gets there), runs `npm run db:push` against it (collections plus indexes, such as the unique `shareId`), and sets `E2E_DATABASE_URL` for the job |
| `playwright.config.ts` | when `E2E_DATABASE_URL` is set: checks it with the guard **as the config loads** (before the app starts), sets `webServer.env: { DATABASE_URL: E2E_DATABASE_URL }`, and never reuses an old local server (which would still use `.env`'s database). Plus `globalSetup: "./e2e/global-setup.ts"` |
| `e2e/global-setup.ts` | seeds the database once before all tests, only when `E2E_DATABASE_URL` is set |
| `scripts/e2e-db.ts` | `E2E_DATA` (fixed sample data), `assertSafeTestDatabase(url)`, `seedTestDatabase(url)` |
| `e2e/seeded-data.spec.ts` | E2E tests on the seeded data. They **skip** without `E2E_DATABASE_URL` |

- **The app uses the test database without touching `.env`:** an environment variable that's already set wins over `.env`, both for Next and for Prisma. So `webServer.env` is enough.
- **The sample data** has fixed ids, so specs can refer to them:
  - 2 visible products and 1 **hidden** one;
  - a **finished** try-on with share token `e2eDoneShareToken00000`, and a **failed** one;
  - 3 wishlist items for a known anonymous id, one of them for the hidden product.
  - Images use Cloudinary's public demo picture.

## 3. The safety guard (most important)

`seedTestDatabase` **deletes everything first**, so `assertSafeTestDatabase` refuses any URL unless:
- it's `mongodb://` (not `mongodb+srv://`, which Atlas uses) **on this machine** (`localhost`, `127.0.0.1` or `[::1]`), **and**
- the database name **ends in `-e2e` or `_e2e`**.

Its error message **never repeats the URL**, because a mistaken real URL would contain a password. The guard runs **before** a database client is even created.

## 4. `.env.example`

- There's a new optional **`E2E_DATABASE_URL="<local-mongodb-test-url>"`**, with a comment. `env-example.test.ts` lists it now.
- **Gotcha hit:** the first placeholder was `<local-mongodb-e2e-url>`, and the test refused it. Placeholders may only contain lowercase letters and dashes (`<[a-z-]+>`), and `e2e` has a digit.

## 5. Tests

- **`scripts/e2e-db.test.ts`** (a fake `PrismaClient`, no database):
  - the guard accepts the CI database and a `127.0.0.1` one named `_e2e`;
  - it **refuses** an Atlas URL, an Atlas URL named `-e2e`, a remote host named `-e2e`, a local database without an e2e name, `e2e-prod`, and not-a-URL;
  - its error never contains the password;
  - `seedTestDatabase` refuses an unsafe URL **before creating a client**;
  - it deletes children first, then creates products, try-ons and the wishlist, then disconnects (the call order is checked);
  - it disconnects even when seeding fails;
  - `E2E_DATA` passes the app's own format checks (share token, UUID v4, ObjectIds, https Cloudinary).
- **`e2e/seeded-data.spec.ts`** (CI only):
  - the landing page shows the 2 visible garments, never the hidden one;
  - the **finished** result link shows the heading, the slider, the download link (`fl_attachment`) and `noindex`;
  - the **failed** link says so, with no slider;
  - the **anonymous wishlist** (cookie set) shows the 2 visible items with Remove, never the hidden one.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npx vitest run scripts/e2e-db.test.ts
```
**Why:** runs the guard and seed tests: `15 passed`.

```bash
npx vitest run env-example.test.ts
```
**Why:** the env template test, now with `E2E_DATABASE_URL`: `3 passed`.

```bash
npm test
```
**Why:** runs the whole suite: `Tests 450 passed` (15 new).

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. **Locally:** `19 passed, 4 skipped`, with `[e2e] No E2E_DATABASE_URL: skipping the test-database seed`. That's by design: this laptop has no test MongoDB. **In CI** the 4 run against the seeded database, and the PR only merges if they pass.

```bash
npm run build
```
**Why:** confirms the production build on its own too.

## 6. Commit, publish, PR, auto-merge

```bash
git add scripts/e2e-db.ts scripts/e2e-db.test.ts e2e/global-setup.ts e2e/seeded-data.spec.ts playwright.config.ts .github/workflows/ci.yml .env.example env-example.test.ts docs/learning/60_add_ci_test_database.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "60_add_ci_test_database Add a seeded MongoDB test database for E2E"
```
**Why:** saves the snapshot.

```bash
git push -u origin 60_add_ci_test_database
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 60_add_ci_test_database --title "60_add_ci_test_database Add a seeded MongoDB test database for E2E" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes. Here, CI is also the first real run of the seed.

## Gotchas

- **Never point `E2E_DATABASE_URL` at a real database.** The guard refuses anything not local and named `-e2e`, but don't rely on that alone.
- **Prisma needs a replica set, even for one MongoDB.** That's why CI starts `--replSet rs0` and runs `rs.initiate`, and why the URL has `replicaSet=rs0&directConnection=true`.
- **Running the seeded specs on your laptop** (optional; needs Docker). Otherwise those specs simply skip. The commands are the same as CI's:

```bash
docker run -d --name mongo-e2e -p 27017:27017 mongo:7.0 --replSet rs0 --bind_ip_all
```
**Why:** starts a throwaway MongoDB that allows a replica set.

```bash
docker exec mongo-e2e mongosh --quiet --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] })'
```
**Why:** turns it into a one-node replica set, which Prisma needs.

```bash
DATABASE_URL="mongodb://localhost:27017/mirror-ai-e2e?replicaSet=rs0&directConnection=true" npm run db:push
```
**Why:** creates the collections and indexes in the test database only. The variable is set for this one command, so `.env` is untouched.

```bash
E2E_DATABASE_URL="mongodb://localhost:27017/mirror-ai-e2e?replicaSet=rs0&directConnection=true" npm run test:e2e
```
**Why:** seeds it and runs all E2E tests, the 4 data-backed ones included.

- **Fake credentials in tests:** use a host like `db.example.com`, never an Atlas-looking `*.mongodb.net` with a user and password. GitHub's secret scanning can block a push over something that only *looks* real (found in review).
- **The hook blocks a Bash command that merely contains the word `push`** (for example, an edit script whose text mentions the schema sync script). Use the editor for such edits.
- **The E2E database is reset on every run,** so specs can rely on exact data. Don't write tests that depend on data another spec creates.
