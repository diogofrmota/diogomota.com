// npm run test:affected: runs only the checks and tests that a change can
// break, fastest first, stopping at the first stage that fails:
//
//   1. static       Prettier and ESLint on the changed files, then the typecheck
//   2. unit         the Vitest files (test/) that import a changed file, however deeply
//   3. integration  the same for integration/ (a fresh database; Docker)
//   4. e2e          the Playwright specs of the parts of the site that changed,
//                   on the desktop project (plus the phone for a change to how
//                   things look, and production.spec.ts for offline changes)
//
// What changed: uncommitted changes (staged, unstaged and new files), or with
// --base <ref> everything since that ref as well (`--base origin/main`), or
// --files lib/books.ts,components/books/Shelf.tsx (paths in app/).
// --dry-run prints the plan without running it. The e2e stage runs on a
// production build, as CI does: under a minute to build, then no route waits
// to compile and four workers keep it busy (`next dev` slows down past two).
// --dev runs it on `next dev` instead. Anything after `--` goes on to Playwright.
//
// A change to what everything uses (the database layer, the config, the
// migrations, the test fixtures) runs the @smoke tests, which CI runs too, not
// the whole suite: `npm run test:e2e` runs all of it.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// An upper-case drive letter: tools started from Git Bash otherwise see two spellings of one path.
const appDir = fileURLToPath(new URL("..", import.meta.url)).replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const repoDir = path.dirname(appDir.replace(/[\\/]$/, ""));

const argv = process.argv.slice(2);
const passThrough = argv.includes("--") ? argv.slice(argv.indexOf("--") + 1) : [];
const own = argv.includes("--") ? argv.slice(0, argv.indexOf("--")) : argv;
const flag = (name) => own.includes(name);
const base = own.includes("--base") ? own[own.indexOf("--base") + 1] : null;
const dryRun = flag("--dry-run");
const dev = flag("--dev");

// ---------------------------------------------------------------- what changed

function git(...args) {
  return execFileSync("git", args, { cwd: repoDir, encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// Deleted files too: what imported them can break. --files a,b (paths in app/)
// instead says which, to see what a change there would run.
const given = own.includes("--files") ? own[own.indexOf("--files") + 1].split(",").map((file) => `app/${file}`) : null;
const changed = (
  given ?? [
    ...new Set([
      ...git("diff", "--name-only", "HEAD"),
      ...git("ls-files", "--others", "--exclude-standard"),
      ...(base ? git("diff", "--name-only", `${base}...HEAD`) : []),
    ]),
  ]
).sort();

/** Paths under app/, as the app has them ("lib/db.ts"); the rest keep the repo's ("nginx/nginx.conf"). */
const inApp = (file) => file.startsWith("app/");
const appPath = (file) => file.slice("app/".length);
const appFiles = changed.filter(inApp).map(appPath);
const otherFiles = changed.filter((file) => !inApp(file));

// ------------------------------------------------- the tests' imports, deeply

const importPattern =
  /(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
const extensions = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

/** A local import's file under app/, or null for a package. */
function resolve(specifier, from) {
  let target;
  if (specifier.startsWith("@/")) target = path.join(appDir, specifier.slice(2));
  else if (specifier.startsWith(".")) target = path.resolve(path.dirname(path.join(appDir, from)), specifier);
  else return null;
  for (const extension of extensions) {
    const file = target + extension;
    if (existsSync(file) && statSync(file).isFile()) return path.relative(appDir, file).split(path.sep).join("/");
  }
  return null;
}

const graph = new Map();
/** Every app file `file` imports, directly or through others, with itself. */
function dependencies(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  if (!graph.has(file)) {
    let source = "";
    try {
      source = readFileSync(path.join(appDir, file), "utf8");
    } catch {
      // Deleted.
    }
    graph.set(
      file,
      [...source.matchAll(importPattern)]
        .map((match) => resolve(match[1] ?? match[2] ?? match[3], file))
        .filter(Boolean),
    );
  }
  for (const next of graph.get(file)) dependencies(next, seen);
  return seen;
}

const filesIn = (folder, suffix) =>
  existsSync(path.join(appDir, folder))
    ? readdirSync(path.join(appDir, folder))
        .filter((name) => name.endsWith(suffix))
        .map((name) => `${folder}/${name}`)
    : [];

/** The test files that are, or import, a changed file. */
const importing = (tests) => tests.filter((test) => appFiles.some((file) => dependencies(test).has(file)));

// ------------------------------------------------------------------ the plan

const code = /\.(ts|tsx|mjs|js|cjs)$/;
const formatted = appFiles.filter(
  (file) => /\.(ts|tsx|mjs|js|cjs|css|json|md|yml|yaml)$/.test(file) && existsSync(path.join(appDir, file)),
);
const linted = formatted.filter((file) => code.test(file));
const typecheck = appFiles.some((file) => /\.(ts|tsx)$/.test(file));

const unit = importing(filesIn("test", ".test.ts"));
// This test invokes the CLI in a subprocess rather than importing it.
if (appFiles.includes("scripts/test-affected.mjs") && !unit.includes("test/test-affected.test.ts"))
  unit.push("test/test-affected.test.ts");
const integration = new Set(importing(filesIn("integration", ".test.ts")));
// What integration tests use without importing it.
if (otherFiles.some((file) => file.startsWith("nginx/"))) integration.add("integration/logging.test.ts");
if (otherFiles.some((file) => file.startsWith("infra/"))) integration.add("integration/operations.test.ts");
if (otherFiles.some((file) => file.startsWith("db/migrations/")))
  for (const test of filesIn("integration", ".test.ts")) integration.add(test);

// The parts of the site, by the files they're made of, and the specs that test
// each. `views` names views.spec.ts's walks for that part ("all": every walk).
const parts = [
  {
    name: "Books",
    files: [/^app\/books\//, /^app\/api\/books\//, /^components\/books\//, /^lib\/book/, /^hooks\/useDebounced\./],
    specs: ["books", "profiles"],
    views: ["Books shelves and panels"],
  },
  {
    name: "Shows",
    files: [
      /^app\/shows\//,
      /^app\/api\/shows\//,
      /^components\/shows\//,
      /^lib\/(shows|show-types|tmdb|tmdb-mock)\./,
      /^hooks\/useDebounced\./,
    ],
    specs: ["shows-home", "shows-discover", "shows-features", "shows-profile"],
    views: ["Shows: every view"],
  },
  {
    name: "friends and profiles",
    files: [
      /^app\/api\/social\//,
      /^components\/social\//,
      /^hooks\/useDebounced\./,
      /^lib\/(social|social-types|friends|activity|activity-types)\./,
    ],
    specs: ["profiles", "shows-profile", "shows-features"],
    views: [],
  },
  {
    name: "For Couples",
    files: [
      /^app\/(calendar|tasks|couples)\//,
      /^app\/api\/(shared|calendar)\//,
      /^app\/join\//,
      /^components\/shared\//,
      /^lib\/(calendar|calendar-feeds|events|tasks|task-types|spaces|space-types|recipe-groups|football-data|football-types)\./,
    ],
    specs: ["calendar", "tasks", "spaces", "shared-features", "recipes"],
    views: ["For Couples: Calendar, Tasks and the group's settings"],
  },
  {
    name: "Recipes",
    files: [
      /^app\/recipes\//,
      /^app\/api\/recipes\//,
      /^components\/recipes\//,
      /^components\/common\/Sheet\./,
      /^lib\/write-atomically\./,
      /^lib\/(recipes|recipe-types|recipe-photos|recipe-groups)\./,
    ],
    specs: ["recipes", "spaces"],
    views: ["Recipes: every view"],
  },
  {
    name: "Fitness",
    files: [
      /^app\/fitness\//,
      /^app\/api\/fitness\//,
      /^components\/fitness\//,
      /^lib\/(fitness|fitness-types)\./,
      /^components\/common\/Sheet\./,
    ],
    specs: ["fitness"],
    views: ["Fitness: every view"],
  },
  {
    name: "Account",
    files: [
      /^app\/account\//,
      /^app\/api\/(account|avatars)\//,
      /^components\/account\//,
      /^lib\/write-atomically\./,
      /^lib\/(accounts|account-rules|account-deletion|avatars|users|names)\./,
    ],
    specs: ["account"],
    views: ["the site's pages"],
  },
  {
    name: "themes",
    files: [/^lib\/themes\./, /^components\/common\/themes\.module\.css$/],
    specs: ["themes"],
    views: "all",
  },
  {
    name: "logging in",
    files: [
      /^auth\.ts$/,
      /^proxy\.ts$/,
      /^app\/(login|signup|forgot-password|reset-password|session-transition)\//,
      /^app\/api\/auth\//,
      /^components\/auth\//,
      /^lib\/(password|rate-limit|auth-emails|email|session-transition|next-path)\./,
    ],
    specs: ["auth", "password-reset"],
    views: ["the site's pages"],
  },
  {
    name: "the website",
    files: [
      /^app\/(page\.tsx|page\.module\.css|not-found\.tsx|error\.tsx|manifest\.ts|opengraph-image\.tsx|icon\.svg|apple-icon\.png|favicon\.ico)$/,
      /^app\/(about|privacy|report-bug|test)\//,
      /^components\/site\//,
      /^lib\/(site|apps|contact-message)\./,
      /^public\//,
    ],
    specs: ["home", "about", "site"],
    views: ["the site's pages"],
  },
  {
    name: "the apps' frame",
    files: [
      /^components\/common\//,
      /^hooks\//,
      /^lib\/(app-views|motion|api-request|form-state|badges)\./,
      /^app\/(layout\.tsx|globals\.css)$/,
    ],
    specs: ["app-shell", "motion", "home"],
    views: "all",
  },
  {
    name: "offline",
    files: [
      /^lib\/(offline-client|offline-query-cache|offline-storage|offline-notice)\./,
      /^components\/common\/(OfflineSupport|QueryProvider)\./,
      /^public\/sw\.js$/,
      /^lib\/(upload-body|write-atomically)\./,
    ],
    specs: [],
    views: [],
    production: true,
  },
];
// What everything uses: the @smoke tests stand in for all of them.
const everywhere = [
  /^lib\/(db|schemas|http|test-hooks|test-isolation)\./,
  /^(next\.config\.ts|package\.json|package-lock\.json|tsconfig\.json|playwright\.config\.ts)$/,
  /^e2e\/(fixtures|isolation|global-teardown)\.ts$/,
  /^scripts\/(run-e2e|migrate)\.mjs$/,
];

const specs = new Set();
const walks = new Set();
const reasons = [];
let smoke = false;
let productionSpec = false;
let phone = false;

for (const file of appFiles) {
  // Unit and integration tests, and the tools' own files (scripts/ that tests import are in the graph above).
  if (/^(test|integration)\//.test(file) || /^(vitest\.|eslint\.|\.prettier|AGENTS\.md|README)/.test(file)) continue;
  if (/^scripts\//.test(file) && !everywhere.some((pattern) => pattern.test(file))) continue;
  if (everywhere.some((pattern) => pattern.test(file))) {
    smoke = true;
    reasons.push(`${file}: used everywhere, so the @smoke tests`);
    continue;
  }
  if (/^e2e\/[^/]+\.spec\.ts$/.test(file)) {
    // A deleted spec has nothing left to run.
    if (existsSync(path.join(appDir, file))) specs.add(file.slice("e2e/".length));
    if (file === "e2e/production.spec.ts") productionSpec = true;
    continue;
  }
  if (file.startsWith("e2e/")) {
    // A helper: the specs that use it.
    const users = filesIn("e2e", ".spec.ts").filter((spec) => dependencies(spec).has(file));
    for (const spec of users) specs.add(spec.slice("e2e/".length));
    reasons.push(`${file}: a helper of ${users.length} specs`);
    continue;
  }
  const matched = parts.filter((part) => part.files.some((pattern) => pattern.test(file)));
  if (!matched.length) {
    if (code.test(file) || /\.css$/.test(file)) {
      smoke = true;
      reasons.push(`${file}: no part of the site claims it, so the @smoke tests`);
    }
    continue;
  }
  for (const part of matched) {
    for (const spec of part.specs) specs.add(`${spec}.spec.ts`);
    if (part.views === "all") walks.add("all");
    else for (const walk of part.views) walks.add(walk);
    if (part.production) productionSpec = true;
  }
  // How things look on a phone: the phone's walk through the views too.
  if (/\.(tsx|css)$/.test(file) && matched.some((part) => part.views.length)) phone = true;
  reasons.push(`${file}: ${matched.map((part) => part.name).join(", ")}`);
}
for (const file of otherFiles) {
  if (file.startsWith("db/migrations/")) {
    smoke = true;
    reasons.push(`${file}: a migration, so the @smoke tests`);
  } else if (file.startsWith("nginx/")) {
    productionSpec = true;
    reasons.push(`${file}: nginx, which production.spec.ts runs`);
  }
}
// On a production build, production.spec.ts runs with the rest; with --dev, on a build of its own after them.
if (productionSpec && !dev) specs.add("production.spec.ts");
else specs.delete("production.spec.ts");

/** views.spec.ts's walks by name, as file:line filters (Playwright runs the test whose `test(` is on that line). */
function walkFilters() {
  if (walks.has("all")) return ["e2e/views.spec.ts"];
  const lines = readFileSync(path.join(appDir, "e2e/views.spec.ts"), "utf8").split("\n");
  return [...walks].flatMap((walk) => {
    const title = JSON.stringify(walk).slice(0, -1);
    let line = lines.findIndex((text) => text.startsWith(`test(${title}`) || text.trim().startsWith(title));
    if (line < 0) throw new Error(`views.spec.ts has no walk named ${walk}: update parts in scripts/test-affected.mjs`);
    if (!lines[line].startsWith("test(")) line--;
    return [`e2e/views.spec.ts:${line + 1}`];
  });
}

const e2eFilters = [...specs].filter((spec) => spec !== "views.spec.ts").sort();
if (specs.has("views.spec.ts")) walks.add("all");
const viewFilters = walks.size ? walkFilters() : [];
const e2eRuns = [];
if (smoke || e2eFilters.length || viewFilters.length) {
  const projects = ["--project=desktop", ...(phone && viewFilters.length ? ["--project=mobile"] : [])];
  // @smoke across every spec, and all of the specs this change is about: grep
  // matches "<project> <file> <title> <tags>", so " home.spec.ts " is that
  // file, not shows-home.spec.ts. A file filter is a pattern on the path too:
  // e2e/home.spec.ts.
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = [...e2eFilters, ...(viewFilters.length ? ["views.spec.ts"] : [])].map((spec) => ` ${escape(spec)} `);
  const args = smoke
    ? ["--grep", ["@smoke", ...named].join("|")]
    : [...e2eFilters.map((spec) => `e2e/${spec}`), ...viewFilters];
  e2eRuns.push({
    label: smoke ? "the @smoke tests and the specs this change is about" : "the specs this change is about",
    args: [...(dev ? [] : ["--production"]), ...args, ...projects, ...passThrough],
  });
}
if (productionSpec && dev)
  e2eRuns.push({
    label: "production.spec.ts (a production build, with its service worker)",
    args: ["--production", "production.spec.ts", "--project=desktop", ...passThrough],
  });

// ------------------------------------------------------------------- running

// Each tool's own script, run with this Node: no shell to reinterpret the arguments (a grep's |).
const bin = (file) => path.join(appDir, "node_modules", file);
const stages = [];
if (formatted.length)
  stages.push({
    name: "static",
    what: `Prettier and ESLint on ${formatted.length} changed file(s)${typecheck ? ", then the typecheck" : ""}`,
    commands: [
      [bin("prettier/bin/prettier.cjs"), "--check", ...formatted],
      ...(linted.length ? [[bin("eslint/bin/eslint.js"), ...linted]] : []),
      ...(typecheck
        ? [
            [bin("next/dist/bin/next"), "typegen"],
            [bin("typescript/bin/tsc"), "--noEmit"],
          ]
        : []),
    ],
  });
if (unit.length)
  stages.push({ name: "unit", what: unit.join(" "), commands: [[bin("vitest/vitest.mjs"), "run", ...unit]] });
if (integration.size)
  stages.push({
    name: "integration",
    what: [...integration].join(" "),
    commands: [["scripts/run-e2e.mjs", "--integration", ...integration]],
  });
for (const run of e2eRuns)
  stages.push({
    name: "e2e",
    what: `${run.label}: ${run.args.join(" ")}`,
    commands: [["scripts/run-e2e.mjs", ...run.args]],
  });

console.log(`Changed: ${changed.length ? changed.join(", ") : "nothing"}`);
for (const reason of reasons) console.log(`  ${reason}`);
if (!stages.length) {
  console.log("Nothing to check or test for these changes.");
  process.exit(0);
}
for (const [index, stage] of stages.entries()) console.log(`${index + 1}. ${stage.name}: ${stage.what}`);
if (dryRun) process.exit(0);

const started = Date.now();
for (const stage of stages) {
  const stageStarted = Date.now();
  console.log(`\n▶ ${stage.name}: ${stage.what}`);
  for (const command of stage.commands) {
    const result = spawnSync(process.execPath, command, { cwd: appDir, stdio: "inherit" });
    if (result.status !== 0) {
      console.error(
        `\n✗ ${stage.name} failed (${path.basename(command[0])} ${command.slice(1).join(" ")}); the later stages didn't run.`,
      );
      process.exit(result.status ?? 1);
    }
  }
  console.log(`✓ ${stage.name} (${Math.round((Date.now() - stageStarted) / 1000)} s)`);
}
console.log(`\nAll passed in ${Math.round((Date.now() - started) / 1000)} s.`);
