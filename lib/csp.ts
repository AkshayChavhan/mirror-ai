// The app's Content-Security-Policy (task 66). Live 3D's body tracking (MediaPipe) sends usage metrics to
// Google (https://odml.pa.googleapis.com) with fetch; the developer chose on 2026-10-01 to block them. Only
// `connect-src` is set: it limits which servers a page may TALK to (fetch, XHR, WebSocket, beacons), and
// leaves scripts, styles and images alone, so nothing else on the page can break.
// Allowed: our own app ('self': pages, server actions, the status endpoint, the MediaPipe files) and Clerk
// (its Frontend API, from the publishable key, and its telemetry), which every page needs for sign-in.
// It's sent with EVERY page, not just /tryon: the browser keeps the policy of the page it first loaded, and
// the app's links reach /tryon without loading a new page (client-side navigation).
// The header is fixed at BUILD time (next.config.ts) from the publishable key. If Clerk ever runs through a
// proxy or satellite domain, or the browser starts calling another service, add it to `connect-src` here.

/**
 * Clerk's Frontend API origin from a publishable key: `pk_test_`/`pk_live_` + base64("<host>$").
 * Null when the key isn't one (e.g. the .env.example placeholder).
 */
export function clerkFrontendApiOrigin(publishableKey: string | undefined): string | null {
  const match = /^pk_(test|live)_([A-Za-z0-9+/=]+)$/.exec(publishableKey ?? "");
  if (!match) return null;
  const host = Buffer.from(match[2], "base64").toString("utf8").replace(/\$$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? `https://${host}` : null;
}

/** The policy header's value. In development, also WebSockets (Next's hot reload). */
export function contentSecurityPolicy(publishableKey: string | undefined, isDev: boolean): string {
  const sources = ["'self'", clerkFrontendApiOrigin(publishableKey), "https://clerk-telemetry.com", isDev ? "ws:" : null];
  return `connect-src ${sources.filter(Boolean).join(" ")}`;
}
