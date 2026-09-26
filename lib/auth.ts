import { auth, currentUser } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

// Server-only auth checks, called by each protected page/route (Clerk Core 3: protect at the resource).
// Access rules: docs/project-plan.md, "Pages and flow".

/** Signed-in user's Clerk id. Signed-out visitors are redirected to /sign-in (and back afterwards). */
export async function requireUser(): Promise<string> {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }
  return userId;
}

/** True when the user's Clerk publicMetadata.role is "admin" (set in the Clerk dashboard). */
export async function isAdmin(): Promise<boolean> {
  const user = await currentUser();
  return user?.publicMetadata?.role === "admin";
}

/**
 * Admin-only pages. Signed out → /sign-in. Signed in but not admin → 404, so the admin area's
 * existence isn't revealed.
 */
export async function requireAdmin(): Promise<string> {
  const userId = await requireUser();
  if (!(await isAdmin())) {
    notFound();
  }
  return userId;
}
