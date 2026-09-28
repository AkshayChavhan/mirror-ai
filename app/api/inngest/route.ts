import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { cleanupJob } from "@/lib/cleanup-job";
import { tryOnJob } from "@/lib/tryon-job";

// The endpoint Inngest calls to discover and run our background functions (Inngest v4, App Router).
// In production, requests from Inngest are verified with INNGEST_SIGNING_KEY.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [tryOnJob, cleanupJob],
});
