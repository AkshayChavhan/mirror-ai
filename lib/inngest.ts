import { Inngest, eventType, staticSchema } from "inngest";

// Background jobs (Inngest v4). Server-only: sending events in production uses INNGEST_EVENT_KEY,
// and Inngest calls our route (task 37) signed with INNGEST_SIGNING_KEY. Locally, the Inngest dev
// server needs neither.

export const inngest = new Inngest({ id: "mirror-ai" });

/**
 * Sent when a user starts a try-on (task 38); handled by the try-on job (task 39).
 * staticSchema = TypeScript types only, no runtime validation library needed.
 */
export const tryOnRequested = eventType("tryon/requested", {
  schema: staticSchema<{ tryOnId: string }>(),
});
