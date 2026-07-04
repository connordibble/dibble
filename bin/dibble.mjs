#!/usr/bin/env node
/**
 * `npx dibble <tool> [args...]` — single entry point that dispatches to each
 * plugin's checker script. The scripts still each publish their own
 * `dibble-<tool>` bin (documented in individual READMEs and useful when only
 * one tool is installed as a dependency); this is the easier-to-remember
 * front door for ad-hoc and CI use: one name, subcommands.
 *
 * Forwards stdin/stdout/stderr and the exit code untouched, so `--hook`
 * modes (which read JSON on stdin) work exactly as they do called directly.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const TOOLS = {
  tokenlock: "plugins/tokenlock/skills/tokenlock/scripts/scan.mjs",
  "token-drift": "plugins/token-drift/skills/token-drift/scripts/diff-tokens.mjs",
  sloplint: "plugins/no-slop/skills/writing/scripts/sloplint.mjs",
  "agent-audit": "plugins/agent-audit/skills/audit/scripts/audit.mjs",
  "install-gate": "plugins/install-gate/skills/install-gate/scripts/gate.mjs",
  receipts: "plugins/receipts/skills/receipts/scripts/check.mjs",
  "zod-lint": "plugins/zod-first-tools/skills/zod-first-tools/scripts/lint-tools.mjs",
  "readme-audit": "plugins/readme-that-sells/skills/readme/scripts/audit-readme.mjs",
  "responsive-smells": "plugins/design-verify/skills/design-verify/scripts/responsive-smells.mjs",
  "validate-marketplace": "plugins/marketplace-kit/skills/marketplace-kit/scripts/validate-marketplace.mjs",
};

function printHelp() {
  const width = Math.max(...Object.keys(TOOLS).map((k) => k.length));
  process.stdout.write("usage: dibble <tool> [args...]\n\ntools:\n");
  for (const name of Object.keys(TOOLS)) {
    process.stdout.write(`  ${name.padEnd(width)}  npx dibble ${name} ...\n`);
  }
  process.stdout.write("\neach tool also has its own npx-installable bin, e.g. `dibble-tokenlock`.\n");
  process.stdout.write("see https://github.com/connordibble/dibble for docs on each tool.\n");
}

const [tool, ...rest] = process.argv.slice(2);

if (!tool || tool === "--help" || tool === "-h") {
  printHelp();
  process.exit(tool ? 0 : 64);
}

const target = TOOLS[tool];
if (!target) {
  process.stderr.write(`dibble: unknown tool "${tool}"\n\n`);
  printHelp();
  process.exit(64);
}

const result = spawnSync(process.execPath, [join(ROOT, target), ...rest], { stdio: "inherit" });
process.exit(result.status ?? 1);
