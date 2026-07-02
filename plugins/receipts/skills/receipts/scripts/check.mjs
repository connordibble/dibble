#!/usr/bin/env node
/**
 * receipts — verifies that the quotes in an evidence-backed summary actually
 * appear in their sources, and that nothing was subtly reworded.
 *
 * Convention (footnote-style, plain Markdown):
 *
 *   Agents repeatedly hit ECRM timeouts on the floor.[^e1]
 *
 *   [^e1]: "the ECRM screen just spins for 30 seconds" — sources/agent-0423.txt
 *
 * The checker parses every evidence definition, extracts its quoted span and
 * cited source, and classifies it:
 *
 *   VERBATIM   — the quote appears in the source, character for character
 *   ALTERED    — a very similar span exists, but it was reworded (the dangerous
 *                case: a summary that drifted from its evidence and looks fine)
 *   UNSUPPORTED— no close match; the quote is not in the cited source
 *   NO SOURCE  — the cited file does not exist
 *
 * It also reports orphaned citations (referenced in prose, never defined) and
 * unused evidence (defined, never cited).
 *
 *   node check.mjs summary.md [--base sources/dir] [--json]
 *
 * Exit 0 = all evidence verbatim and every citation resolved; 1 = problems.
 * Zero dependencies.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join, isAbsolute } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const baseIdx = args.indexOf("--base");
const base = baseIdx >= 0 ? args[baseIdx + 1] : null;
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--base");

if (!file) {
  process.stderr.write("usage: check.mjs <summary.md> [--base sources/dir] [--json]\n");
  process.exit(64);
}

const doc = readFileSync(file, "utf8");
const docDir = dirname(resolve(file));
const sourceRoot = base ? resolve(base) : docDir;

// Fold curly quotes to straight and collapse whitespace, so quoting is robust
// to smart-quote substitution in either the summary or the source.
const foldQuotes = (s) => s.replace(/[“”„‟]/g, '"').replace(/[‘’‚‛]/g, "'");
const norm = (s) => foldQuotes(s).replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Parse citations and evidence definitions
// ---------------------------------------------------------------------------

// In-prose references: [^id] not immediately followed by a colon (that's a def)
const referenced = new Map(); // id -> count
for (const m of doc.matchAll(/\[\^([\w-]+)\](?!:)/g)) {
  referenced.set(m[1], (referenced.get(m[1]) ?? 0) + 1);
}

// Definitions: [^id]: "quote" — source
// The body is a quoted span followed by a separator and a source locator.
// Accepts straight or curly quotes; separator is em dash, "--", " - ", or " in ".
const defs = [];
for (const line of doc.split(/\r?\n/)) {
  const head = line.match(/^\[\^([\w-]+)\]:\s*(.*)$/);
  if (!head) continue;
  const id = head[1];
  const body = foldQuotes(head[2].trim());
  const q = body.match(/"([^"]+)"/);
  let quote, source, hadQuoteMarks;
  if (q) {
    hadQuoteMarks = true;
    quote = q[1];
    // Source is whatever follows the closing quote, minus a leading separator.
    source = body.slice(q.index + q[0].length).replace(/^\s*(?:—|--|·|-|in)\s*/i, "").trim();
  } else {
    hadQuoteMarks = false;
    const sep = body.match(/\s+(?:—|--|·|\bin\b)\s+/);
    if (sep) {
      quote = body.slice(0, sep.index).trim();
      source = body.slice(sep.index + sep[0].length).trim();
    } else {
      quote = body;
      source = "";
    }
  }
  defs.push({ id, quote, source, hadQuoteMarks });
}

// ---------------------------------------------------------------------------
// Verify each quote against its source
// ---------------------------------------------------------------------------

const sourceCache = new Map();
function loadSource(ref) {
  // Strip a trailing :Lnn or #anchor locator to get the path.
  const path = ref.replace(/[:#].*$/, "").trim();
  const full = isAbsolute(path) ? path : join(sourceRoot, path);
  if (sourceCache.has(full)) return sourceCache.get(full);
  const content = existsSync(full) ? readFileSync(full, "utf8") : null;
  sourceCache.set(full, content);
  return content;
}

function bestWindowSimilarity(needle, haystack) {
  // Token-based Jaccard over a sliding window sized to the needle. Cheap and
  // good enough to tell "reworded" from "not there at all".
  const nTokens = norm(needle).toLowerCase().split(" ").filter(Boolean);
  const hTokens = norm(haystack).toLowerCase().split(" ").filter(Boolean);
  if (!nTokens.length) return { score: 0, excerpt: "" };
  const win = nTokens.length;
  const nSet = new Set(nTokens);
  let best = 0, bestStart = 0;
  for (let i = 0; i + Math.ceil(win / 2) <= hTokens.length; i++) {
    const slice = hTokens.slice(i, i + win);
    const sSet = new Set(slice);
    let inter = 0;
    for (const t of sSet) if (nSet.has(t)) inter++;
    const score = inter / (nSet.size + sSet.size - inter);
    if (score > best) { best = score; bestStart = i; }
  }
  const excerpt = hTokens.slice(bestStart, bestStart + win).join(" ");
  return { score: best, excerpt };
}

const results = [];
for (const def of defs) {
  const content = loadSource(def.source);
  if (content === null) {
    results.push({ ...def, status: "NO SOURCE", detail: `cited file not found under ${base ? base : "the summary's directory"}` });
    continue;
  }
  if (norm(content).includes(norm(def.quote))) {
    results.push({ ...def, status: "VERBATIM" });
    continue;
  }
  const { score, excerpt } = bestWindowSimilarity(def.quote, content);
  if (score >= 0.6) {
    results.push({ ...def, status: "ALTERED", detail: `closest text in source: "${excerpt}"` });
  } else {
    results.push({ ...def, status: "UNSUPPORTED", detail: "no matching span in the cited source" });
  }
}

// Cross-reference integrity
const definedIds = new Set(defs.map((d) => d.id));
const orphans = [...referenced.keys()].filter((id) => !definedIds.has(id));
const unused = defs.filter((d) => !referenced.has(d.id)).map((d) => d.id);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const bad = results.filter((r) => r.status !== "VERBATIM");
const problems = bad.length + orphans.length + unused.length;

if (asJson) {
  process.stdout.write(JSON.stringify({ results, orphans, unused }, null, 2) + "\n");
} else if (!defs.length && !referenced.size) {
  process.stdout.write("receipts: no citations found. If this summary makes factual claims, back them with evidence footnotes.\n");
} else {
  for (const r of results) {
    const tag = r.status === "VERBATIM" ? "ok  " : "FAIL";
    process.stdout.write(`  ${tag}  [^${r.id}] ${r.status}${r.detail ? " — " + r.detail : ""}\n`);
  }
  for (const id of orphans) process.stdout.write(`  FAIL  [^${id}] cited in prose but never defined\n`);
  for (const id of unused) process.stdout.write(`  warn  [^${id}] evidence defined but never cited\n`);
  const verbatim = results.length - bad.length;
  process.stdout.write(`\n${results.length} evidence item(s): ${verbatim} verbatim, ${bad.length} problem(s), ${orphans.length} orphan(s), ${unused.length} unused.\n`);
  if (bad.some((r) => r.status === "ALTERED")) {
    process.stdout.write("ALTERED means the quote was reworded from the source. Restore the exact words or drop the quotation marks.\n");
  }
}

process.exit(problems ? 1 : 0);
