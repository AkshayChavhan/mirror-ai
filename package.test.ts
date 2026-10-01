// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads package.json as data: no database is touched.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
};

describe("package.json db:push script", () => {
  it("creates the MongoDB collections and indexes from the Prisma schema", () => {
    expect(pkg.scripts["db:push"]).toBe("prisma db push");
  });

  it.each([
    ["--force-reset", "would wipe every collection in the database"],
    ["--accept-data-loss", "would apply schema changes that delete data without stopping"],
  ])("never passes %s (it %s)", (flag) => {
    expect(pkg.scripts["db:push"]).not.toContain(flag);
  });
});

describe("package.json MediaPipe WASM copy (task 64)", () => {
  it.each(["predev", "prebuild"])("%s copies the WASM into public/ first, so dev and build can serve it", (script) => {
    expect(pkg.scripts[script]).toBe("node scripts/copy-mediapipe-wasm.mts");
  });
});
