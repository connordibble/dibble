#!/usr/bin/env node
/**
 * validate-marketplace — checks a Claude Code plugin marketplace repo against
 * the invariants that break real installs and the ones the official
 * community-marketplace review runs before accepting a submission.
 *
 *   node validate-marketplace.mjs [repo-root] [--json]
 *
 * Checks:
 *   1. marketplace.json parses; name kebab-case and not reserved; owner set
 *   2. every plugin listed exists (local sources) and every on-disk plugin is listed
 *   3. plugin.json: name matches dir, kebab-case, description present, semver version
 *   4. version consistency between the marketplace pin and plugin.json
 *   5. no commands/agents/skills/hooks nested inside .claude-plugin/ (loader ignores them)
 *   6. skills: SKILL.md present, frontmatter description present and <=1024 chars
 *   7. hooks.json parses; every ${CLAUDE_PLUGIN_ROOT} script reference exists
 *   8. plugin has a README (warn) and a version (warn: else every commit is an update)
 *
 * Exit 0 clean, 1 on errors (warnings alone still pass). Zero dependencies.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const RESERVED = new Set([
  "claude-code-marketplace", "claude-code-plugins", "claude-plugins-official",
  "claude-plugins-community", "claude-community", "anthropic-marketplace",
  "anthropic-plugins", "agent-skills", "anthropic-agent-skills",
  "knowledge-work-plugins", "life-sciences", "claude-for-legal",
  "claude-for-financial-services", "financial-services-plugins",
]);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export function validateMarketplace(root) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  const rj = (p, label) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { err(`${label}: cannot parse ${p} (${e.message})`); return null; } };

  const fm = (md) => {
    const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return null;
    const f = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (kv) f[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
    }
    return f;
  };

  const mpPath = join(root, ".claude-plugin", "marketplace.json");
  if (!existsSync(mpPath)) { err(`missing .claude-plugin/marketplace.json at ${root}`); return { errors, warnings }; }
  const mp = rj(mpPath, "marketplace");
  if (!mp) return { errors, warnings };

  if (!mp.name) err("marketplace: missing 'name'");
  else {
    if (!KEBAB.test(mp.name)) err(`marketplace: name '${mp.name}' must be kebab-case`);
    if (RESERVED.has(mp.name)) err(`marketplace: name '${mp.name}' is reserved by Anthropic and will be rejected`);
  }
  if (!mp.owner?.name) err("marketplace: missing 'owner.name'");
  if (!Array.isArray(mp.plugins)) { err("marketplace: 'plugins' must be an array"); return { errors, warnings }; }

  const pluginRootRel = mp.metadata?.pluginRoot ?? ".";
  const listed = new Map();
  for (const p of mp.plugins) {
    if (!p.name) { err("marketplace: a plugin entry has no 'name'"); continue; }
    if (listed.has(p.name)) err(`marketplace: duplicate entry '${p.name}'`);
    listed.set(p.name, p);
    if (!p.description) warn(`marketplace: '${p.name}' has no description (shown in the /plugin browser)`);
  }

  const pluginRoot = join(root, pluginRootRel);
  const onDisk = existsSync(pluginRoot)
    ? readdirSync(pluginRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== ".claude-plugin").map((e) => e.name)
    : [];

  // Local plugins listed but missing, or present but unlisted.
  for (const [name, entry] of listed) {
    const isLocal = typeof entry.source === "string";
    const isExternal = typeof entry.source === "object";
    if (isExternal) continue; // github/git sources validated elsewhere
    const dir = isLocal ? entry.source.replace(/^\.\//, "") : name;
    if (!onDisk.includes(dir.replace(new RegExp(`^${pluginRootRel.replace(/^\.\//, "")}/?`), ""))) {
      if (!onDisk.includes(name)) err(`marketplace: '${name}' listed but no plugin directory found`);
    }
  }
  for (const dir of onDisk) {
    if (!listed.has(dir)) err(`plugin directory '${dir}' exists but is not listed in marketplace.json`);
  }

  // Per-plugin checks.
  for (const dir of onDisk) {
    const base = join(pluginRoot, dir);
    const label = `${dir}`;
    const manifestPath = join(base, ".claude-plugin", "plugin.json");
    if (!existsSync(manifestPath)) { err(`${label}: missing .claude-plugin/plugin.json`); continue; }
    const man = rj(manifestPath, label);
    if (!man) continue;
    if (man.name !== dir) err(`${label}: plugin.json name '${man.name}' != directory '${dir}'`);
    if (!KEBAB.test(man.name ?? "")) err(`${label}: plugin name must be kebab-case`);
    if (!man.description) err(`${label}: plugin.json missing 'description'`);
    if (man.version && !SEMVER.test(man.version)) err(`${label}: version '${man.version}' is not semver`);
    if (!man.version) warn(`${label}: no version — every commit becomes an update for installed users`);

    const entry = listed.get(dir);
    if (entry?.version && man.version && entry.version !== man.version) {
      err(`${label}: marketplace pins ${entry.version} but plugin.json is ${man.version} (the top rejection cause)`);
    }

    for (const bad of ["skills", "commands", "agents", "hooks"]) {
      if (existsSync(join(base, ".claude-plugin", bad))) err(`${label}: '${bad}/' is inside .claude-plugin/ — move it to the plugin root`);
    }

    const skillsDir = join(base, "skills");
    if (existsSync(skillsDir)) {
      for (const s of readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
        const md = join(skillsDir, s.name, "SKILL.md");
        const sl = `${label}/skills/${s.name}`;
        if (!existsSync(md)) { err(`${sl}: missing SKILL.md`); continue; }
        const f = fm(readFileSync(md, "utf8"));
        if (!f) err(`${sl}: SKILL.md has no YAML frontmatter`);
        else if (!f.description) err(`${sl}: frontmatter missing 'description' (the skill can never trigger)`);
        else if (f.description.length > 1024) err(`${sl}: description exceeds 1024 chars`);
      }
    }

    const hooksPath = join(base, "hooks", "hooks.json");
    if (existsSync(hooksPath)) {
      const hk = rj(hooksPath, `${label}/hooks`);
      for (const groups of Object.values(hk?.hooks ?? {})) {
        for (const g of Array.isArray(groups) ? groups : []) {
          for (const h of g.hooks ?? []) {
            for (const ref of [h.command, ...(h.args ?? [])].filter((s) => typeof s === "string" && s.includes("${CLAUDE_PLUGIN_ROOT}"))) {
              const rel = ref.replace(/.*\$\{CLAUDE_PLUGIN_ROOT\}\/?/, "").split(/\s+/)[0].replace(/^["']|["']$/g, "");
              if (rel && !existsSync(join(base, rel))) err(`${label}: hook references ${rel} which does not exist`);
            }
            if (!h.timeout) warn(`${label}: a hook has no timeout — a hung hook stalls every matching tool call`);
          }
        }
      }
    }

    if (!existsSync(join(base, "README.md"))) warn(`${label}: no README.md`);
  }

  return { errors, warnings, pluginCount: onDisk.length };
}

// CLI
if (process.argv[1] && resolve(process.argv[1]).endsWith("validate-marketplace.mjs")) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const root = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
  const { errors, warnings, pluginCount = 0 } = validateMarketplace(root);
  if (asJson) {
    process.stdout.write(JSON.stringify({ errors, warnings, pluginCount }, null, 2) + "\n");
  } else {
    for (const w of warnings) process.stderr.write(`  warn  ${w}\n`);
    for (const e of errors) process.stderr.write(`  FAIL  ${e}\n`);
    process.stderr.write(`\n${pluginCount} plugin(s): ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  }
  process.exit(errors.length ? 1 : 0);
}
