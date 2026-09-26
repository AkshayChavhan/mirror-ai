// @vitest-environment node
// Server-only check: @gradio/client is used from server code (lib/tryon.ts), so test it in Node, not jsdom.
// No network: this only checks the package loads and exposes what lib/tryon.ts will use.
import { Client, handle_file } from "@gradio/client";
import { describe, expect, it } from "vitest";

describe("@gradio/client", () => {
  it("exposes Client.connect for calling a Hugging Face Space", () => {
    expect(typeof Client.connect).toBe("function");
  });

  it("exposes handle_file for passing images by URL", () => {
    expect(typeof handle_file).toBe("function");
  });
});
