#!/usr/bin/env node
/**
 * responsive-smells — a static pre-screenshot pass for the mobile-hostile
 * patterns a 375px viewport would expose. Cheap to run before spinning up a
 * browser, and it points the visual check straight at the risky lines.
 *
 *   node responsive-smells.mjs <files-or-dirs...> [--json]
 *
 * Flags, with the reason each one breaks at narrow widths:
 *   - large fixed pixel widths with no max-width (overflow the viewport)
 *   - viewport-width sizing (w-screen / 100vw) (overflow once a scrollbar exists)
 *   - sub-12px text (unreadable / below tap-legibility on phones)
 *   - fixed pixel heights on content containers (clip text when it wraps)
 *
 * Advisory: exit 0 always in default mode (these are smells, not errors);
 * pass --strict to exit 1 on any finding for CI. Zero dependencies.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const strict = args.includes("--strict");
const targets = args.filter((a) => !a.startsWith("--"));
if (!targets.length) { process.stderr.write("usage: responsive-smells.mjs <files-or-dirs...> [--json] [--strict]\n"); process.exit(64); }

const EXT = new Set([".css", ".scss", ".tsx", ".jsx", ".vue", ".svelte", ".astro", ".html"]);
const IGNORE = new Set(["node_modules", "dist", "build", ".next", "out", "coverage", ".git"]);
const MOBILE_WIDTH = 375;

function collect(t, acc) {
  const st = statSync(t);
  if (st.isFile()) { if (EXT.has(extname(t))) acc.push(t); return acc; }
  for (const e of readdirSync(t, { withFileTypes: true })) {
    if (IGNORE.has(e.name)) continue;
    const full = join(t, e.name);
    if (e.isDirectory()) collect(full, acc);
    else if (EXT.has(extname(e.name))) acc.push(full);
  }
  return acc;
}

function scanLine(line) {
  const hits = [];
  if (/responsive-ignore/.test(line)) return hits;

  // CSS fixed width in px, large, with no max-width on the same line.
  for (const m of line.matchAll(/(?<!max-)(?<!min-)\bwidth\s*:\s*(\d{3,})px/g)) {
    if (Number(m[1]) > MOBILE_WIDTH && !/max-width/.test(line)) {
      hits.push({ smell: "fixed-width", found: m[0], why: `${m[1]}px is wider than a 375px viewport and has no max-width; it will force horizontal scroll on mobile` });
    }
  }
  // Tailwind arbitrary width, large.
  for (const m of line.matchAll(/\bw-\[(\d{3,})px\]/g)) {
    if (Number(m[1]) > MOBILE_WIDTH) {
      hits.push({ smell: "fixed-width", found: m[0], why: `w-[${m[1]}px] exceeds a 375px viewport; use max-w-* or a responsive width` });
    }
  }
  // Viewport-width sizing.
  for (const m of line.matchAll(/\bw-screen\b|\b100vw\b|width\s*:\s*100vw/g)) {
    hits.push({ smell: "viewport-width", found: m[0].trim(), why: "100vw / w-screen includes the scrollbar width and overflows the body; use w-full" });
  }
  // Sub-12px text (Tailwind arbitrary or CSS).
  for (const m of line.matchAll(/\btext-\[(\d{1,2})px\]/g)) {
    if (Number(m[1]) < 12) hits.push({ smell: "tiny-text", found: m[0], why: `${m[1]}px text is below comfortable mobile legibility (~12px floor)` });
  }
  for (const m of line.matchAll(/font-size\s*:\s*(\d{1,2})px/g)) {
    if (Number(m[1]) < 12) hits.push({ smell: "tiny-text", found: m[0], why: `${m[1]}px text is below comfortable mobile legibility (~12px floor)` });
  }
  // Fixed pixel height on something that holds content.
  for (const m of line.matchAll(/\bh-\[(\d{3,})px\]/g)) {
    if (Number(m[1]) >= 100) hits.push({ smell: "fixed-height", found: m[0], why: `h-[${m[1]}px] clips content when text wraps at narrow widths; prefer min-h-* so it can grow` });
  }
  return hits;
}

const results = [];
for (const file of targets.flatMap((t) => collect(t, []))) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  const findings = [];
  text.split("\n").forEach((line, i) => {
    for (const h of scanLine(line)) findings.push({ line: i + 1, ...h });
  });
  if (findings.length) results.push({ file, findings });
}

const total = results.reduce((n, r) => n + r.findings.length, 0);

if (asJson) {
  process.stdout.write(JSON.stringify({ results }, null, 2) + "\n");
} else if (total) {
  for (const { file, findings } of results) {
    for (const f of findings) process.stdout.write(`  ${file}:${f.line}  [${f.smell}] ${f.found} — ${f.why}\n`);
  }
  process.stdout.write(`\n${total} responsive smell(s) across ${results.length} file(s). Verify these at 375px in the browser.\n`);
} else {
  process.stdout.write("responsive-smells: clean — no obvious mobile-overflow patterns.\n");
}

process.exit(strict && total ? 1 : 0);
