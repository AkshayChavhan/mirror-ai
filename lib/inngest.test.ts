// @vitest-environment node
// No network: only checks the client and event definitions load with the right names.
import { isInngest } from "inngest";
import { describe, expect, it } from "vitest";
import { inngest, tryOnRequested } from "./inngest";

describe("lib/inngest", () => {
  it("creates the Mirror AI Inngest client", () => {
    expect(isInngest(inngest)).toBe(true);
    expect(inngest.id).toBe("mirror-ai");
  });

  it("defines the try-on requested event", () => {
    expect(tryOnRequested.name).toBe("tryon/requested");
  });

  it("builds a typed event payload carrying the try-on id", () => {
    const event = tryOnRequested.create({ tryOnId: "65f0c0ffee0000000000abcd" });
    expect(event.name).toBe("tryon/requested");
    expect(event.data).toEqual({ tryOnId: "65f0c0ffee0000000000abcd" });
  });

  it("enforces the payload shape at compile time (checked by npm run typecheck)", () => {
    // @ts-expect-error: tryOnId is required. If the event's types stopped working, typecheck would fail here.
    const wrong = () => tryOnRequested.create({ productId: "x" });
    expect(typeof wrong).toBe("function");
  });
});
