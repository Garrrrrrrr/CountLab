import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Unit tests and Playwright specs run under different runners. Keep e2e out
 * of Vitest even when its default glob discovers `*.spec.ts` files. */
export default defineConfig({
  // Mirrors the `@/*` path mapping in tsconfig.json. Next resolves it natively;
  // Vitest does not, so modules importing `@/lib/...` fail to load without this.
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["e2e/**"],
  },
});
