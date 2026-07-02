import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "writing", "scripts", "sloplint.mjs");

let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), "sloplint-")); });
after(() => rmSync(dir, { recursive: true, force: true }));

function lint(content, args = []) {
  const f = join(dir, `t-${Math.random().toString(36).slice(2)}.md`);
  writeFileSync(f, content);
  return spawnSync("node", [SCRIPT, ...args, f], { encoding: "utf8" });
}

test("certain tells fail with line numbers and reasons", () => {
  const r = lint("Intro line.\nLet's delve into this game-changer.\n");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /SLOP\s+\S+:2\s+"delve"/);
  assert.match(r.stdout, /game-changer/);
  assert.match(r.stdout, /Rewrite before publishing/);
});

test("suspicious-only passes by default, fails under --strict", () => {
  const text = "A robust system that can leverage the cache.\n";
  assert.equal(lint(text).status, 0);
  assert.equal(lint(text, ["--strict"]).status, 1);
  assert.match(lint(text).stdout, /susp/);
});

test("clean prose is clean", () => {
  const r = lint("The retry queue drops messages after three failures.\nWe measured 40ms cold starts.\n");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /clean/);
});

test("antithesis-as-rhythm and emoji headings are flagged", () => {
  const r = lint("## 🚀 Getting Started\nThis is not just a linter, but a way of thinking.\n", ["--strict"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /emoji-decorated heading/);
  assert.match(r.stdout, /antithesis/);
});

test("em-dash density fires on long dash-heavy text but not on sparse use", () => {
  const filler = "plain words ".repeat(150);
  const heavy = filler + "one — two — three — four — five — six — seven — eight.";
  const rHeavy = lint(heavy, ["--strict"]);
  assert.equal(rHeavy.status, 1);
  assert.match(rHeavy.stdout, /em dashes in \d+ words/);
  const sparse = filler + "a single aside — just one.";
  assert.equal(lint(sparse, ["--strict"]).status, 0);
});

test("sloplint-ignore skips a line, and matching is case-insensitive", () => {
  assert.equal(lint(`Banned example: "delve" <!-- sloplint-ignore -->\n`).status, 0);
  assert.equal(lint("Delving deeper here.\n").status, 1);
});

test("fenced code blocks and inline code spans are not prose", () => {
  const fenced = "Intro.\n```\nLet's delve into this game-changer.\n```\nOutro.\n";
  assert.equal(lint(fenced).status, 0);
  assert.equal(lint("The word `delve` is the canonical tell.\n").status, 0);
  const dashes = "— ".repeat(30) + "word ".repeat(250);
  assert.equal(lint("```\n" + dashes + "\n```\n" + "plain words ".repeat(220), ["--strict"]).status, 0,
    "em-dash density should only count prose");
});

test("adjective compounds like high-leverage are not the verb 'leverage'", () => {
  assert.equal(lint("This is the single highest-leverage rule.\n", ["--strict"]).status, 0);
  assert.equal(lint("We leverage the cache.\n", ["--strict"]).status, 1);
});

test("--json emits tiered findings", () => {
  const r = lint("We delve into a robust plan.\n", ["--json"]);
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.certain.length, 1);
  assert.equal(out.suspicious.length, 1);
  assert.equal(out.certain[0].line, 1);
});
