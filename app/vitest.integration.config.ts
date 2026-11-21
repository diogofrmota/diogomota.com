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
  // The files run side by side (about a third faster): each makes its own
  // accounts and spaces in the run's database, mocks in its own worker, and
  // names its own containers.
  test: { include: ["integration/**/*.test.ts"], testTimeout: 15000 },
});
