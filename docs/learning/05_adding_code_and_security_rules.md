# 05 Adding code and security rules

**Branch:** `05_adding_code_and_security_rules` (starts from `04_adding_rules_for_testing`)
**Goal:** coding standards, and keeping secrets out of the repo.

## 1. Create the task branch

```bash
git checkout -b 05_adding_code_and_security_rules
```
**Why:** starts this task's branch on top of 04.

## 2. Add the rules to `CLAUDE.md`

Added `# Code rules`:
- Only `lib/` calls the try-on model, through one function (`runTryOn()`), so switching providers touches one file.
- Strict TypeScript: no `any` or `@ts-ignore` without a comment explaining why.
- Secrets and service SDKs stay in server code. Only `NEXT_PUBLIC_` env vars reach the browser. Use `"use client"` only when needed.
- Errors show a friendly message to the user. Details are logged on the server, and each failure path gets a test.

Added `# Security and secrets (always follow, never skip)`:
- Never commit `.env*` files, keys, or tokens. Each new env var goes in `.env.example` with a placeholder.
- Never write a real token anywhere. Use placeholders like `<HF_TOKEN>`.

## 3. Commit

```bash
git add CLAUDE.md docs/learning/05_adding_code_and_security_rules.md
```
**Why:** stages only this task's files.

```bash
git commit -m "05_adding_code_and_security_rules Add code and security rules to CLAUDE.md"
```
**Why:** saves the snapshot.

## Gotchas

- `.gitignore` already ignores `.env*`, so a real `.env` can't be committed by accident. Still, never paste keys into code or docs.
