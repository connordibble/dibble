import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "tokenlock", "scripts", "scan.mjs");

let root;

function write(rel, content) {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

function runHook(filePath) {
  return spawnSync("node", [SCRIPT, "--hook"], {
    input: JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: filePath } }),
    encoding: "utf8",
  });
}

function runAudit(args) {
  return spawnSync("node", [SCRIPT, ...args], { encoding: "utf8", cwd: root });
}

before(() => {
  root = mkdtempSync(join(tmpdir(), "tokenlock-"));
  write("package.json", "{}"); // marks the project root
  write(
    "src/app/globals.css",
    [
      "@theme {",
      "  --color-surface: #18181b;",
      "  --color-accent: oklch(0.7 0.15 250);",
      "  --color-paper: rgb(250 250 250);",
      "}",
    ].join("\n"),
  );
});

after(() => rmSync(root, { recursive: true, force: true }));

test("hook blocks a hardcoded hex and suggests the matching token", () => {
  const f = write("src/components/Card.tsx", `export const Card = () => <div style={{ background: "#18181B" }} />;`);
  const r = runHook(f);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /#18181B/);
  assert.match(r.stderr, /var\(--color-surface\)/);
  assert.match(r.stderr, /globals\.css:2/);
  assert.match(r.stderr, /bg-surface/, "should mention the @theme-mapped utility");
});

test("hook flags raw Tailwind palette utilities, including opacity modifiers", () => {
  const f = write("src/components/Nav.tsx", `<nav className="bg-zinc-900/80 text-slate-200 border-red-500">x</nav>`);
  const r = runHook(f);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /bg-zinc-900\/80/);
  assert.match(r.stderr, /text-slate-200/);
  assert.match(r.stderr, /border-red-500/);
});

test("hook flags arbitrary color utilities and rgb literals in css", () => {
  const f = write("src/components/hero.css", `.hero { color: rgb(250, 250, 250); }`);
  const r = runHook(f);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /var\(--color-paper\)/, "rgb(250, 250, 250) should normalize-match rgb(250 250 250)");

  const g = write("src/components/Hero.tsx", `<div className="bg-[#ff0000]" />`);
  const r2 = runHook(g);
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /bg-\[#ff0000\]/);
  assert.match(r2.stderr, /no token matches/);
});

test("clean files, allowed values, ignore markers, and comments pass silently", () => {
  const f = write(
    "src/components/Ok.tsx",
    [
      `// legacy color was #123456`,
      `<div className="bg-surface text-accent">`,
      `  <span style={{ color: "#ff00aa" }} /> {/* tokenlock-ignore */}`,
      `  <i className="bg-white" style={{ outline: "#fff" }} />`,
      `</div>`,
    ].join("\n"),
  );
  const r = runHook(f);
  assert.equal(r.status, 0, r.stderr);
});

test("token definition files are exempt", () => {
  const r = runHook(join(root, "src/app/globals.css"));
  assert.equal(r.status, 0, r.stderr);
});

test("Next.js metadata images (no CSS cascade) are exempt", () => {
  const f = write("src/app/opengraph-image.tsx", `export default () => <div style={{ background: "#18181b" }} />;`);
  const r = runHook(f);
  assert.equal(r.status, 0, r.stderr);
});

test("hook ignores unscanned extensions and missing input", () => {
  const f = write("scripts/deploy.py", `COLOR = "#18181b"`);
  assert.equal(runHook(f).status, 0);
  const r = spawnSync("node", [SCRIPT, "--hook"], { input: "{}", encoding: "utf8" });
  assert.equal(r.status, 0);
  const r2 = spawnSync("node", [SCRIPT, "--hook"], { input: "not json", encoding: "utf8" });
  assert.equal(r2.status, 0);
});

test("warn mode reports through additionalContext instead of exit 2", () => {
  write(".tokenlock.json", `{ "mode": "warn" }`);
  const f = write("src/components/Warned.tsx", `<div className="bg-zinc-900" />`);
  const r = runHook(f);
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(out.hookSpecificOutput.additionalContext, /bg-zinc-900/);
  rmSync(join(root, ".tokenlock.json"));
});

test("off mode disables scanning", () => {
  write(".tokenlock.json", `{ "mode": "off" }`);
  const f = write("src/components/Off.tsx", `<div className="bg-zinc-900" />`);
  assert.equal(runHook(f).status, 0);
  rmSync(join(root, ".tokenlock.json"));
});

test("audit mode reports across a directory and exits 1", () => {
  const r = runAudit(["src"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Card\.tsx/);
  assert.match(r.stdout, /Nav\.tsx/);
});

test("audit --json emits machine-readable results", () => {
  const r = runAudit(["--json", "src"]);
  assert.equal(r.status, 1);
  const parsed = JSON.parse(r.stdout);
  assert.ok(Array.isArray(parsed.results));
  assert.ok(parsed.results.some((x) => x.file.endsWith("Card.tsx")));
  assert.ok(parsed.tokenFiles.some((x) => x.endsWith("globals.css")));
});

test("strict config can disallow default-allowed values like #fff", () => {
  write(".tokenlock.json", `{ "allowValues": ["transparent"] }`);
  const f = write("src/components/Strict.tsx", `<div style={{ color: "#fff" }} />`);
  const r = runHook(f);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /#fff/);
  rmSync(join(root, ".tokenlock.json"));
});
