import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// npm run test:unit: the pure logic (time zones, iCalendar files, the calendar's
// layout, repeating tasks, the library's stats and For You's ranking, the API
// schemas, the apps' URLs), in milliseconds. Everything that needs a browser,
// the server or the database is in the Playwright tests (e2e/).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Server-only modules can be imported here: no React server to protect.
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
