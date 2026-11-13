// npm run check:migrations (CI runs it): migrations only expand the schema in the
// release that needs the change, and contract it a release later.
//
// deploy.sh applies a release's migrations while the previous release is still
// serving, and a rollback runs an older image on the current schema. So a
// migration must not take away what the previous release still reads or writes:
// dropping or renaming a column or table, changing a column's type, or making a
// column NOT NULL. Those go in a later migration, once no deployed image uses
// them, and say so in a comment:
//
//   -- contract: events.notes, unread since v1.2.0
//
// The files up to 014 are older than this rule (012 and 014 dropped columns in
// the same release that stopped using them).

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const migrationsDir = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../../db/migrations/", import.meta.url));
const lastBeforeRule = 14;

// What takes something away from the schema, in SQL without its comments.
const contracting = [
  [/\bdrop\s+(column|table)\b/i, "drops a column or table"],
  [/\brename\s+(column\b|to\b)/i, "renames a column or table"],
  [/\balter\s+column\s+\S+\s+(set\s+data\s+)?type\b/i, "changes a column's type"],
  [/\bset\s+not\s+null\b/i, "makes a column NOT NULL"],
];

const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
const problems = [];
const numbers = new Set();

for (const file of files) {
  const match = file.match(/^(\d{3})_[a-z0-9_]+\.sql$/);
  if (!match) {
    problems.push(`${file}: name it NNN_words.sql (three digits, lowercase words with underscores)`);
    continue;
  }
  const number = Number(match[1]);
  if (numbers.has(number)) problems.push(`${file}: another migration has the number ${match[1]}`);
  numbers.add(number);
  if (number <= lastBeforeRule) continue;

  const text = await readFile(
    new URL(file, `file://${migrationsDir.replace(/\\/g, "/").replace(/\/?$/, "/")}`),
    "utf8",
  );
  const marked = /^\s*--\s*contract:/im.test(text);
  const sql = text.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [pattern, what] of contracting) {
    if (pattern.test(sql) && !marked) {
      problems.push(
        `${file}: ${what}. Do that a release after the code stops using it, with a "-- contract: <what>, unread since vX.Y.Z" comment (README.md, Migrations).`,
      );
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${files.length} migrations checked.`);
