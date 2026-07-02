import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "design-verify", "scripts", "responsive-smells.mjs");

let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), "dv-")); });
after(() => rmSync(dir, { recursive: true, force: true }));

function scan(name, content, args = []) {
  const f = join(dir, name);
  writeFileSync(f, content);
  return spawnSync("node", [SCRIPT, f, ...args], { encoding: "utf8" });
}

test("flags large fixed width without max-width", () => {
  const r = scan("a.css", `.panel { width: 640px; padding: 1rem; }`);
  assert.match(r.stdout, /\[fixed-width\] width: 640px/);
  assert.match(r.stdout, /horizontal scroll/);
});

test("allows fixed width when max-width is present", () => {
  const r = scan("b.css", `.panel { width: 640px; max-width: 100%; }`);
  assert.match(r.stdout, /clean/);
});

test("flags large arbitrary Tailwind width and viewport width", () => {
  const r = scan("c.tsx", `<div className="w-[800px]" /> <div className="w-screen" />`);
  assert.match(r.stdout, /w-\[800px\]/);
  assert.match(r.stdout, /\[viewport-width\] w-screen/);
});

test("flags sub-12px text in Tailwind and CSS", () => {
  const r = scan("d.tsx", `<span className="text-[10px]">x</span>`);
  assert.match(r.stdout, /\[tiny-text\] text-\[10px\]/);
  const r2 = scan("d.css", `.fine { font-size: 11px; }`);
  assert.match(r2.stdout, /\[tiny-text\] font-size: 11px/);
});

test("does not flag 12px+ text or small widths", () => {
  const r = scan("e.tsx", `<span className="text-[14px] w-[200px]">ok</span>`);
  assert.match(r.stdout, /clean/);
});

test("flags fixed pixel height on a content container", () => {
  const r = scan("f.tsx", `<article className="h-[300px]">long text</article>`);
  assert.match(r.stdout, /\[fixed-height\] h-\[300px\]/);
  assert.match(r.stdout, /clips content/);
});

test("responsive-ignore suppresses a line", () => {
  const r = scan("g.css", `.hero { width: 900px; } /* responsive-ignore: full-bleed marketing banner */`);
  assert.match(r.stdout, /clean/);
});

test("--strict exits 1 on findings, default exits 0", () => {
  writeFileSync(join(dir, "h.css"), `.x { width: 700px; }`);
  assert.equal(spawnSync("node", [SCRIPT, join(dir, "h.css")], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync("node", [SCRIPT, join(dir, "h.css"), "--strict"], { encoding: "utf8" }).status, 1);
});

test("--json structures the findings", () => {
  const r = scan("i.tsx", `<div className="w-[800px] text-[9px]" />`, ["--json"]);
  const out = JSON.parse(r.stdout);
  assert.equal(out.results[0].findings.length, 2);
  assert.ok(out.results[0].findings.some((f) => f.smell === "tiny-text"));
});
