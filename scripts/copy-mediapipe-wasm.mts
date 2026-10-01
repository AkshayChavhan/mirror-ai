import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Copies MediaPipe's WebAssembly files from the installed package into public/, so the app serves them
// itself (task 64): no request to a third-party CDN, and always the same version as the package.
// Runs before `npm run dev` and `npm run build` (package.json predev/prebuild). The copies are git-ignored.

/** The files FilesetResolver.forVisionTasks() loads: the SIMD build, and the fallback without SIMD. */
export const WASM_FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
] as const;

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const FROM_DIR = join(ROOT, "node_modules", "@mediapipe", "tasks-vision", "wasm");
export const TO_DIR = join(ROOT, "public", "mediapipe", "wasm");

/** Copies every WASM file from `fromDir` to `toDir` (created if needed). Returns the total bytes copied. */
export function copyMediapipeWasm(fromDir: string = FROM_DIR, toDir: string = TO_DIR): number {
  mkdirSync(toDir, { recursive: true });
  let bytes = 0;
  for (const file of WASM_FILES) {
    copyFileSync(join(fromDir, file), join(toDir, file)); // throws if the package is missing a file
    bytes += statSync(join(toDir, file)).size;
  }
  return bytes;
}

// Run directly (`node scripts/copy-mediapipe-wasm.mts`), not when a test imports it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bytes = copyMediapipeWasm();
  console.log(`[mediapipe] Copied ${WASM_FILES.length} WASM files (${(bytes / 1e6).toFixed(1)} MB) to public/mediapipe/wasm`);
}
