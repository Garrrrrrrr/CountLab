import { defineConfig } from "vitest/config";

/** Unit tests and Playwright specs run under different runners. Keep e2e out
 * of Vitest even when its default glob discovers `*.spec.ts` files. */
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["e2e/**"],
  },
});
