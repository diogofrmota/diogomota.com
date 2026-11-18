import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { assertTestIsolation } from "./lib/test-isolation";

assertTestIsolation();
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
  test: { include: ["integration/**/*.test.ts"], fileParallelism: false, testTimeout: 15000 },
});
