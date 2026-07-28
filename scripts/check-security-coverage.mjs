#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const targets = new Map([
  ["audit.mjs", 84],
  ["gate.mjs", 85],
  ["inspect.mjs", 87],
]);

const tests = [
  "plugins/agent-audit/tests/audit.test.mjs",
  "plugins/install-gate/tests/gate.test.mjs",
  "plugins/plugin-inspector/tests/inspect.test.mjs",
];

const result = spawnSync(process.execPath, ["--test", "--experimental-test-coverage", ...tests], {
  cwd: process.cwd(),
  encoding: "utf8",
});

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.status !== 0) process.exit(result.status ?? 1);

const measured = new Map();
for (const line of (result.stdout ?? "").split(/\r?\n/)) {
  const match = line.match(/\b(audit|gate|inspect)\.mjs\s+\|\s+[\d.]+\s+\|\s+([\d.]+)\s+\|/);
  if (match) measured.set(`${match[1]}.mjs`, Number(match[2]));
}

const failures = [];
for (const [file, floor] of targets) {
  const actual = measured.get(file);
  if (actual === undefined) failures.push(`${file}: missing from coverage report`);
  else if (actual < floor) failures.push(`${file}: ${actual.toFixed(2)}% branches, requires ${floor}%`);
}

if (failures.length) {
  process.stderr.write(`focused security coverage failed:\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}

process.stdout.write(`focused security coverage passed: ${[...targets].map(([file, floor]) => `${file} >= ${floor}% branches`).join(", ")}\n`);
