import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "readme", "scripts", "audit-readme.mjs");

let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), "rts-")); });
after(() => rmSync(dir, { recursive: true, force: true }));

function audit(md, args = []) {
  const f = join(dir, `r-${Math.random().toString(36).slice(2)}.md`);
  writeFileSync(f, md);
  return spawnSync("node", [SCRIPT, f, ...args], { encoding: "utf8" });
}

const GOOD = `# widget

Turns your logs into flamegraphs in one command, for Node services.

\`\`\`
npm install widget
widget serve ./logs
\`\`\`

## Limitations

Only reads JSON logs. Won't parse plaintext.
`;

test("a well-structured README passes", () => {
  const r = audit(GOOD);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /Structure is sound/);
});

test("missing install and code blocks fail", () => {
  const r = audit(`# widget\n\nA logging tool for Node.\n\nIt does many things across your stack.\n`);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL {2}install instructions/);
  assert.match(r.stdout, /FAIL {2}a code example/);
});

test("install buried past the first screen fails with a line number", () => {
  const filler = Array.from({ length: 50 }, (_, i) => `Line ${i} of preamble.`).join("\n");
  const r = audit(`# widget\n\nA tool.\n\n${filler}\n\n\`\`\`\nnpm install widget\n\`\`\`\n`);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /install command is at line \d+/);
});

test("hype in the opening line warns but does not fail", () => {
  const r = audit(`# widget\n\nThe most powerful, blazing fast, revolutionary logging tool.\n\n\`\`\`\nnpm install widget\n\`\`\`\n`);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /warn {2}leads with substance/);
});

test("missing scope section warns", () => {
  const r = audit(`# widget\n\nA logging tool for Node.\n\n\`\`\`\nnpm i widget\n\`\`\`\n`);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /warn {2}states its scope/);
});

test("--json exposes landmarks", () => {
  const r = audit(GOOD, ["--json"]);
  const out = JSON.parse(r.stdout);
  assert.equal(out.title, "widget");
  assert.ok(out.installLine > 0);
  assert.ok(out.checks.every((c) => typeof c.ok === "boolean"));
});

test("/plugin install counts as an install instruction", () => {
  const r = audit(`# my-plugin\n\nA Claude Code plugin that lints tokens.\n\n\`\`\`\n/plugin install my-plugin@dibble\n\`\`\`\n\n## What it does not do\n\nDoesn't touch JS files.\n`);
  assert.equal(r.status, 0, r.stdout);
});
