# Mirror AI: project plan

Source: the developer's answers (2026-09-26). The original `PLAN.md` wasn't in the repo when this was written. If it turns up, merge anything missing into this file.

## What it is

A virtual try-on web app. A signed-in user picks a garment, captures or uploads a photo of themselves, and gets back an image of themselves wearing it.

## Users and access

| Who | Can |
|---|---|
| Anyone (signed out) | See the landing page and browse active products on it; use the wishlist (anonymous cookie id) |
| Signed-in user (Clerk) | Try on, see their history, use the wishlist (anonymous items move to the account on sign-in) |
| Admin | Add, edit, and delete products at `/admin/products` ("add / edit / delete products (admin only)") |

- Try-on requires login, so it can be **rate-limited per user** and shown in history.
- Admins add products. There are **no user-uploaded garments** in v1.
- **Confirmed:** a user is an admin when their Clerk `publicMetadata.role` is `"admin"`.

## Pages and flow

| Route | Access | What it does |
|---|---|---|
| `/` | Public | Landing page with a **"Try it on"** button. Products are browsable on this page ("Browsing products on the landing page is public") |
| `/tryon` | Signed-in | Live camera with a pose guide, a product carousel at the bottom, and a capture button. A photo can also be **uploaded from the gallery** |
| (in `/tryon`) | Signed-in | Capture → **preview** (Retake / Try on) → **loading screen** that polls the job status |
| `/tryon/[id]` | **Open** (proposal was: signed-in, own try-ons only) | Result: **before/after slider**, download, **share to WhatsApp** |
| `/history` | Signed-in | The user's past try-ons (only the last 24 h, see Privacy) |
| `/wishlist` | Public (signed out or in) | Saved products |
| `/admin/products` | Admin | Add, edit, and delete products |
| sign-in / sign-up | Public | Clerk pages (task 25) |

- **Decided:** `/wishlist` works **without login** (see WishlistItem).
- **Open question:** the developer chose "something else" for the other access rules, including who can open a `/tryon/[id]` result. That's to be settled before task 24 (`proxy.ts`). Until then, the original proposal is noted in the table.

## Data model

### Product (a garment)

| Field | Type | Notes |
|---|---|---|
| `id` | ObjectId | |
| `name` | string | required |
| `imageUrl` | string | required. A clean garment image on a plain background, stored on Cloudinary |
| `category` | enum `UPPER` / `LOWER` / `OVERALL` | required. Maps to the try-on model's cloth type |
| `price` | float | optional |
| `description` | string | optional |
| `buyLink` | string | optional |
| `isActive` | boolean | default `true`. Hides a product without deleting it |
| `createdAt` / `updatedAt` | DateTime | |

No sizes or brands for now.

### TryOn (one try-on attempt)

| Field | Type | Notes |
|---|---|---|
| `id` | ObjectId | |
| `userId` | string | Clerk user id |
| `productId` | ObjectId → Product | |
| `personUrl` | string | The captured photo (Cloudinary) |
| `resultUrl` | string? | Null until the job is done |
| `status` | enum `PENDING` / `PROCESSING` / `DONE` / `FAILED` | |
| `errorMessage` | string? | A user-safe message when `FAILED` |
| `createdAt` | DateTime | |

### WishlistItem (decided)

| Field | Type | Notes |
|---|---|---|
| `id` | ObjectId | |
| `userId` | string? | Clerk user id, set when signed in |
| `anonymousId` | string? | Anonymous visitor id from a cookie, set when signed out |
| `productId` | ObjectId → Product | |
| `createdAt` | DateTime | |

- Works **signed out**: the visitor gets an anonymous id in a cookie, and their items are linked to it.
- **On sign-in**, anonymous items are moved to the user's account.
- The **same product can be saved more than once** (no unique constraint).

## Category → try-on model mapping

Source: `docs/phase-0-findings.md` (the OOTDiffusion categories, and CatVTON's `cloth_type` from its `app.py`).

| Our category | CatVTON `cloth_type` | OOTDiffusion `category` |
|---|---|---|
| `UPPER` | `upper` | `Upper-body` |
| `LOWER` | `lower` | `Lower-body` |
| `OVERALL` | `overall` | `Dress` |

- The model choice is still open (task 27). The mapping lives only in `lib/tryon.ts` (code rules).

## Privacy

- **Person photos and results are auto-deleted after 24 hours** by a cron job.
- **Confirmed:** the cron deletes the Cloudinary images (`personUrl`, `resultUrl`) **and** the `TryOn` row itself, so nothing about the attempt is kept. `/history` then naturally shows only the last 24 hours. It will still filter on `createdAt > now − 24 h`, in case the cron runs late.

## Try-on job lifecycle

1. The user submits: a `TryOn` is created with `PENDING`.
2. A background job (Inngest) sets `PROCESSING` and calls `runTryOn()`.
3. On success, the result is uploaded to Cloudinary: `resultUrl` is set and the status becomes `DONE`.
4. On failure, the status is `FAILED`, with a friendly `errorMessage`.
5. The loading screen polls the status until it's `DONE` or `FAILED`.

## Not yet in the task list

These need new tasks, to be added to `docs/task-list.md` when we get there, with the developer's OK:
- the `/wishlist` page, the anonymous-id cookie, and moving items to the account on sign-in (the model exists since task 21);
- the admin role check, and the `/admin/products` CRUD;
- the `/tryon` camera, pose guide, carousel, capture/upload, preview, and loading screen;
- the `/tryon/[id]` result page (before/after slider, download, WhatsApp share);
- the `/history` page;
- the Inngest job for running try-ons;
- the 24-hour auto-delete cron;
- per-user rate limiting for try-ons;
- the landing page with products browsable on it (replacing the temporary home from task 17).
