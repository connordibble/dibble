#!/usr/bin/env node
/**
 * zod-first-tools linter — flags the two-contracts drift smell.
 *
 * The antipattern: a file that both uses Zod AND hand-writes a JSON Schema
 * shape for a model tool ({ type: "object", properties: {...} } under an
 * input_schema / inputSchema / parameters key). That means two schemas for
 * one boundary, and they drift: a range lives in one, an enum value in the
 * other, "optional" means different things to each.
 *
 *   node lint-tools.mjs <files-or-dirs...> [--json]
 *
 * Exit 0 clean, 1 if any file maintains both. Heuristic and advisory: it
 * points at files to review, it doesn't rewrite them. Zero dependencies.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const targets = args.filter((a) => !a.startsWith("--"));
if (!targets.length) {
  process.stderr.write("usage: lint-tools.mjs <files-or-dirs...> [--json]\n");
  process.exit(64);
}

const EXT = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
const IGNORE = new Set(["node_modules", "dist", "build", ".next", "out", "coverage", ".git"]);

function collect(target, acc) {
  const st = statSync(target);
  if (st.isFile()) { if (EXT.has(extname(target))) acc.push(target); return acc; }
  for (const e of readdirSync(target, { withFileTypes: true })) {
    if (IGNORE.has(e.name)) continue;
    const full = join(target, e.name);
    if (e.isDirectory()) collect(full, acc);
    else if (EXT.has(extname(e.name))) acc.push(full);
  }
  return acc;
}

const USES_ZOD = /\bfrom\s+["']zod["']|\brequire\(\s*["']zod["']\s*\)|\bz\.(object|string|number|boolean|enum|array)\b/;
// A hand-written tool schema: a key that names the model-facing schema, whose
// value is an object literal declaring a JSON-Schema object type nearby.
const TOOL_SCHEMA_KEY = /\b(input_schema|inputSchema|parameters|json_schema|jsonSchema)\s*:\s*\{/;
const JSONSCHEMA_OBJECT = /["']?type["']?\s*:\s*["']object["']/;
const ALREADY_DERIVED = /toJSONSchema|zodToJsonSchema|zod-to-json-schema|zod-ai-tool|zodFunction|zodResponseFormat|zodTextFormat/;

function analyze(file) {
  const text = readFileSync(file, "utf8");
  if (!USES_ZOD.test(text)) return null;
  if (ALREADY_DERIVED.test(text)) return null; // already deriving from the schema: this is the good path

  const findings = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (!TOOL_SCHEMA_KEY.test(line)) return;
    // Confirm a JSON-Schema object literal is declared within a few lines.
    const window = lines.slice(i, i + 6).join("\n");
    if (JSONSCHEMA_OBJECT.test(window)) {
      const key = line.match(TOOL_SCHEMA_KEY)[1];
      findings.push({ line: i + 1, key });
    }
  });
  return findings.length ? { file, findings } : null;
}

const results = [];
for (const t of targets.flatMap((t) => collect(t, []))) {
  const r = analyze(t);
  if (r) results.push(r);
}

if (asJson) {
  process.stdout.write(JSON.stringify({ results }, null, 2) + "\n");
} else if (results.length) {
  for (const { file, findings } of results) {
    for (const f of findings) {
      process.stdout.write(`  ${file}:${f.line}  hand-written "${f.key}" alongside a Zod schema\n`);
    }
  }
  process.stdout.write(`\n${results.length} file(s) maintain two schemas for one tool boundary.\n`);
  process.stdout.write("Derive the provider schema from the Zod schema instead (see the zod-first-tools skill).\n");
} else {
  process.stdout.write("zod-first-tools: clean — no duplicated tool schemas found.\n");
}

process.exit(results.length ? 1 : 0);
