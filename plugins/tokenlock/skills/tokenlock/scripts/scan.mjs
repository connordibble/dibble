#!/usr/bin/env node
/**
 * tokenlock scanner — finds design-token violations and suggests the token
 * that should have been used.
 *
 * Three entry points, one rule set:
 *   node scan.mjs --hook            # Claude Code PostToolUse hook (JSON on stdin)
 *   node scan.mjs <paths...>        # audit files/directories, human report
 *   node scan.mjs --json <paths...> # audit with machine-readable output (CI)
 *
 * Exit codes: 0 clean · hook mode: 2 violations (stderr fed back to the agent)
 *             audit mode: 1 violations
 *
 * Zero dependencies. Node 20+.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, basename, relative } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULTS = {
  mode: "correct", // correct | warn | off
  extensions: [".css", ".scss", ".tsx", ".jsx", ".vue", ".svelte", ".astro", ".html"],
  // Raw values that are fine anywhere.
  allowValues: ["transparent", "currentcolor", "inherit", "#000", "#fff", "#000000", "#ffffff"],
  tokenFiles: [], // explicit paths relative to project root; auto-discovered when empty
  ignore: ["node_modules", "dist", "build", ".next", "out", "coverage", ".git", "storybook-static"],
  maxReported: 20,
};

const TOKEN_FILE_NAMES = /^(globals?\.css|tokens?\.css|theme\.css|app\.css|variables\.css|.*\.tokens?\.(css|scss))$/;

// Next.js metadata images render through Satori with no CSS cascade — CSS
// custom properties can't resolve there, so hardcoded values are legitimate.
const NO_CASCADE_FILE_NAMES = /^(opengraph-image|twitter-image|apple-icon|icon)\.(tsx|jsx)$/;

function findProjectRoot(startDir) {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, ".git")) || existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir);
    dir = parent;
  }
}

function loadConfig(projectRoot) {
  const cfgPath = join(projectRoot, ".tokenlock.json");
  if (!existsSync(cfgPath)) return { ...DEFAULTS };
  try {
    const user = JSON.parse(readFileSync(cfgPath, "utf8"));
    return {
      ...DEFAULTS,
      ...user,
      // User lists replace defaults so strict shops can disallow even #fff.
      allowValues: (user.allowValues ?? DEFAULTS.allowValues).map((v) => v.toLowerCase()),
      ignore: [...DEFAULTS.ignore, ...(user.ignore ?? [])],
    };
  } catch {
    // A broken config should never brick the user's session; fall back loudly.
    process.stderr.write("tokenlock: .tokenlock.json is invalid JSON, using defaults\n");
    return { ...DEFAULTS };
  }
}

// ---------------------------------------------------------------------------
// Token index: value -> token name, built from the project's own token files
// ---------------------------------------------------------------------------

function normalizeColor(value) {
  let v = value.trim().toLowerCase().replace(/\s+/g, " ").replace(/,\s*/g, " ");
  const hex = v.match(/^#([0-9a-f]{3,4})$/);
  if (hex) v = "#" + [...hex[1]].map((c) => c + c).join("");
  return v;
}

function discoverTokenFiles(projectRoot, config, ignore) {
  if (config.tokenFiles.length) {
    return config.tokenFiles.map((p) => resolve(projectRoot, p)).filter((p) => existsSync(p));
  }
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 4 || found.length > 8) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (ignore.some((i) => e.name === i)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (TOKEN_FILE_NAMES.test(e.name)) found.push(full);
    }
  };
  walk(projectRoot, 0);
  return found;
}

function buildTokenIndex(tokenFiles, projectRoot) {
  const byValue = new Map(); // normalized value -> { name, file, line }
  const names = new Set();
  let usesThemeMapping = false;
  for (const file of tokenFiles) {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    if (/@theme/.test(text)) usesThemeMapping = true;
    text.split("\n").forEach((line, i) => {
      const m = line.match(/(--[\w-]+)\s*:\s*([^;]+);/);
      if (!m) return;
      const [, name, rawValue] = m;
      names.add(name);
      const value = normalizeColor(rawValue);
      if (!byValue.has(value)) {
        byValue.set(value, { name, file: relative(projectRoot, file), line: i + 1 });
      }
    });
  }
  return { byValue, names, usesThemeMapping, tokenFiles };
}

function suggestFor(rawValue, index) {
  const hit = index.byValue.get(normalizeColor(rawValue));
  if (!hit) return null;
  let s = `var(${hit.name})`;
  if (index.usesThemeMapping && hit.name.startsWith("--color-")) {
    s += ` or the mapped utility (e.g. bg-${hit.name.slice(8)})`;
  }
  return `${s} — defined in ${hit.file}:${hit.line}`;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILITY_PREFIX = "bg|text|border|ring|fill|stroke|outline|decoration|accent|caret|divide|shadow|inset-ring|from|via|to|placeholder";
const SHADES = "50|100|200|300|400|500|600|700|800|900|950";

const PALETTE_UTILITY = new RegExp(`\\b(?:${UTILITY_PREFIX})-(?:${PALETTE})-(?:${SHADES})(?:/\\d{1,3})?\\b`, "g");
const ARBITRARY_COLOR_UTILITY = new RegExp(`\\b(?:${UTILITY_PREFIX})-\\[(?:#[0-9a-fA-F]{3,8}|rgba?\\([^\\]]*\\)|hsla?\\([^\\]]*\\)|oklch\\([^\\]]*\\))\\]`, "g");
const HEX_LITERAL = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const FN_LITERAL = /\b(?:rgba?|hsla?|oklch|oklab)\((?:[^()]|\([^)]*\))*\)/g;

const IGNORE_MARKER = /tokenlock-ignore/;
const COMMENT_LINE = /^\s*(?:\/\/|\*|\/\*|<!--|\{\/\*)/;

function isCssLike(ext) {
  return ext === ".css" || ext === ".scss";
}

function scanSource(text, ext, config, index) {
  const violations = [];
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    if (IGNORE_MARKER.test(line)) return;
    if (COMMENT_LINE.test(line)) return;
    const lineNo = i + 1;
    const push = (kind, found, suggestion) =>
      violations.push({ line: lineNo, kind, found, suggestion });

    // Raw Tailwind palette utilities (any file type — they appear in markup)
    for (const m of line.matchAll(PALETTE_UTILITY)) {
      push("palette-utility", m[0], "use a token-mapped utility instead of the raw Tailwind palette");
    }
    for (const m of line.matchAll(ARBITRARY_COLOR_UTILITY)) {
      const value = m[0].slice(m[0].indexOf("[") + 1, -1);
      if (config.allowValues.includes(normalizeColor(value))) continue;
      push("arbitrary-color", m[0], suggestFor(value, index) ?? "no token matches this value — use an existing token or add one to the token file");
    }

    // Raw color literals (hex / rgb / hsl / oklch)
    for (const m of line.matchAll(HEX_LITERAL)) {
      if (config.allowValues.includes(normalizeColor(m[0]))) continue;
      // Inside an arbitrary utility it was already reported above.
      if (line.slice(Math.max(0, m.index - 1), m.index) === "[") continue;
      push("raw-hex", m[0], suggestFor(m[0], index) ?? "no token matches this value — use an existing token or add one to the token file");
    }
    if (isCssLike(ext) || /style\s*=|styled|css`/.test(line)) {
      for (const m of line.matchAll(FN_LITERAL)) {
        if (/var\(/.test(m[0])) continue;
        if (config.allowValues.includes(normalizeColor(m[0]))) continue;
        push("raw-color-fn", m[0], suggestFor(m[0], index) ?? "no token matches this value — use an existing token or add one to the token file");
      }
    }
  });
  return violations;
}

function isTokenDefinitionFile(filePath, index) {
  if (index.tokenFiles.some((t) => resolve(t) === resolve(filePath))) return true;
  return TOKEN_FILE_NAMES.test(basename(filePath)) || NO_CASCADE_FILE_NAMES.test(basename(filePath));
}

function scanFile(filePath, config, index) {
  const ext = extname(filePath);
  if (!config.extensions.includes(ext)) return [];
  if (isTokenDefinitionFile(filePath, index)) return [];
  let text;
  try { text = readFileSync(filePath, "utf8"); } catch { return []; }
  return scanSource(text, ext, config, index);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function formatReport(results, config) {
  const out = [];
  let total = 0;
  for (const { file, violations } of results) {
    total += violations.length;
    out.push(`tokenlock: ${violations.length} design-token violation${violations.length === 1 ? "" : "s"} in ${file}`);
    out.push("");
    for (const v of violations.slice(0, config.maxReported)) {
      out.push(`  ${String(v.line).padStart(4)}  ${v.found.padEnd(28)} → ${v.suggestion}`);
    }
    if (violations.length > config.maxReported) {
      out.push(`  … and ${violations.length - config.maxReported} more`);
    }
    out.push("");
  }
  out.push("Colors must come from the project's design tokens.");
  out.push("Look up the right token in the token files before rewriting; if no token fits, add one there first.");
  out.push("Escape hatches: /* tokenlock-ignore */ on the line, or the allow list in .tokenlock.json.");
  return { text: out.join("\n"), total };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function runHookMode() {
  let input = "";
  try { input = readFileSync(0, "utf8"); } catch { process.exit(0); }
  let payload;
  try { payload = JSON.parse(input); } catch { process.exit(0); }

  const filePath = payload?.tool_input?.file_path;
  if (!filePath || !existsSync(filePath)) process.exit(0);

  const projectRoot = findProjectRoot(dirname(filePath));
  const config = loadConfig(projectRoot);
  if (config.mode === "off") process.exit(0);

  const index = buildTokenIndex(discoverTokenFiles(projectRoot, config, config.ignore), projectRoot);
  const violations = scanFile(filePath, config, index);
  if (!violations.length) process.exit(0);

  const { text } = formatReport([{ file: relative(projectRoot, filePath), violations }], config);
  if (config.mode === "warn") {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text },
    }));
    process.exit(0);
  }
  process.stderr.write(text + "\n");
  process.exit(2); // stderr goes back to the agent, which fixes its own drift
}

function collectFiles(target, config, acc) {
  let st;
  try {
    st = statSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`path not found: ${target}`);
    throw error;
  }
  if (st.isFile()) { acc.push(target); return acc; }
  for (const e of readdirSync(target, { withFileTypes: true })) {
    if (config.ignore.includes(e.name)) continue;
    const full = join(target, e.name);
    if (e.isDirectory()) collectFiles(full, config, acc);
    else if (config.extensions.includes(extname(e.name))) acc.push(full);
  }
  return acc;
}

function runAuditMode(paths, asJson) {
  const projectRoot = findProjectRoot(paths[0] ? resolve(paths[0]) : process.cwd());
  const config = loadConfig(projectRoot);
  const index = buildTokenIndex(discoverTokenFiles(projectRoot, config, config.ignore), projectRoot);

  let files;
  try {
    files = paths.flatMap((p) => collectFiles(resolve(p), config, []));
  } catch (error) {
    process.stderr.write(`tokenlock: ${error.message}\n`);
    process.exit(2);
  }
  const results = files
    .map((f) => ({ file: relative(projectRoot, f), violations: scanFile(f, config, index) }))
    .filter((r) => r.violations.length);

  if (asJson) {
    process.stdout.write(JSON.stringify({ tokenFiles: index.tokenFiles.map((t) => relative(projectRoot, t)), results }, null, 2) + "\n");
  } else if (results.length) {
    const { text } = formatReport(results, config);
    process.stdout.write(text + "\n");
  } else {
    process.stdout.write(`tokenlock: clean — ${files.length} file(s) checked against ${index.byValue.size} token value(s)\n`);
  }
  process.exit(results.length ? 1 : 0);
}

const args = process.argv.slice(2);
if (args[0] === "--hook") {
  runHookMode();
} else {
  const asJson = args.includes("--json");
  const paths = args.filter((a) => a !== "--json");
  if (!paths.length) {
    process.stderr.write("usage: scan.mjs --hook | scan.mjs [--json] <paths...>\n");
    process.exit(64);
  }
  runAuditMode(paths, asJson);
}
