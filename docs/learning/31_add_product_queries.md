# 31 Add product queries (`lib/products.ts`)

**Branch:** `31_add_product_queries` (starts from `main`)
**Goal:** one place for all product database access (list, get, create, update, delete), with input validation and friendly errors. Admin pages (32–34) and the landing page (35) will use it.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #30 (task 53, the phase 2 task list).

```bash
git checkout -b 31_add_product_queries
```
**Why:** task 30 waits for the developer's `DATABASE_URL`. This one doesn't need a database, because the tests mock Prisma.

```bash
node -e "const {Prisma}=require('@prisma/client'); console.log(typeof Prisma.PrismaClientKnownRequestError)"
```
**Why:** confirms the generated client exports Prisma's error class, used to recognise "record not found" (`P2025`).

## 2. `lib/products.ts`

| Function | Does |
|---|---|
| `listActiveProducts()` | `isActive: true` only, newest first. For shoppers |
| `listAllProducts()` | Everything, newest first. For the admin panel |
| `getProduct(id)` | One product, or `null` if the id is malformed or unknown (no query for a bad id) |
| `createProduct(input)` | Validates, then saves |
| `updateProduct(id, partial)` | Validates only the given fields, then saves (also used for hide/show via `isActive`) |
| `deleteProduct(id)` | Deletes (try-ons and wishlist items cascade, from task 21) |

- **Validation** (`validateProductInput`):
  - name required, trimmed, ≤120 characters;
  - `imageUrl` is trimmed and must be `https`;
  - category must be a real `Category` (checked with `Object.hasOwn`);
  - price ≥0 and finite, or null;
  - description ≤2000 characters, and blank becomes `null`;
  - `buyLink` must be `https`, and blank becomes `null`;
  - **types are checked at runtime too** (a string name, a number price, a boolean `isActive`), because Server Actions may pass untyped form data. Wrong types become a friendly `INVALID_INPUT`, not a crash. (The rules-reviewer suggested this.)
- **`ProductError` codes:**
  - `INVALID_INPUT` (a friendly field message);
  - `NOT_FOUND` (bad id, or Prisma `P2025`);
  - `DB_ERROR` ("Something went wrong…"; the details are logged and kept in `cause`).
- **Admin checks aren't done here.** The calling page or action uses `requireAdmin()` (task 24).
- MongoDB ids are 24 hex characters (`/^[a-f0-9]{24}$/i`). Other ids are rejected early.

## 3. Tests: `lib/products.test.ts`

- `vi.mock("./prisma")` gives fake `findMany` / `findUnique` / `create` / `update` / `delete`, so no MongoDB is needed.
- Not-found errors are real `Prisma.PrismaClientKnownRequestError` objects with code `P2025`.
- Cases (30):
  - validation: trimming (including `imageUrl`), blanks → `null`, 9 rejections, 4 wrong-type rejections, partial updates;
  - active vs all listing;
  - `get` with a good id, a malformed id, and a database failure (an error, never a silent `null`);
  - `create` saves validated data, and bad input never reaches the database;
  - `update` with partial data, an unknown id, and a malformed id;
  - `delete` with a known and an unknown id;
  - database errors hidden from users but logged.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
npm test
```
**Why:** the first run had **2 failures**. That was a real bug the tests caught: `createProduct` and `updateProduct` returned promises but weren't `async`, so invalid input **threw immediately** instead of rejecting the promise, and `.catch()`-style callers would miss it. Making both `async` fixed it. After the review's hardening, `Tests 91 passed` (30 new).

```bash
cp lib/products.ts /tmp/products.bak
```
**Why:** saves the good file before planting a bug.

```bash
sed -i '' 's/where: { isActive: true }, orderBy/where: {}, orderBy/' lib/products.ts
```
**Why:** plants a bug where **hidden products would show to shoppers**.

```bash
npm test
```
**Why:** must fail. Got `× listActiveProducts returns active products, newest first`.

```bash
cp /tmp/products.bak lib/products.ts
```
**Why:** restores the good file. All tests pass.

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build.

## 4. Commit, publish, PR, auto-merge

```bash
git add lib/products.ts lib/products.test.ts docs/learning/31_add_product_queries.md docs/task-list.md
```
**Why:** stages this task's files. The untracked `pnpm-lock.yaml` is left out on purpose.

```bash
git commit -m "31_add_product_queries Add product queries with validation and friendly errors"
```
**Why:** saves the snapshot.

```bash
git push -u origin 31_add_product_queries
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 31_add_product_queries --title "31_add_product_queries Add product queries with validation and friendly errors" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **A function returning a Promise should be `async`** if it can fail before the first `await`. Otherwise errors are thrown synchronously, which callers don't expect.
- **Real queries need `DATABASE_URL`** and `npm run db:push` (task 30) first.
