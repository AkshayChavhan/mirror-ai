import { expect, test } from "@playwright/test";

// Live 3D body tracking (task 64) loads its model and WASM from our own app, never a third-party CDN.
// These are plain static files (public/), so no sign-in or database is needed, and Clerk's middleware skips
// them (proxy.ts matcher): no x-clerk-auth-status header, like the favicon in proxy.spec.ts.

test("the pose model is served, at the pinned size", async ({ request }) => {
  const response = await request.get("/mediapipe/pose_landmarker_lite.task");
  expect(response.status()).toBe(200);
  expect((await response.body()).byteLength).toBe(5_777_746);
  expect(response.headers()["x-clerk-auth-status"]).toBeUndefined();
});

for (const file of ["vision_wasm_internal", "vision_wasm_nosimd_internal"]) {
  test(`the ${file} WASM and its loader are served (copied from the package before the build)`, async ({ request }) => {
    const wasm = await request.get(`/mediapipe/wasm/${file}.wasm`);
    expect(wasm.status()).toBe(200);
    // Browsers only compile WASM fast (streaming) when it's served as application/wasm.
    expect(wasm.headers()["content-type"]).toContain("application/wasm");
    expect(wasm.headers()["x-clerk-auth-status"]).toBeUndefined();
    const loader = await request.get(`/mediapipe/wasm/${file}.js`);
    expect(loader.status()).toBe(200);
    expect(loader.headers()["content-type"]).toContain("javascript");
  });
}
