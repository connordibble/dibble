#!/usr/bin/env node
/**
 * readme-that-sells auditor — measures the friction that actually gates
 * adoption of a developer tool: how fast a reader learns what it is, sees it
 * work, and installs it.
 *
 * These are structural proxies, not taste. Taste is the skill's job; this
 * script checks the load-bearing structure a great README almost always has.
 *
 *   node audit-readme.mjs README.md [--json]
 *
 * Exit 0 if no failures (warnings allowed), 1 if a load-bearing element is
 * missing. Zero dependencies.
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const file = args.find((a) => !a.startsWith("--"));
if (!file) { process.stderr.write("usage: audit-readme.mjs README.md [--json]\n"); process.exit(64); }

const text = readFileSync(file, "utf8");
const lines = text.split(/\r?\n/);

const checks = [];
const check = (level, name, ok, hint) => checks.push({ level, name, ok, hint });

// Locate structural landmarks by line number.
const firstHeading = lines.findIndex((l) => /^#\s/.test(l));
const title = firstHeading >= 0 ? lines[firstHeading].replace(/^#\s*/, "").trim() : null;

let inFence = false;
let firstCodeLine = -1;
const fenceLangs = [];
lines.forEach((l, i) => {
  const f = l.match(/^\s*(```|~~~)(\w+)?/);
  if (f) {
    if (!inFence && firstCodeLine < 0) firstCodeLine = i;
    if (!inFence && f[2]) fenceLangs.push(f[2]);
    inFence = !inFence;
  }
});

const INSTALL = /\b(npm|pnpm|yarn|bun)\s+(i|install|add|create)\b|\bpip3?\s+install\b|\bcargo\s+(add|install)\b|\bgo\s+get\b|\bbrew\s+install\b|\bnpx\b|\buvx?\b|\bdocker\s+(run|pull)\b|\/plugin\s+(install|marketplace)/;
const installLine = lines.findIndex((l) => INSTALL.test(l));

// The "subtitle": the first substantive non-heading, non-badge line after the title.
let subtitleIdx = -1;
for (let i = firstHeading + 1; i < lines.length; i++) {
  const l = lines[i].trim();
  if (!l) continue;
  if (/^!\[|^\[!\[|^<img|^<p|^#/.test(l)) continue; // badge / image / heading
  subtitleIdx = i; break;
}
const subtitle = subtitleIdx >= 0 ? lines[subtitleIdx].trim() : null;

const HYPE = /\b(revolutioniz\w*|game-?chang\w*|cutting-edge|state-of-the-art|blazing(ly)?\s*fast|supercharg\w*|effortless\w*|seamless\w*|powerful|the best|world-class|next-generation|paradigm)\b/i;

const SCOPE_SECTION = /^#{2,3}\s.*\b(limitation|scope|honest|caveat|non-goals?|what (it|this) (does not|doesn't|won't)|trade-?offs?|not )\b/im;

// --- checks ---
check("fail", "has a title", firstHeading >= 0 && Boolean(title),
  "start with a single `# Title` line");

check("fail", "one-line value proposition near the top",
  Boolean(subtitle) && subtitleIdx <= firstHeading + 6,
  "the line under the title should say what this is and who it's for, in one sentence");

check("fail", "install instructions in the first screen",
  installLine >= 0 && installLine <= 45,
  installLine < 0 ? "no install command found — a reader can't try it" : `install command is at line ${installLine + 1}; move it into the first ~40 lines`);

check("fail", "a code example in the first screen",
  firstCodeLine >= 0 && firstCodeLine <= 40,
  firstCodeLine < 0 ? "no fenced code block — show it working, don't just describe it" : `first code block is at line ${firstCodeLine + 1}; a reader should see output or usage above the fold`);

check("warn", "leads with substance, not hype",
  subtitle ? !HYPE.test(subtitle) : true,
  "the opening line uses marketing adjectives; a concrete claim (what it does, a number) converts better with developers");

check("warn", "states its scope or limitations honestly",
  SCOPE_SECTION.test(text),
  "add a short 'Limitations' or 'What it does not do' section; naming the edges reads as senior and preempts the top issue");

check("warn", "value proposition is tight",
  subtitle ? subtitle.replace(/[*_`]/g, "").length <= 200 : true,
  "the opening line runs long; one sentence a skimmer can absorb beats a paragraph");

// --- report ---
const fails = checks.filter((c) => !c.ok && c.level === "fail");
const warns = checks.filter((c) => !c.ok && c.level === "warn");

if (asJson) {
  process.stdout.write(JSON.stringify({ title, installLine: installLine + 1, firstCodeLine: firstCodeLine + 1, checks }, null, 2) + "\n");
} else {
  for (const c of checks) {
    const mark = c.ok ? "ok  " : c.level === "fail" ? "FAIL" : "warn";
    process.stdout.write(`  ${mark}  ${c.name}${c.ok ? "" : "\n          " + c.hint}\n`);
  }
  process.stdout.write(`\n${fails.length} failing, ${warns.length} warning(s). `);
  process.stdout.write(fails.length
    ? "Fix the failures: they're the difference between a reader trying it and bouncing.\n"
    : "Structure is sound. The skill covers the parts a script can't judge.\n");
}

process.exit(fails.length ? 1 : 0);
