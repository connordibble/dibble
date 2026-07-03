#!/usr/bin/env node
/**
 * Run the readme-that-sells structural auditor over every README in the repo.
 * Used by `pnpm lint:readmes` and CI. Exit 1 if any README fails.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const auditor = join(root, "plugins/readme-that-sells/skills/readme/scripts/audit-readme.mjs");

const targets = [
  join(root, "README.md"),
  ...readdirSync(join(root, "plugins"))
    .map((d) => join(root, "plugins", d, "README.md"))
    .filter(existsSync),
];

let failed = 0;
for (const f of targets) {
  const r = spawnSync("node", [auditor, f], { encoding: "utf8" });
  if (r.status !== 0) {
    failed++;
    process.stdout.write(`\nFAIL ${f}\n${r.stdout}`);
  }
}
process.stdout.write(failed ? `\n${failed} README(s) failed the audit\n` : `all ${targets.length} READMEs pass the audit\n`);
process.exit(failed ? 1 : 0);
