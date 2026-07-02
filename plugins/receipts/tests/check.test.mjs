import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "receipts", "scripts", "check.mjs");

let dir;
before(() => {
  dir = mkdtempSync(join(tmpdir(), "receipts-"));
  mkdirSync(join(dir, "sources"), { recursive: true });
  writeFileSync(
    join(dir, "sources", "agent-0423.txt"),
    "Interview 0423\nThe agent said: the ECRM screen just spins for 30 seconds before anything loads.\nThat is the whole quote.\n",
  );
  writeFileSync(join(dir, "sources", "agent-0511.txt"), "underwriting was smooth this quarter, no complaints there.\n");
});
after(() => rmSync(dir, { recursive: true, force: true }));

function run(md, args = []) {
  const f = join(dir, `s-${Math.random().toString(36).slice(2)}.md`);
  writeFileSync(f, md);
  return spawnSync("node", [SCRIPT, f, "--base", join(dir, "sources"), ...args], { encoding: "utf8" });
}

test("verbatim quote passes", () => {
  const r = run(
    `ECRM was the top complaint.[^e1]\n\n[^e1]: "the ECRM screen just spins for 30 seconds" — agent-0423.txt\n`,
  );
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /ok\s+\[\^e1\] VERBATIM/);
});

test("a reworded quote is caught as ALTERED with the real text", () => {
  const r = run(
    `ECRM was slow.[^e1]\n\n[^e1]: "the ECRM screen just hangs for 30 seconds" — agent-0423.txt\n`,
  );
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[\^e1\] ALTERED/);
  assert.match(r.stdout, /spins for 30 seconds/);
  assert.match(r.stdout, /reworded/);
});

test("a fabricated quote is UNSUPPORTED", () => {
  const r = run(
    `Agents loved the new flow.[^e1]\n\n[^e1]: "this is the best tool we have ever used" — agent-0423.txt\n`,
  );
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[\^e1\] UNSUPPORTED/);
});

test("missing source file is NO SOURCE", () => {
  const r = run(`Claim.[^e1]\n\n[^e1]: "anything" — nonexistent.txt\n`);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /NO SOURCE/);
});

test("orphan citation and unused evidence are both reported", () => {
  const r = run(
    `First claim.[^e1] Second claim.[^e2]\n\n[^e1]: "underwriting was smooth this quarter" — agent-0511.txt\n[^e3]: "the ECRM screen just spins for 30 seconds" — agent-0423.txt\n`,
  );
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[\^e2\] cited in prose but never defined/);
  assert.match(r.stdout, /\[\^e3\] evidence defined but never cited/);
});

test("curly quotes and :Lnn locators are handled", () => {
  const r = run(
    `Claim.[^e1]\n\n[^e1]: “the ECRM screen just spins for 30 seconds” — agent-0423.txt:L2\n`,
  );
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /VERBATIM/);
});

test("--json emits structured results", () => {
  const r = run(
    `Claim.[^e1]\n\n[^e1]: "the ECRM screen just spins for 30 seconds" — agent-0423.txt\n`,
    ["--json"],
  );
  const out = JSON.parse(r.stdout);
  assert.equal(out.results[0].status, "VERBATIM");
  assert.equal(out.results[0].id, "e1");
});

test("a summary with no citations nudges rather than passing silently", () => {
  const r = run(`Everything went great and agents were thrilled.\n`);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no citations found/);
});
