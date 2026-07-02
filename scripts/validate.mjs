#!/usr/bin/env node
/**
 * Repo validator for the dibble plugin marketplace.
 *
 * Checks the invariants that break real installs — the ones the official
 * review pipeline and Claude Code's loader actually care about:
 *
 *   1. marketplace.json parses and lists every plugin in plugins/ (and nothing extra)
 *   2. every plugin has .claude-plugin/plugin.json with a valid name + semver version
 *   3. no component directories hidden inside .claude-plugin/ (loader ignores them there)
 *   4. every skill has SKILL.md with frontmatter and a description
 *   5. hooks.json parses and every referenced ${CLAUDE_PLUGIN_ROOT} script exists + is executable
 *   6. version consistency: plugin.json version matches the marketplace entry (when pinned)
 *
 * Zero dependencies. Exit 0 = clean, exit 1 = findings printed to stderr.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.argv[2] ?? ".");
const errors = [];
const warnings = [];

const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const RESERVED_MARKETPLACE_NAMES = new Set([
  "claude-code-marketplace", "claude-code-plugins", "claude-plugins-official",
  "claude-plugins-community", "claude-community", "anthropic-marketplace",
  "anthropic-plugins", "agent-skills", "anthropic-agent-skills",
  "knowledge-work-plugins", "life-sciences", "claude-for-legal",
  "claude-for-financial-services", "financial-services-plugins",
]);

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    err(`${label}: cannot parse ${path} — ${e.message}`);
    return null;
  }
}

function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fields = {};
  // Minimal YAML: top-level `key: value` scalars only, which is all SKILL.md needs.
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return fields;
}

// --- 1. marketplace.json ---
const mpPath = join(ROOT, ".claude-plugin", "marketplace.json");
const mp = existsSync(mpPath) ? readJson(mpPath, "marketplace") : (err(`missing ${mpPath}`), null);

let listed = new Map();
if (mp) {
  if (!mp.name) err("marketplace: missing required field 'name'");
  else {
    if (!KEBAB.test(mp.name)) err(`marketplace: name '${mp.name}' must be kebab-case`);
    if (RESERVED_MARKETPLACE_NAMES.has(mp.name)) err(`marketplace: name '${mp.name}' is reserved by Anthropic`);
  }
  if (!mp.owner?.name) err("marketplace: missing required field 'owner.name'");
  if (!Array.isArray(mp.plugins)) err("marketplace: 'plugins' must be an array");
  else {
    for (const p of mp.plugins) {
      if (!p.name) { err("marketplace: plugin entry missing 'name'"); continue; }
      if (listed.has(p.name)) err(`marketplace: duplicate plugin entry '${p.name}'`);
      listed.set(p.name, p);
      if (!p.description) warn(`marketplace: '${p.name}' has no description (shown in /plugin browser)`);
    }
  }
}

// --- 2. plugins/ directory sweep ---
const pluginRoot = join(ROOT, mp?.metadata?.pluginRoot ?? "./plugins");
const onDisk = existsSync(pluginRoot)
  ? readdirSync(pluginRoot).filter((d) => statSync(join(pluginRoot, d)).isDirectory())
  : [];

for (const name of listed.keys()) {
  const entry = listed.get(name);
  const src = typeof entry.source === "string" ? entry.source : null;
  // External sources (github/git objects) are fine; only local paths must exist.
  if (src && !existsSync(join(ROOT, mp?.metadata?.pluginRoot ?? ".", src)) && !existsSync(join(ROOT, src)) && !onDisk.includes(name)) {
    err(`marketplace: '${name}' points at local source '${src}' which does not exist`);
  }
  if (!src && typeof entry.source !== "object" && !onDisk.includes(name)) {
    err(`marketplace: '${name}' listed but plugins/${name}/ not found`);
  }
}
for (const dir of onDisk) {
  if (!listed.has(dir)) err(`plugins/${dir} exists on disk but is not listed in marketplace.json`);
}

// --- 3-6. per-plugin checks ---
for (const dir of onDisk) {
  const base = join(pluginRoot, dir);
  const label = `plugins/${dir}`;

  // Manifest
  const manifestPath = join(base, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) { err(`${label}: missing .claude-plugin/plugin.json`); continue; }
  const manifest = readJson(manifestPath, label);
  if (!manifest) continue;
  if (manifest.name !== dir) err(`${label}: plugin.json name '${manifest.name}' != directory name '${dir}'`);
  if (!KEBAB.test(manifest.name ?? "")) err(`${label}: plugin name must be kebab-case`);
  if (!manifest.description) err(`${label}: plugin.json missing description`);
  if (manifest.version && !SEMVER.test(manifest.version)) err(`${label}: version '${manifest.version}' is not semver`);
  if (!manifest.version) warn(`${label}: no version set — every commit becomes an update for users`);

  const mpEntry = listed.get(dir);
  if (mpEntry?.version && manifest.version && mpEntry.version !== manifest.version) {
    err(`${label}: marketplace pins version ${mpEntry.version} but plugin.json says ${manifest.version}`);
  }

  // The classic structural mistake: components inside .claude-plugin/
  for (const misplaced of ["skills", "commands", "agents", "hooks"]) {
    if (existsSync(join(base, ".claude-plugin", misplaced))) {
      err(`${label}: '${misplaced}/' is inside .claude-plugin/ — the loader only reads it at the plugin root`);
    }
  }

  // Skills
  const skillsDir = join(base, "skills");
  if (existsSync(skillsDir)) {
    for (const skill of readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory())) {
      const skillMd = join(skillsDir, skill, "SKILL.md");
      const skillLabel = `${label}/skills/${skill}`;
      if (!existsSync(skillMd)) { err(`${skillLabel}: missing SKILL.md`); continue; }
      const body = readFileSync(skillMd, "utf8");
      const fm = parseFrontmatter(body);
      if (!fm) { err(`${skillLabel}: SKILL.md has no YAML frontmatter`); continue; }
      if (!fm.description) err(`${skillLabel}: frontmatter missing 'description' — the skill can never trigger`);
      else if (fm.description.length > 1024) err(`${skillLabel}: description exceeds 1024 chars`);
      if (fm.name && !KEBAB.test(fm.name)) err(`${skillLabel}: frontmatter name must be kebab-case`);
      const lines = body.split("\n").length;
      if (lines > 500) warn(`${skillLabel}: SKILL.md is ${lines} lines — consider moving detail into references/`);
    }
  }

  // Hooks
  const hooksPath = join(base, "hooks", "hooks.json");
  if (existsSync(hooksPath)) {
    const hooks = readJson(hooksPath, `${label}/hooks`);
    if (hooks?.hooks) {
      for (const [event, groups] of Object.entries(hooks.hooks)) {
        if (!Array.isArray(groups)) { err(`${label}: hooks.${event} must be an array`); continue; }
        for (const group of groups) {
          for (const h of group.hooks ?? []) {
            const refs = [h.command, ...(h.args ?? [])].filter((s) => typeof s === "string" && s.includes("${CLAUDE_PLUGIN_ROOT}"));
            for (const ref of refs) {
              const rel = ref.replace(/.*\$\{CLAUDE_PLUGIN_ROOT\}\/?/, "").split(/\s+/)[0].replace(/^["']|["']$/g, "");
              const target = join(base, rel);
              if (!existsSync(target)) err(`${label}: hooks.${event} references ${rel} which does not exist`);
              else if (!(statSync(target).mode & 0o111) && !/\.(mjs|js|cjs|py)$/.test(rel)) {
                warn(`${label}: hooks.${event} script ${rel} is not executable (chmod +x)`);
              }
            }
            if (!h.timeout) warn(`${label}: hooks.${event} entry has no timeout — a hung hook stalls every tool call`);
          }
        }
      }
    }
  }

  if (!existsSync(join(base, "README.md"))) warn(`${label}: no README.md — this is the plugin's landing page`);
}

// --- Report ---
for (const w of warnings) console.error(`  warn  ${w}`);
for (const e of errors) console.error(`  FAIL  ${e}`);
console.error(`\n${onDisk.length} plugin(s) checked: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
