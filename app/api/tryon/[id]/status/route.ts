import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { TryOnRecordError, getTryOnStatus } from "@/lib/tryons";

// GET /api/tryon/[id]/status, polled by the loading screen (task 43). Private: only the signed-in
// owner can read it. Someone else's try-on gets the same 404 as a missing one, so ids can't be probed.

const NO_STORE = { "Cache-Control": "no-store" }; // polling must always see the latest status

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/tryon/[id]/status">): Promise<NextResponse> {
  try {
    const { userId } = await auth(); // inside the try: even a Clerk failure gets a JSON answer
    if (!userId) return json({ error: "Please sign in." }, 401);

    const { id } = await ctx.params;
    const tryOn = await getTryOnStatus(id, userId);
    if (!tryOn) return json({ error: "That try-on doesn't exist." }, 404);
    return json(tryOn, 200);
  } catch (error) {
    // lib/tryons already logged database errors; log anything else here.
    if (!(error instanceof TryOnRecordError)) console.error("[api/tryon/status] Unexpected error:", error);
    return json({ error: "We couldn't check your try-on. Please try again." }, 500);
  }
}
