# 21 Add the Prisma schema

**Branch:** `21_add_prisma_schema` (starts from `main`)
**Goal:** the database models from `docs/project-plan.md`: `Product`, `TryOn`, and `WishlistItem`. It needs no live database, because `validate` and `generate` never connect.

## 1. Update `main` and create the branch

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
```
**Why:** brings in PR #21 (task 16, the project plan).

```bash
git checkout -b 21_add_prisma_schema
```
**Why:** new task, new branch.

## 2. Decisions from the developer (applied to the plan too)

| Question | Answer |
|---|---|
| Admin = Clerk `publicMetadata.role === "admin"` | Yes |
| 24 h cron deletes the images **and** the `TryOn` row | Yes |
| Wishlist, once per user | **No:** stored in the database, **duplicates allowed**, and it **works without login** (an anonymous cookie id, moved to the account on sign-in) |
| `/wishlist` needs login, and own `/tryon/[id]` only | **No:** the wishlist is public. The other access rules are an **open question** before task 24 |

## 3. `prisma/schema.prisma`

- **Enums:** `Category` (`UPPER`, `LOWER`, `OVERALL`) and `TryOnStatus` (`PENDING`, `PROCESSING`, `DONE`, `FAILED`).
- **`Product`:**
  - name, imageUrl, category, price?, description?, buyLink?, `isActive` (default `true`), createdAt, `updatedAt` (`@updatedAt`, set automatically);
  - index on `isActive`, for listing active products.
- **`TryOn`:**
  - userId (Clerk), `productId` → Product, personUrl, resultUrl?, `status` (default `PENDING`), errorMessage?, createdAt;
  - index on `userId, createdAt`, for the history page;
  - index on `createdAt`, for the 24 h cleanup cron, which scans across all users (the rules-reviewer suggested it).
- **`WishlistItem`:**
  - `userId?`, `anonymousId?`, `productId` → Product, createdAt;
  - indexes on `userId` and on `anonymousId`;
  - no unique constraint, since duplicates are allowed;
  - the app must always set `userId` or `anonymousId`. MongoDB/Prisma can't enforce "at least one", so a schema comment says so.
- **MongoDB ids:** `id String @id @default(auto()) @map("_id") @db.ObjectId` is how Prisma maps MongoDB's `_id`.
- **`onDelete: Cascade`:** deleting a product also deletes its try-ons and wishlist items. With MongoDB, Prisma enforces this itself (MongoDB has no foreign keys).
- `///` comments are **doc comments**. They show up in editor hovers for the generated client.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v22.23.2/installation/bin:$PATH"
```
**Why:** Node 22.23.2 for Claude Code's shell (see task 01).

```bash
export DATABASE_URL="mongodb+srv://placeholder@example.invalid/mirror"
```
**Why:** Prisma requires the variable to exist. A placeholder is enough, because nothing below connects.

```bash
npx prisma format
```
**Why:** lines up the schema's columns, Prisma's standard style.

```bash
npx prisma validate
```
**Why:** `The schema at prisma/schema.prisma is valid`.

```bash
npx prisma generate
```
**Why:** builds the typed client into `node_modules/@prisma/client`, so the app and tests can use `prisma.product`, `prisma.tryOn`, and so on.

```bash
node -e "const {Prisma,Category,TryOnStatus}=require('@prisma/client'); console.log(Object.keys(Prisma.ProductScalarFieldEnum), Object.values(Category), Object.values(TryOnStatus))"
```
**Why:** looks inside the generated client to confirm the fields and enums are exactly as planned.

## 4. Tests: `prisma/schema.test.ts`

- Existing: MongoDB provider, `prisma-client-js`, `prisma validate` passes.
- New, reading the **generated client**, which also proves `prisma generate` works:
  - enum values;
  - `Product`, `TryOn`, and `WishlistItem` field lists (via `Prisma.<Model>ScalarFieldEnum`);
  - 2 `onDelete: Cascade` relations.

```bash
npm test
```
**Why:** `Tests 19 passed` (5 new).

```bash
cp prisma/schema.prisma /tmp/schema21.bak
```
**Why:** saves the good schema before planting a change.

```bash
sed -i '' '/^  anonymousId String?$/d' prisma/schema.prisma
```
**Why:** plants a mistake: removes `anonymousId` from `WishlistItem`.

```bash
sed -i '' '/@@index(\[anonymousId\])/d' prisma/schema.prisma
```
**Why:** also removes its index, or `generate` would fail instead of the test.

```bash
DATABASE_URL="mongodb+srv://placeholder@example.invalid/mirror" npx prisma generate
```
**Why:** regenerates the client from the broken schema.

```bash
npm test
```
**Why:** must fail. Got `× has WishlistItem with both userId and anonymousId`, `1 failed | 18 passed`.

```bash
cp /tmp/schema21.bak prisma/schema.prisma && DATABASE_URL="mongodb+srv://placeholder@example.invalid/mirror" npx prisma generate
```
**Why:** restores the schema and the client. `npm test` shows 19 passing again.

```bash
npm run lint && npm run typecheck && npm run test:e2e && bash .claude/hooks/block-dangerous-git.test.sh
```
**Why:** the rest of the checklist. `test:e2e` includes the build.

## 5. Docs

- `docs/project-plan.md`: admin role and cron **confirmed**; wishlist **decided** (public, anonymous id, duplicates allowed); the remaining access rules marked as an **open question**.
- `README.md`: the stack table lists the three models as in use.

## 6. Commit, publish, PR, auto-merge

```bash
git add prisma/schema.prisma prisma/schema.test.ts docs/project-plan.md README.md docs/learning/21_add_prisma_schema.md docs/task-list.md
```
**Why:** stages this task's files.

```bash
git commit -m "21_add_prisma_schema Add Product, TryOn, and WishlistItem models"
```
**Why:** saves the snapshot.

```bash
git push -u origin 21_add_prisma_schema
```
**Why:** publishes the branch.

```bash
gh pr create --base main --head 21_add_prisma_schema --title "21_add_prisma_schema Add Product, TryOn, and WishlistItem models" --body-file <file>
```
**Why:** opens the PR. `<file>` is a placeholder for a Markdown description file.

```bash
gh pr merge <number> --auto --merge
```
**Why:** GitHub merges it once CI passes.

## Gotchas

- **CI gets the generated client from `npm ci`.** `@prisma/client`'s `postinstall` runs `prisma generate`, so the client tests work there without an extra step.
- **Schema changes need `prisma generate`** before the types and tests see them. The editor shows old types until you run it.
- **No `prisma db push` yet.** Creating collections and indexes in Atlas needs the real `DATABASE_URL`, and happens in task 22 or later.
