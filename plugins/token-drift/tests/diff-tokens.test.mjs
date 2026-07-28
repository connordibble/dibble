import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "skills", "token-drift", "scripts", "diff-tokens.mjs");

let dir;
before(() => {
  dir = mkdtempSync(join(tmpdir(), "token-drift-"));
});
after(() => rmSync(dir, { recursive: true, force: true }));

function write(name, text) {
  const file = join(dir, `${Math.random().toString(36).slice(2)}-${name}`);
  writeFileSync(file, text);
  return file;
}

function json(obj) {
  return JSON.stringify(obj, null, 2);
}

function run(designText, codeText, args = [], names = ["design.tokens.json", "globals.css"]) {
  const design = write(names[0], designText);
  const code = write(names[1], codeText);
  return spawnSync(process.execPath, [SCRIPT, design, code, ...args], { encoding: "utf8" });
}

test("identical token sets are clean", () => {
  const r = run(
    json({ color: { brand: { 500: { $type: "color", $value: "#1d4ed8" } } } }),
    ":root {\n  --color-brand-500: #1d4ed8;\n}\n",
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /token-drift: clean/);
});

test("a value drift exits 1 and shows both values", () => {
  const r = run(
    json({ color: { brand: { 500: { $type: "color", $value: "#1d4ed8" } } } }),
    ":root {\n  --color-brand-500: #2563eb;\n}\n",
  );
  assert.equal(r.status, 1);
  assert.match(r.stdout, /VALUE_DRIFT/);
  assert.match(r.stdout, /design: #1d4ed8/);
  assert.match(r.stdout, /code:\s+#2563eb/);
});

test("a design-only token warns as MISSING_IN_CODE without failing", () => {
  const r = run(
    json({
      color: {
        brand: { 500: { $type: "color", $value: "#1d4ed8" } },
        new: { $type: "color", $value: "#0f766e" },
      },
    }),
    ":root {\n  --color-brand-500: #1d4ed8;\n}\n",
  );
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /MISSING_IN_CODE/);
  assert.match(r.stdout, /color\.new/);
});

test("a code-only token warns as ORPHAN_IN_CODE without failing", () => {
  const r = run(
    json({ color: { brand: { 500: { $type: "color", $value: "#1d4ed8" } } } }),
    ":root {\n  --color-brand-500: #1d4ed8;\n  --color-old: #71717a;\n}\n",
  );
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /ORPHAN_IN_CODE/);
  assert.match(r.stdout, /color\.old/);
});

test("a DTCG alias resolves before comparison", () => {
  const r = run(
    json({
      color: {
        brand: { 500: { $type: "color", $value: "#1d4ed8" } },
        action: { primary: { $type: "color", $value: "{color.brand.500}" } },
      },
    }),
    ":root {\n  --color-brand-500: #1d4ed8;\n  --color-action-primary: #1d4ed8;\n}\n",
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("a DTCG JSON Pointer whole-token reference resolves before comparison", () => {
  const source = JSON.stringify({
    color: {
      brand: { $type: "color", $value: "#1d4ed8" },
      action: { $type: "color", $ref: "#/color/brand/$value" },
    },
  });
  const css = ":root { --color-brand: #1d4ed8; --color-action: var(--color-brand); }";
  const r = run(source, css);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("a DTCG JSON Pointer to a whole token resolves its value instead of serializing metadata", () => {
  const source = JSON.stringify({
    color: {
      brand: { 500: { $type: "color", $value: "#ff0000" } },
      action: { $type: "color", $ref: "#/color/brand/500" },
    },
  });
  const css = ":root { --color-brand-500: #ff0000; --color-action: #ff0000; }";
  const r = run(source, css);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("invalid DTCG references fail as UNRESOLVED_REF instead of value drift", () => {
  for (const token of [
    { $type: "color", $ref: "#/color/nope/500/$value" },
    { $type: "color", $ref: "color.brand.500" },
    { $type: "color", $value: "#ff0000", $ref: "#/color/brand/500/$value" },
  ]) {
    const source = JSON.stringify({
      color: {
        brand: { 500: { $type: "color", $value: "#ff0000" } },
        broken: token,
      },
    });
    const css = ":root { --color-brand-500: #ff0000; --color-broken: #ff0000; }";
    const r = run(source, css);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /UNRESOLVED_REF/);
    assert.match(r.stdout, /color\.broken/);
    assert.doesNotMatch(r.stdout, /VALUE_DRIFT/);
  }
});

test("a missing brace-style alias target fails as UNRESOLVED_REF", () => {
  const source = JSON.stringify({ color: { action: { $type: "color", $value: "{color.missing}" } } });
  const css = ":root { --color-action: #ff0000; }";
  const r = run(source, css);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /UNRESOLVED_REF/);
  assert.match(r.stdout, /alias target does not exist/);
});

test("a DTCG JSON Pointer property reference resolves RFC 6901 escapes", () => {
  const source = JSON.stringify({
    "brand/color": { base: { $type: "color", $value: { hex: "#1d4ed8" }, $extensions: { "token-drift": "ignore" } } },
    extracted: { $type: "color", $ref: "#/brand~1color/base/$value/hex" },
  });
  const css = ":root { --extracted: #1d4ed8; }";
  const r = run(source, css);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("an alias cycle reports CYCLE and does not hang", () => {
  const r = run(
    json({
      color: {
        a: { $type: "color", $value: "{color.b}" },
        b: { $type: "color", $value: "{color.a}" },
      },
    }),
    ":root {}\n",
  );
  assert.equal(r.status, 1);
  assert.match(r.stdout, /CYCLE/);
  assert.match(r.stdout, /color\.a -> color\.b -> color\.a/);
});

test("default name mapping matches --color-brand-500 to color.brand.500", () => {
  const r = run(
    json({ color: { brand: { 500: { $type: "color", $value: "#1d4ed8" } } } }),
    ":root {\n  --color-brand-500: #1d4ed8;\n}\n",
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("a DTCG type mismatch fails", () => {
  const r = run(
    json({ space: { 2: { $type: "color", $value: "0.5rem" } } }),
    json({ space: { 2: { $type: "dimension", $value: "0.5rem" } } }),
    [],
    ["design.tokens.json", "code.tokens.json"],
  );
  assert.equal(r.status, 1);
  assert.match(r.stdout, /TYPE_MISMATCH/);
  assert.match(r.stdout, /color vs dimension/);
});

test("short hex color values normalize before comparison", () => {
  const r = run(
    json({ color: { ink: { $type: "color", $value: "#FFF" } } }),
    ":root {\n  --color-ink: #ffffff;\n}\n",
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("--json emits the expected shape and ignore markers suppress tokens", () => {
  const r = run(
    json({
      color: {
        brand: { 500: { $type: "color", $value: "#1d4ed8" } },
        old: {
          $type: "color",
          $value: "#111111",
          $extensions: { "token-drift": "ignore" },
        },
      },
    }),
    ":root {\n  --color-brand-500: #2563eb;\n  --color-old: #222222;\n}\n",
    ["--json"],
  );
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.driftCount, 1);
  assert.equal(out.failureCount, 1);
  assert.equal(out.results[0].verdict, "VALUE_DRIFT");
  assert.equal(out.results[0].key, "color.brand.500");
});

test("--strict fails on presence gaps", () => {
  const r = run(
    json({
      color: {
        brand: { 500: { $type: "color", $value: "#1d4ed8" } },
        new: { $type: "color", $value: "#0f766e" },
      },
    }),
    ":root {\n  --color-brand-500: #1d4ed8;\n}\n",
    ["--strict"],
  );
  assert.equal(r.status, 1);
  assert.match(r.stdout, /MISSING_IN_CODE \(fails\)/);
});
