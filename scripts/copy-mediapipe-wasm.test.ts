// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POSE_MODEL_PATH } from "../app/tryon/live/poseTracker";
import { FROM_DIR, TO_DIR, WASM_FILES, copyMediapipeWasm } from "./copy-mediapipe-wasm.mjs";

describe("copyMediapipeWasm", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mediapipe-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("copies the four WASM files (SIMD and the no-SIMD fallback), creating the folder, and reports the bytes", () => {
    const from = join(dir, "from");
    const to = join(dir, "to", "nested"); // doesn't exist yet
    mkdirSync(from);
    WASM_FILES.forEach((file, i) => writeFileSync(join(from, file), "x".repeat(i + 1))); // 1, 2, 3 and 4 bytes
    expect(copyMediapipeWasm(from, to)).toBe(1 + 2 + 3 + 4);
    for (const file of WASM_FILES) expect(readFileSync(join(to, file), "utf8")).toBe(readFileSync(join(from, file), "utf8"));
  });

  it("fails loudly if the package is missing a file (e.g. a changed MediaPipe version)", () => {
    expect(() => copyMediapipeWasm(join(dir, "empty"), join(dir, "to"))).toThrow(/ENOENT/);
  });

  it("copies from the installed package into public/mediapipe/wasm, which has every file", () => {
    expect(FROM_DIR).toMatch(/node_modules[\\/]@mediapipe[\\/]tasks-vision[\\/]wasm$/);
    expect(TO_DIR).toMatch(/public[\\/]mediapipe[\\/]wasm$/);
    for (const file of WASM_FILES) expect(existsSync(join(FROM_DIR, file))).toBe(true);
  });
});

describe("the pose model file", () => {
  it("is committed where the tracker loads it from, at the pinned version (SHA-256)", () => {
    const file = join(process.cwd(), "public", POSE_MODEL_PATH);
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
    // pose_landmarker_lite, float16, version 1 (identical to "latest" on 2026-09-30).
    expect(hash).toBe("59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a");
  });
});
