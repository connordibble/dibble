#!/usr/bin/env node
/**
 * token-drift compares a design-token source to a code-token source.
 *
 *   node diff-tokens.mjs <design-source> <code-source> [--json] [--strict]
 *
 * Sources can be W3C DTCG JSON or CSS custom properties. Exit 1 for value
 * drift, type mismatch, or alias cycles. Presence gaps warn by default and
 * fail with --strict.
 */

import { existsSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadConfig,
  normalizeColor,
  parseCssVars,
  parseDtcg,
  resolveAliases,
} from "./parse-dtcg.mjs";

const SEVERITY = new Map([
  ["CYCLE", 0],
  ["TYPE_MISMATCH", 1],
  ["VALUE_DRIFT", 2],
  ["MISSING_IN_CODE", 3],
  ["ORPHAN_IN_CODE", 4],
]);

const FAILING = new Set(["CYCLE", "TYPE_MISMATCH", "VALUE_DRIFT"]);

function usage() {
  return "usage: diff-tokens.mjs <design-source> <code-source> [--json] [--strict] [--format dtcg|css|auto]\n";
}

export function parseArgs(argv) {
  const opts = { asJson: false, strict: false, format: "auto", sources: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") opts.asJson = true;
    else if (arg === "--strict") opts.strict = true;
    else if (arg === "--format") opts.format = argv[++i];
    else if (arg.startsWith("--format=")) opts.format = arg.slice("--format=".length);
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg.startsWith("--")) throw new Error(`unknown option: ${arg}`);
    else opts.sources.push(arg);
  }

  if (!["auto", "dtcg", "css"].includes(opts.format)) {
    throw new Error("--format must be dtcg, css, or auto");
  }
  return opts;
}

function detectFormat(file, override) {
  if (override !== "auto") return override;
  const ext = extname(file).toLowerCase();
  if (ext === ".json") return "dtcg";
  if (ext === ".css" || ext === ".scss") return "css";
  throw new Error(`cannot detect token format for ${file}; pass --format dtcg or --format css`);
}

function parseSource(file, format, config) {
  if (!existsSync(file)) throw new Error(`file not found: ${file}`);
  const text = readFileSync(file, "utf8");
  if (format === "dtcg") return parseDtcg(text);
  if (format === "css") return parseCssVars(text, config);
  throw new Error(`unsupported token format: ${format}`);
}

function shouldSkip(key, design, code) {
  return Boolean(design.get(key)?.ignored || code.get(key)?.ignored);
}

function sortResults(results) {
  return results.sort((a, b) => {
    const severity = SEVERITY.get(a.verdict) - SEVERITY.get(b.verdict);
    return severity || a.key.localeCompare(b.key);
  });
}

export function diffTokenMaps(designInput, codeInput) {
  const designResolved = resolveAliases(designInput);
  const codeResolved = resolveAliases(codeInput);
  const design = designResolved.tokens;
  const code = codeResolved.tokens;
  const results = [
    ...designResolved.findings.map((f) => ({ ...f, side: "design" })),
    ...codeResolved.findings.map((f) => ({ ...f, side: "code" })),
  ];
  const cycleKeys = new Set(results.filter((r) => r.verdict === "CYCLE").map((r) => r.key));
  const keys = new Set([...design.keys(), ...code.keys()]);

  for (const key of keys) {
    if (cycleKeys.has(key) || shouldSkip(key, design, code)) continue;
    const d = design.get(key);
    const c = code.get(key);

    if (d && !c) {
      results.push({ key, verdict: "MISSING_IN_CODE", designValue: d.value, designType: d.type });
      continue;
    }
    if (!d && c) {
      results.push({ key, verdict: "ORPHAN_IN_CODE", codeValue: c.value, codeType: c.type });
      continue;
    }
    if (d.type && c.type && d.type !== c.type) {
      results.push({
        key,
        verdict: "TYPE_MISMATCH",
        designValue: d.value,
        codeValue: c.value,
        designType: d.type,
        codeType: c.type,
      });
      continue;
    }
    if (normalizeColor(d.value) !== normalizeColor(c.value)) {
      results.push({
        key,
        verdict: "VALUE_DRIFT",
        designValue: d.value,
        codeValue: c.value,
        designType: d.type,
        codeType: c.type,
      });
    }
  }

  return sortResults(results);
}

function displayPath(file) {
  const rel = relative(process.cwd(), file);
  return rel.startsWith("..") ? file : rel;
}

export function formatReport(results, designFile, codeFile, strict = false) {
  const out = [];
  if (!results.length) {
    return `token-drift: clean - ${displayPath(designFile)} matches ${displayPath(codeFile)}\n`;
  }

  out.push(`token-drift: ${results.length} finding(s) between ${displayPath(designFile)} and ${displayPath(codeFile)}`);
  out.push("");
  for (const verdict of [...SEVERITY.keys()]) {
    const group = results.filter((r) => r.verdict === verdict);
    if (!group.length) continue;
    const label = FAILING.has(verdict) || strict ? "fails" : "warns";
    out.push(`${verdict} (${label})`);
    for (const r of group) {
      out.push(`  ${r.key}`);
      if (r.side) out.push(`    side: ${r.side}`);
      if (r.cycle) out.push(`    cycle: ${r.cycle.join(" -> ")}`);
      if (r.designValue !== undefined) out.push(`    design: ${r.designValue}`);
      if (r.codeValue !== undefined) out.push(`    code:   ${r.codeValue}`);
      if (r.designType || r.codeType) {
        out.push(`    type:   ${r.designType ?? "n/a"} vs ${r.codeType ?? "n/a"}`);
      }
    }
    out.push("");
  }
  if (!strict && results.some((r) => !FAILING.has(r.verdict))) {
    out.push("Presence gaps warn by default. Add --strict to fail on missing or orphaned tokens.");
  }
  return out.join("\n").trimEnd() + "\n";
}

export function hasFailingResults(results, strict = false) {
  return results.some((r) => FAILING.has(r.verdict) || strict);
}

export function run(designPath, codePath, options = {}) {
  const designFile = resolve(designPath);
  const codeFile = resolve(codePath);
  const config = loadConfig(process.cwd());
  const designFormat = detectFormat(designFile, options.format ?? "auto");
  const codeFormat = detectFormat(codeFile, options.format ?? "auto");
  const design = parseSource(designFile, designFormat, config);
  const code = parseSource(codeFile, codeFormat, config);
  const results = diffTokenMaps(design, code);
  const failureCount = results.filter((r) => FAILING.has(r.verdict) || options.strict).length;

  return {
    driftCount: results.length,
    failureCount,
    results,
    text: formatReport(results, designFile, codeFile, options.strict),
    failed: hasFailingResults(results, options.strict),
  };
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`token-drift: ${error.message}\n${usage()}`);
    process.exit(64);
  }

  if (opts.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  if (opts.sources.length !== 2) {
    process.stderr.write(usage());
    process.exit(64);
  }

  try {
    const result = run(opts.sources[0], opts.sources[1], opts);
    if (opts.asJson) {
      process.stdout.write(JSON.stringify({
        driftCount: result.driftCount,
        failureCount: result.failureCount,
        results: result.results,
      }, null, 2) + "\n");
    } else {
      process.stdout.write(result.text);
    }
    process.exit(result.failed ? 1 : 0);
  } catch (error) {
    process.stderr.write(`token-drift: ${error.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
