// npm run test:e2e: runs Playwright (arguments go on to `playwright test`) so that a
// run always ends, and leaves nothing running behind it, even when the run
// before didn't end well (Ctrl+C, a crash, a closed terminal, a killed
// background job, all of which can leave its processes running):
//
// - Before: stops what earlier runs left in this folder. That is the test
//   server (`next dev` on the e2e port, playwright.config.ts), test runners
//   and workers (with their browsers) whose parent is gone, and a dev server
//   whose terminal is gone. A dev server still attached to a terminal is
//   someone's `npm run dev`, and Next runs one dev server per folder: the run
//   doesn't start, and says which one to stop. Nor does it while another run
//   is going in this folder.
// - During: Playwright ends a run after its globalTimeout; if it's still
//   running a few minutes after that, it is stopped.
// - After: stops what this run's Playwright started and didn't stop itself (its
//   workers and browsers, its test server), and nothing else: another run
//   starting meanwhile is left alone.
//
// The processes are found by their command lines, which name this folder:
// on Windows the owner of a port can't be read reliably (netstat's output is
// localized, and some builds don't list listening sockets at all), and the
// pid in .next/dev/lock may by now be some other program's.

import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const e2ePort = 3100; // playwright.config.ts: the tests' own dev server.
const playwrightLimit = 30 * 60_000; // playwright.config.ts: globalTimeout.
const grace = 5 * 60_000;

const windows = process.platform === "win32";
const appDir = fileURLToPath(new URL("..", import.meta.url));

/** Forward slashes, none doubled, lowercase on Windows: paths compare however they were written. */
function normalize(text) {
  const slashes = text.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  return windows ? slashes.toLowerCase() : slashes;
}

const modules = normalize(path.join(appDir, "node_modules") + "/");

/** Every process running: its pid, its parent's and its command line. */
function processes() {
  if (windows) {
    const script = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; ConvertTo-Json -Compress -InputObject " +
      "@(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, CommandLine)";
    const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(output).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, command: p.CommandLine ?? "" }));
  }
  return execFileSync("ps", ["-A", "-ww", "-o", "pid=,ppid=,args="], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map(([, pid, ppid, command]) => ({ pid: Number(pid), ppid: Number(ppid), command }));
}

/** What a process of this folder is, from its command line, or null for anything else. */
function kind(command) {
  const line = normalize(command);
  if (!line.includes(modules)) return null;
  const lower = line.toLowerCase();
  if (lower.includes("/playwright/lib/worker/workerprocessentry.js")) return "worker";
  if (/\/(@playwright\/test|playwright)\/cli\.js"?\s+test\b/.test(lower)) return "runner";
  if (lower.includes("/next/dist/server/lib/start-server.js")) return "server";
  if (/\/next\/dist\/bin\/next"?\s+dev\b/.test(lower)) return "dev";
  return null;
}

/** Whether a process only launches another and waits for it: npm, npx, `cmd /c`, `sh -c`, this script. */
function launcher(command) {
  const line = normalize(command).toLowerCase();
  // This script too, however it was started (npm starts it as `node scripts/run-e2e.mjs`).
  if (/\/(npm|npx)-cli\.js|(^|[\s/"])scripts\/run-e2e\.mjs/.test(line)) return true;
  if (/(^|\/|")cmd(\.exe)?"?\s/.test(line)) return /\s\/c\s/.test(line);
  if (/(^|\/|")(ba|da|z)?sh(\.exe)?"?(\s|$)/.test(line)) return /\s-[a-z]*c(\s|$)|\/(npm|npx)"?(\s|$)/.test(line);
  if (/(^|\/|")(powershell|pwsh)(\.exe)?"?\s/.test(line)) return /\s-(c|command|f|file)\s/i.test(line);
  return false;
}

/**
 * Whether what started a process is gone. Launchers wait for what they started
 * long after whatever ran them is gone (a closed terminal, a stopped job), so
 * this goes up through them: an orphan's ancestors end at one that isn't
 * running anymore (or, on Linux and macOS, that was handed to pid 1), and a
 * live one's at a terminal, an editor or a test run.
 */
function orphaned(process_, byPid) {
  const seen = new Set();
  for (let parent = byPid.get(process_.ppid); ; parent = byPid.get(parent.ppid)) {
    if (!parent || (!windows && parent.pid === 1)) return true;
    if (seen.has(parent.pid) || !launcher(parent.command)) return false;
    seen.add(parent.pid);
  }
}

/** The port a `next dev` was started on: --port or -p, or Next's default. */
function devPort(command) {
  const port = command.match(/(?:--port|-p)[\s=]+(\d+)/);
  return port ? Number(port[1]) : 3000;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/** Stops a process and everything it started. */
function stopTree(pid, list) {
  if (windows) {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } catch {
      // Already gone.
    }
    return;
  }
  const tree = [pid];
  for (let i = 0; i < tree.length; i++) {
    for (const child of list) if (child.ppid === tree[i] && !tree.includes(child.pid)) tree.push(child.pid);
  }
  for (const each of tree.reverse()) {
    try {
      process.kill(each, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

/** Waits until these processes are gone (and the test server's port with them), for up to 10 s. */
async function gone(stopped) {
  for (let i = 0; i < 100 && stopped.some((p) => alive(p.pid)); i++) await new Promise((resolve) => setTimeout(resolve, 100));
}

/**
 * After the run: stops what its Playwright (`pid`, which has exited) started and
 * left running. Those are the processes whose parent it was: its workers, and
 * the shell its test server runs in, each with what they started in turn.
 */
async function stopWhatPlaywrightLeft(pid) {
  let list;
  try {
    list = processes();
  } catch {
    return;
  }
  const left = list.filter((p) => p.ppid === pid);
  if (!left.length) return;
  for (const p of left) stopTree(p.pid, list);
  const name = (p) => kind(p.command) === "worker" ? "a test worker and its browser" : /\sdev\b/.test(p.command) ? "the test server" : "a process";
  console.log(`Stopped what the test run left running: ${left.map((p) => `${name(p)} (pid ${p.pid})`).join(", ")}.`);
  await gone(left);
}

/**
 * Before the run: stops what was left running in this folder (see the top).
 * Returns why the tests can't run now, or null.
 */
async function stopLeftovers() {
  let list;
  try {
    list = processes();
  } catch (error) {
    console.warn(`Couldn't list the processes to stop any an earlier run left (${error.message}); running anyway.`);
    return null;
  }
  const byPid = new Map(list.map((p) => [p.pid, p]));
  const ours = list
    .filter((p) => p.pid !== process.pid)
    .map((p) => ({ ...p, kind: kind(p.command), orphaned: orphaned(p, byPid) }))
    .filter((p) => p.kind);

  const running = ours.find((p) => p.kind === "runner" && !p.orphaned);
  if (running) return `Another test run is going in this folder (pid ${running.pid}): let it end, or stop it, first.`;

  const leftovers = ours.filter((p) =>
    p.kind === "runner" ||
    (p.kind === "worker" && p.orphaned) ||
    (p.kind === "dev" && (devPort(p.command) === e2ePort || p.orphaned)) ||
    (p.kind === "server" && p.orphaned));
  const names = {
    runner: "a test runner",
    worker: "a test worker and its browser",
    dev: "a dev server",
    server: "a dev server",
  };
  if (leftovers.length) {
    for (const p of leftovers) stopTree(p.pid, list);
    console.log(`Stopped what was left running in this folder: ${leftovers.map((p) => `${names[p.kind]} (pid ${p.pid})`).join(", ")}.`);
    await gone(leftovers);
  }

  // A dev server of this folder that's still running, now, is someone's own.
  const stopped = new Set(leftovers.map((p) => p.pid));
  const own = ours.find((p) => p.kind === "dev" && !stopped.has(p.pid) && alive(p.pid));
  if (own) {
    return `A dev server is running in this folder (pid ${own.pid}, port ${devPort(own.command)}), and Next runs one per ` +
      "folder: stop it (Ctrl+C in its terminal) to run the tests.";
  }
  return null;
}

const blocked = await stopLeftovers();
if (blocked) {
  console.error(blocked);
  process.exit(1);
}

const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
const playwright = spawn(process.execPath, [cli, "test", ...process.argv.slice(2)], { stdio: "inherit" });

// Ctrl+C reaches Playwright too (the same console): it stops its workers and its
// server, then exits, and this cleans up after it. Other stops are passed on.
process.on("SIGINT", () => {});
for (const signal of ["SIGTERM", "SIGHUP"]) process.on(signal, () => playwright.kill(signal));

const deadline = setTimeout(() => {
  console.error(`\nThe tests are still running ${grace / 60_000} minutes past Playwright's own limit: stopping them.`);
  try {
    stopTree(playwright.pid, processes());
  } catch {
    playwright.kill("SIGKILL");
  }
}, playwrightLimit + grace);

playwright.on("exit", async (code) => {
  clearTimeout(deadline);
  await stopWhatPlaywrightLeft(playwright.pid);
  process.exit(code ?? 1);
});
