import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const DEFAULT_CONFIG = {
  cssPrefix: "--",
  separator: "-",
  dtcgSeparator: ".",
};

const DTCG_ALIAS = /^\{([^{}]+)\}$/;
const CSS_ALIAS = /^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,[^)]+)?\)$/;

function stableStringify(value) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if ("value" in value && "unit" in value) return `${value.value}${value.unit}`;
  if ("hex" in value) return String(value.hex);
  if ("color" in value) return String(value.color);
  const sorted = Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(sorted);
}

export function normalizeColor(value) {
  let v = stableStringify(value)
    .trim()
    .toLowerCase()
    .replace(/\s*!important\s*$/, "")
    .replace(/,\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");

  const shortHex = v.match(/^#([0-9a-f]{3,4})$/);
  if (shortHex) {
    v = "#" + [...shortHex[1]].map((c) => c + c).join("");
  }
  return v;
}

export function normalizeCssName(name, config = DEFAULT_CONFIG) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  let key = name.trim();
  if (merged.cssPrefix && key.startsWith(merged.cssPrefix)) {
    key = key.slice(merged.cssPrefix.length);
  } else {
    key = key.replace(/^--/, "");
  }
  key = key.replace(/^-+/, "");
  return key
    .split(merged.separator)
    .filter(Boolean)
    .join(merged.dtcgSeparator);
}

export function loadConfig(startDir = process.cwd()) {
  let dir = resolve(startDir);
  while (true) {
    const configPath = join(dir, ".token-drift.json");
    if (existsSync(configPath)) {
      try {
        const user = JSON.parse(readFileSync(configPath, "utf8"));
        return { ...DEFAULT_CONFIG, ...user };
      } catch {
        process.stderr.write("token-drift: .token-drift.json is invalid JSON, using defaults\n");
        return { ...DEFAULT_CONFIG };
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return { ...DEFAULT_CONFIG };
    dir = parent;
  }
}

function isTokenNode(value) {
  return value && typeof value === "object" && Object.hasOwn(value, "$value");
}

function ignoredByExtension(node, inheritedIgnore) {
  const marker = node?.$extensions?.["token-drift"];
  return inheritedIgnore || marker === "ignore" || marker === true;
}

function detectDtcgAlias(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(DTCG_ALIAS);
  return match ? match[1] : null;
}

export function parseDtcg(text) {
  const json = JSON.parse(text);
  const tokens = new Map();

  function walk(node, path, inheritedType, inheritedIgnore) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const type = node.$type ?? inheritedType;
    const ignored = ignoredByExtension(node, inheritedIgnore);

    if (isTokenNode(node)) {
      const key = path.join(".");
      if (!key) return;
      const value = stableStringify(node.$value);
      tokens.set(key, {
        value,
        type,
        alias: detectDtcgAlias(node.$value),
        ignored,
      });
      return;
    }

    for (const [name, child] of Object.entries(node)) {
      if (name.startsWith("$")) continue;
      walk(child, [...path, name], type, ignored);
    }
  }

  walk(json, [], null, false);
  return tokens;
}

function detectCssAlias(value, config) {
  const match = value.trim().match(CSS_ALIAS);
  return match ? normalizeCssName(match[1], config) : null;
}

function inferCssType(value) {
  const normalized = normalizeColor(value);
  if (/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/.test(normalized)) return "color";
  if (/^(?:rgb|rgba|hsl|hsla|oklch|oklab)\(/.test(normalized)) return "color";
  if (/^-?\d*\.?\d+(?:px|rem|em|vh|vw|%|ch|ex|lh|rlh)$/.test(normalized)) return "dimension";
  if (/^-?\d*\.?\d+$/.test(normalized)) return "number";
  return null;
}

export function parseCssVars(text, config = DEFAULT_CONFIG) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  const tokens = new Map();
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+);/);
    if (!match) continue;
    const [, rawName, rawValue] = match;
    const value = rawValue.trim();
    tokens.set(normalizeCssName(rawName, merged), {
      value,
      type: inferCssType(value),
      alias: detectCssAlias(value, merged),
      ignored: /token-drift-ignore/.test(line),
    });
  }

  return tokens;
}

export function resolveAliases(input) {
  const resolved = new Map();
  const findings = [];
  const cycleKeys = new Set();

  function markCycle(stack, key) {
    const start = stack.indexOf(key);
    const cycle = [...stack.slice(start), key];
    for (const cycleKey of new Set(cycle.slice(0, -1))) {
      if (cycleKeys.has(cycleKey)) continue;
      cycleKeys.add(cycleKey);
      findings.push({ key: cycleKey, verdict: "CYCLE", cycle });
    }
  }

  function visit(key, stack = []) {
    if (resolved.has(key)) return resolved.get(key);
    const token = input.get(key);
    if (!token) return null;

    if (!token.alias) {
      const copy = { ...token };
      resolved.set(key, copy);
      return copy;
    }

    if (stack.includes(key)) {
      markCycle(stack, key);
      const copy = { ...token, cycle: true };
      resolved.set(key, copy);
      return copy;
    }

    const target = visit(token.alias, [...stack, key]);
    if (!target || target.cycle) {
      const copy = { ...token, cycle: Boolean(target?.cycle) };
      resolved.set(key, copy);
      return copy;
    }

    const copy = {
      ...token,
      value: target.value,
      type: token.type ?? target.type,
      resolvedFrom: token.alias,
    };
    resolved.set(key, copy);
    return copy;
  }

  for (const key of input.keys()) visit(key);
  return { tokens: resolved, findings };
}
