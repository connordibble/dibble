#!/usr/bin/env node
/**
 * sloplint — deterministic detector for the statistical tells of machine prose.
 *
 *   node sloplint.mjs <files...>            # report, exit 1 on "certain" findings
 *   node sloplint.mjs --strict <files...>   # suspicious findings also fail
 *   node sloplint.mjs --json <files...>     # machine-readable output
 *
 * Two tiers, deliberately:
 *   certain    — phrases with effectively zero false-positive rate in
 *                technical writing ("delve", "game-changer", "look no further")
 *   suspicious — words that are fine in moderation but are load-bearing slop
 *                signals ("robust", "leverage", "seamless", antithesis runs)
 *
 * The list is intentionally conservative. A linter that cries wolf gets
 * disabled; a short list people trust gets run. Zero dependencies.
 */

import { readFileSync } from "node:fs";

const CERTAIN = [
  { re: /\bdelv(?:e|es|ed|ing)\b/i, note: "the canonical LLM tell" },
  { re: /\bit'?s (?:important|worth) (?:to note|noting)\b/i, note: "filler; state the thing or cut it" },
  { re: /\bin today'?s (?:fast-paced|ever-changing|ever-evolving|digital|modern)\b/i, note: "stock intro; no reader has ever needed it" },
  { re: /\bin the ever-evolving (?:world|landscape|realm|field) of\b/i, note: "stock intro" },
  { re: /\bgame-?chang(?:er|ing)\b/i, note: "hype without evidence" },
  { re: /\brevolutioniz\w*/i, note: "hype without evidence" },
  { re: /\bunlock (?:the )?(?:power|potential|full potential)\b/i, note: "marketing register" },
  { re: /\bunleash(?:es|ing)?\b/i, note: "marketing register" },
  { re: /\bsupercharg\w*/i, note: "marketing register" },
  { re: /\btake\b[^.!?\n]{0,40}\bto the next level\b/i, note: "marketing register" },
  { re: /\blook no further\b/i, note: "listicle voice" },
  { re: /\bharness(?:es|ing)? the power\b/i, note: "marketing register" },
  { re: /\ba testament to\b/i, note: "AI-register tic" },
  { re: /\bsay (?:goodbye|hello) to\b/i, note: "ad copy construction" },
  { re: /\bwe'?ve got you covered\b/i, note: "ad copy construction" },
  { re: /\bbuckle up\b/i, note: "false excitement" },
  { re: /\blet'?s dive in\b/i, note: "false excitement" },
  { re: /\belevate your\b/i, note: "marketing register" },
  { re: /\bseamless(?:ly)? integrat\w*/i, note: "the claim every broken integration makes" },
  { re: /\bwhether you'?re an? \w+[^.!?\n]{0,60}\bor an? \b/i, note: "audience-pandering construction" },
  { re: /\bthe best part\?/i, note: "listicle voice" },
];

const SUSPICIOUS = [
  { re: /(?<!-)\bleverag(?:e|es|ed|ing)\b/i, note: "'use' said expensively (the verb; 'high-leverage' is fine)" },
  { re: /\brobust\b/i, note: "fine once; a tell in bulk — show the failure mode it survives instead" },
  { re: /\bseamless(?:ly)?\b/i, note: "unfalsifiable claim" },
  { re: /\bcutting-edge\b/i, note: "hype; name the technique instead" },
  { re: /\bstate-of-the-art\b/i, note: "hype unless citing a benchmark" },
  { re: /\bbest-in-class\b/i, note: "hype" },
  { re: /\bdeep dive\b/i, note: "usually announces depth instead of providing it" },
  { re: /\bdive into\b/i, note: "usually announces depth instead of providing it" },
  { re: /\bboasts?\b(?! about)/i, note: "brochure verb" },
  { re: /\bempower(?:s|ed|ing)?\b/i, note: "marketing register" },
  { re: /\beffortless(?:ly)?\b/i, note: "unfalsifiable claim" },
  { re: /\bsimply put\b/i, note: "filler; if it were simple you'd have put it simply" },
  { re: /\bneedless to say\b/i, note: "then don't" },
  { re: /\bat the end of the day\b/i, note: "filler" },
  { re: /\bplethora\b/i, note: "'many', dressed up" },
  { re: /\bmyriad of\b/i, note: "'many', dressed up" },
  { re: /\bnot (?:just|only|merely)\b[^.!?\n]{0,80}\bbut\b/i, note: "antithesis-as-rhythm; fine as a real thesis, a tell as decoration" },
  { re: /\bisn'?t just (?:about )?\b/i, note: "antithesis-as-rhythm" },
  { re: /\bmore than just\b/i, note: "antithesis-as-rhythm" },
  { re: /\bin the (?:world|realm|landscape) of\b/i, note: "scene-setting filler" },
  { re: /^#{1,6}\s.*(?:\p{Extended_Pictographic})/u, note: "emoji-decorated heading", perLine: true },
];

const EM_DASH_PER_1000_WORDS = 4;

function lintText(text, file) {
  const findings = [];
  const lines = text.split("\n");

  // Prose only: fenced code blocks and inline code spans are verbatim
  // material (examples, CLI output), not the author's claims.
  let inFence = false;
  const proseLines = lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return ""; }
    return inFence ? "" : line.replace(/`[^`]*`/g, "");
  });

  proseLines.forEach((line, i) => {
    if (/sloplint-ignore/.test(line)) return;
    for (const { re, note } of CERTAIN) {
      const m = line.match(re);
      if (m) findings.push({ file, line: i + 1, tier: "certain", match: m[0], note });
    }
    for (const { re, note } of SUSPICIOUS) {
      const m = line.match(re);
      if (m) findings.push({ file, line: i + 1, tier: "suspicious", match: m[0], note });
    }
  });

  const prose = proseLines.join("\n");
  const words = prose.split(/\s+/).filter(Boolean).length;
  const emDashes = (prose.match(/—/g) ?? []).length;
  if (words > 200 && emDashes / words > EM_DASH_PER_1000_WORDS / 1000) {
    findings.push({
      file, line: 0, tier: "suspicious",
      match: `${emDashes} em dashes in ${words} words`,
      note: "em-dash density is a strong machine-prose signal; most survive rewriting as commas, colons, or periods",
    });
  }
  return findings;
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const asJson = args.includes("--json");
  const files = args.filter((a) => !a.startsWith("--"));
  if (!files.length) {
    process.stderr.write("usage: sloplint.mjs [--strict] [--json] <files...>\n");
    process.exit(64);
  }

  const findings = files.flatMap((f) => {
    try { return lintText(readFileSync(f, "utf8"), f); }
    catch (e) { process.stderr.write(`sloplint: cannot read ${f}: ${e.message}\n`); return []; }
  });

  const certain = findings.filter((x) => x.tier === "certain");
  const suspicious = findings.filter((x) => x.tier === "suspicious");

  if (asJson) {
    process.stdout.write(JSON.stringify({ certain, suspicious }, null, 2) + "\n");
  } else if (findings.length) {
    for (const v of findings) {
      const loc = v.line ? `${v.file}:${v.line}` : v.file;
      process.stdout.write(`  ${v.tier === "certain" ? "SLOP" : "susp"}  ${loc}  "${v.match}" — ${v.note}\n`);
    }
    process.stdout.write(`\n${certain.length} certain, ${suspicious.length} suspicious. `);
    process.stdout.write(certain.length ? "Rewrite before publishing.\n" : "Review the suspicious hits in context.\n");
  } else {
    process.stdout.write("sloplint: clean\n");
  }

  process.exit(certain.length || (strict && suspicious.length) ? 1 : 0);
}

main();
