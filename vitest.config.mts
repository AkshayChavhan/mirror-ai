import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Vite 8 resolves the "@/*" alias from tsconfig.json itself (no vite-tsconfig-paths needed).
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Playwright E2E specs live in e2e/ and run with Playwright, not Vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
