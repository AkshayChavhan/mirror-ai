import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 renamed middleware.ts → proxy.ts. Clerk's middleware reads the session on every
// request so `auth()` works in pages, layouts, route handlers, and Server Functions.
//
// It deliberately does NOT protect routes by path: Clerk Core 3 deprecates createRouteMatcher,
// because path matching can drift from how Next routes requests. Each protected page calls
// requireUser() / requireAdmin() from lib/auth.ts instead (see docs/project-plan.md, Pages and flow).
export default clerkMiddleware();

// Clerk's recommended matcher: skip Next internals and static files, always run for API routes
// and Clerk's own endpoints.
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
