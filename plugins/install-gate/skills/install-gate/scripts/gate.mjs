#!/usr/bin/env node
/**
 * install-gate — inspects package-install commands before they run.
 *
 * PreToolUse hook on Bash. Parses install commands across npm/pnpm/yarn/bun,
 * pip, and cargo, then evaluates each named package against offline heuristics
 * for the failure modes that actually bite:
 *
 *   - typosquats of popular packages (edit distance 1 from a known name)
 *   - slopsquats: plausible-but-nonexistent names an LLM might hallucinate
 *   - install-time code execution (lifecycle scripts enabled on untrusted deps)
 *   - risk-shaped flags (--allow-scripts, git/url/tarball sources, sudo pip)
 *
 * Offline by default: no install should wait on a network call to this hook,
 * and a hook that phones out is its own supply-chain surface. It decides on
 * heuristics and tells the agent what to verify.
 *
 *   node gate.mjs --hook        # PreToolUse (JSON on stdin), emits a decision
 *   node gate.mjs <command>     # evaluate a command string directly (CLI/CI)
 *
 * Exit 0 always in hook mode; the decision travels in JSON. Zero dependencies.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadList(name) {
  try {
    return new Set(JSON.parse(readFileSync(join(HERE, "..", "data", name), "utf8")));
  } catch {
    return new Set();
  }
}
// Top packages by ecosystem — the names most worth impersonating. Bundled,
// so the check is offline. Not exhaustive; it's a typosquat magnet list.
const POPULAR = {
  npm: loadList("popular-npm.json"),
  pip: loadList("popular-pip.json"),
  cargo: loadList("popular-cargo.json"),
};

// ---------------------------------------------------------------------------
// Command parsing
// ---------------------------------------------------------------------------

const INSTALL_VERBS = {
  npm: ["install", "i", "add", "ci"],
  pnpm: ["install", "i", "add"],
  yarn: ["add", "install"],
  bun: ["add", "install", "i"],
  pip: ["install"],
  pip3: ["install"],
  cargo: ["add", "install"],
};
const ECOSYSTEM = { npm: "npm", pnpm: "npm", yarn: "npm", bun: "npm", pip: "pip", pip3: "pip", cargo: "cargo" };

// Split a shell line on connectors so `a && npm i x` is seen.
function splitCommands(line) {
  return line.split(/&&|\|\||;|\|/).map((s) => s.trim()).filter(Boolean);
}

function tokenize(cmd) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(cmd))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

// Extracts { verb, flags, specs } from the tokens following the package
// manager name, shared by the direct-manager and `python -m pip` shapes.
function parseVerbSpecs(tokens, verbs) {
  const verb = tokens.find((t) => !t.startsWith("-"));
  if (!verb || !verbs.includes(verb)) return null;
  const afterVerb = tokens.slice(tokens.indexOf(verb) + 1);
  const flags = afterVerb.filter((t) => t.startsWith("-"));
  const specs = afterVerb.filter((t) => !t.startsWith("-"));
  return { verb, flags, specs };
}

function parseInstall(cmd) {
  const tokens = tokenize(cmd);
  let idx = 0;
  let sudo = false;
  if (tokens[idx] === "sudo") { sudo = true; idx++; }

  // `python -m pip install X` / `python3 -m pip install X` — a common
  // alternative to invoking `pip` directly, especially in venvs and CI.
  if (tokens[idx] === "python" || tokens[idx] === "python3") {
    if (tokens[idx + 1] === "-m" && (tokens[idx + 2] === "pip" || tokens[idx + 2] === "pip3")) {
      const parsed = parseVerbSpecs(tokens.slice(idx + 3), INSTALL_VERBS.pip);
      if (!parsed) return null;
      return { manager: "pip", ecosystem: "pip", ...parsed, sudo, raw: cmd };
    }
    return null; // `python script.py`, `python -c ...`, etc. — not a package install
  }

  const mgr = tokens[idx];
  if (!mgr || !INSTALL_VERBS[mgr]) return null;
  const parsed = parseVerbSpecs(tokens.slice(idx + 1), INSTALL_VERBS[mgr]);
  if (!parsed) return null;
  return { manager: mgr, ecosystem: ECOSYSTEM[mgr], ...parsed, sudo, raw: cmd };
}

// ---------------------------------------------------------------------------
// Package-name analysis
// ---------------------------------------------------------------------------

// Optimal string alignment (restricted Damerau-Levenshtein): standard
// insert/delete/substitute plus adjacent transpositions at cost 1. Plain
// Levenshtein scores "reqeusts" (swapped u/e) as distance 2 from "requests",
// which is exactly the class of typo a typosquatter counts on slipping past
// a naive check — transpositions are the most common real-world typo.
function levenshtein(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3; // early out; we only care about <=1
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

// Strip version/range/source off a spec to get the installable name.
function specName(spec, ecosystem) {
  if (/^(https?:|git\+|git:|file:|github:|[\w.-]+\/[\w.-]+#)/.test(spec)) return { name: null, source: spec };
  if (/\.(tgz|tar\.gz|whl)$/.test(spec)) return { name: null, source: spec };
  if (ecosystem === "pip") {
    const n = spec.split(/[<>=!~\[]/)[0].trim();
    return { name: n.toLowerCase(), source: null };
  }
  if (ecosystem === "cargo") return { name: spec.split("@")[0].trim(), source: null };
  // npm: keep scope, drop version after last @
  const at = spec.lastIndexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  return { name, source: null };
}

const KNOWN_SCOPES = new Set(["@types", "@babel", "@vitejs", "@eslint", "@typescript-eslint", "@testing-library", "@tailwindcss", "@anthropic-ai", "@openai", "@aws-sdk", "@nestjs", "@angular", "@vue", "@sveltejs"]);

function analyzeName(name, ecosystem) {
  const notes = [];
  if (!name) return notes;
  const popular = POPULAR[ecosystem] ?? new Set();

  if (popular.has(name)) return notes; // exact match to a known package: fine

  // Typosquat: edit distance 1 from a popular name of similar length.
  for (const known of popular) {
    if (known === name) continue;
    if (Math.abs(known.length - name.length) > 1) continue;
    if (levenshtein(name, known) === 1) {
      notes.push({ level: "block", why: `"${name}" is one character from the popular package "${known}" — classic typosquat` });
      break;
    }
  }

  // Scope impersonation: unknown scope resembling a known one.
  if (name.startsWith("@")) {
    const scope = name.split("/")[0];
    for (const known of KNOWN_SCOPES) {
      if (scope !== known && levenshtein(scope, known) === 1) {
        notes.push({ level: "block", why: `scope "${scope}" is one character from official "${known}" — impersonation risk` });
        break;
      }
    }
  }

  // Slopsquat heuristic: plausible utility name, not popular, not scoped. LLMs
  // invent these. We can't prove existence offline, so we ask the agent to.
  if (notes.length === 0 && !name.startsWith("@") && /^[a-z][a-z0-9-]{2,}$/.test(name)) {
    const slopShape = /(^|-)(ai|gpt|llm|utils?|helpers?|core|sdk|client|api|tools?|kit|wrapper)(-|$)/;
    if (slopShape.test(name)) {
      notes.push({ level: "verify", why: `"${name}" has a common-but-generic shape; if a model suggested it, confirm it exists and is the package you mean (hallucinated names are a supply-chain vector)` });
    }
  }
  return notes;
}

// ---------------------------------------------------------------------------
// Command-shape analysis
// ---------------------------------------------------------------------------

function analyzeShape(install) {
  const notes = [];
  const flagStr = install.flags.join(" ");

  if (/--allow-scripts|--foreground-scripts|--unsafe-perm/.test(flagStr)) {
    notes.push({ level: "block", why: `${install.manager} is told to run install-time lifecycle scripts (${flagStr.match(/--[\w-]+/)?.[0]}); that executes arbitrary code from every dep before you've run anything` });
  }
  if (install.sudo && install.ecosystem === "pip") {
    notes.push({ level: "block", why: "sudo pip install writes into system Python as root; use a virtualenv, and never run install-time code as root" });
  }
  for (const spec of install.specs) {
    const { source } = specName(spec, install.ecosystem);
    if (source) {
      notes.push({ level: "verify", why: `installing from a non-registry source (${source}); registry packages are at least subject to takedown and scanning — confirm you trust this origin` });
    }
  }
  return notes;
}

function evaluate(command) {
  const results = [];
  for (const sub of splitCommands(command)) {
    const install = parseInstall(sub);
    if (!install) continue;
    const notes = [...analyzeShape(install)];
    for (const spec of install.specs) {
      const { name } = specName(spec, install.ecosystem);
      for (const n of analyzeName(name, install.ecosystem)) notes.push({ ...n, package: name });
    }
    if (notes.length) results.push({ command: sub, notes });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function render(results) {
  const lines = [];
  for (const { command, notes } of results) {
    lines.push(`install-gate flagged: ${command}`);
    for (const n of notes) {
      const tag = n.level === "block" ? "BLOCK" : "VERIFY";
      lines.push(`  [${tag}] ${n.why}`);
    }
  }
  return lines.join("\n");
}

function hasBlock(results) {
  return results.some((r) => r.notes.some((n) => n.level === "block"));
}

function main() {
  if (process.argv.includes("--hook")) {
    let input = "";
    try { input = readFileSync(0, "utf8"); } catch { process.exit(0); }
    let payload;
    try { payload = JSON.parse(input); } catch { process.exit(0); }
    const command = payload?.tool_input?.command;
    if (typeof command !== "string") process.exit(0);

    const results = evaluate(command);
    if (!results.length) process.exit(0);

    const reason = render(results);
    const decision = hasBlock(results) ? "deny" : "ask";
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason + "\n\nOverride: re-run with the concern addressed, or confirm the package name against the registry first.",
      },
    }));
    process.exit(0);
  } else {
    const command = process.argv.slice(2).join(" ");
    if (!command) { process.stderr.write("usage: gate.mjs --hook | gate.mjs <install command>\n"); process.exit(64); }
    const results = evaluate(command);
    if (!results.length) { process.stdout.write("install-gate: nothing to flag\n"); process.exit(0); }
    process.stdout.write(render(results) + "\n");
    process.exit(hasBlock(results) ? 1 : 0);
  }
}

// Run only when invoked directly, not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { evaluate, parseInstall, analyzeName, levenshtein }; // for tests
