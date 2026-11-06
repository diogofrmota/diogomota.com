// Stops a dev server left running by an e2e run that didn't finish (stopped
// with Ctrl+C, a crash, a closed terminal), so the next run can start its own.
// Run by `npm run test:e2e` before Playwright, which otherwise fails with
// "http://localhost:3100 is already used".
//
// Only that server: next dev records its pid and port in .next/dev/lock, and
// the e2e server is the one on the e2e port (playwright.config.ts). A dev
// server of your own, on any other port, is left alone (Next then refuses to
// start a second one in this folder and says so; stop yours to run the tests).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const e2ePort = 3100;

let server;
try {
  server = JSON.parse(readFileSync(new URL("../.next/dev/lock", import.meta.url), "utf8"));
} catch {
  process.exit(0); // No dev server has run here, or the lock isn't readable: nothing to stop.
}

function running(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (server?.port !== e2ePort || !Number.isInteger(server.pid) || !running(server.pid)) process.exit(0);

console.log(`Stopping the e2e dev server left running by an earlier run (pid ${server.pid}).`);
if (process.platform === "win32") {
  // The whole tree: next dev's server process and anything it started.
  execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
} else {
  process.kill(server.pid, "SIGTERM");
}
// Next releases the lock as the process exits; wait for that, briefly.
for (let i = 0; i < 50 && running(server.pid); i++) await new Promise((resolve) => setTimeout(resolve, 100));
