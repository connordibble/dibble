#!/usr/bin/env node
/**
 * Validate the Codex marketplace sidecar and per-plugin manifests.
 *
 *   node scripts/validate-codex-plugins.mjs [repo-root] [--json]
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const HEX_COLOR = /^#[0-9A-F]{6}$/i;
const REQUIRED_INTERFACE_FIELDS = [
  "displayName",
  "shortDescription",
  "longDescription",
  "developerName",
  "category",
];
const ALLOWED_MANIFEST_FIELDS = new Set([
  "id",
  "name",
  "version",
  "description",
  "skills",
  "apps",
  "mcpServers",
  "interface",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
]);
const ALLOWED_INTERFACE_FIELDS = new Set([
  "displayName",
  "shortDescription",
  "longDescription",
  "developerName",
  "category",
  "capabilities",
  "websiteURL",
  "privacyPolicyURL",
  "termsOfServiceURL",
  "brandColor",
  "composerIcon",
  "logo",
  "logoDark",
  "screenshots",
  "defaultPrompt",
  "default_prompt",
]);

function readJson(path, errors, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`${label}: cannot parse ${path} (${error.message})`);
    return null;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateSkillFrontmatter(skillRoot, label, errors) {
  const skillPath = join(skillRoot, "SKILL.md");
  if (!existsSync(skillPath)) {
    errors.push(`${label}: missing SKILL.md`);
    return;
  }
  const text = readFileSync(skillPath, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    errors.push(`${label}: SKILL.md has no YAML frontmatter`);
    return;
  }
  const fields = Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/^["']|["']$/g, "")]),
  );
  if (!nonEmptyString(fields.name)) {
    errors.push(`${label}: frontmatter missing non-empty name`);
  }
  if (!nonEmptyString(fields.description)) {
    errors.push(`${label}: frontmatter missing non-empty description`);
  }
}

export function validateCodexPlugins(root) {
  const errors = [];
  const warnings = [];
  const marketplacePath = join(root, ".agents", "plugins", "marketplace.json");
  if (!existsSync(marketplacePath)) {
    errors.push("missing .agents/plugins/marketplace.json");
    return { errors, warnings, pluginCount: 0 };
  }

  const marketplace = readJson(marketplacePath, errors, "marketplace");
  if (!isObject(marketplace)) {
    errors.push("marketplace: root must be a JSON object");
    return { errors, warnings, pluginCount: 0 };
  }
  if (!nonEmptyString(marketplace.name) || !KEBAB.test(marketplace.name)) {
    errors.push("marketplace: name must be kebab-case");
  }
  if (!Array.isArray(marketplace.plugins)) {
    errors.push("marketplace: plugins must be an array");
    return { errors, warnings, pluginCount: 0 };
  }

  const pluginDir = join(root, "plugins");
  const onDisk = existsSync(pluginDir)
    ? readdirSync(pluginDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];

  const listed = new Map();
  for (const entry of marketplace.plugins) {
    if (!isObject(entry)) {
      errors.push("marketplace: every plugin entry must be an object");
      continue;
    }
    const name = entry.name;
    if (!nonEmptyString(name) || !KEBAB.test(name)) {
      errors.push(`marketplace: plugin name '${name}' must be kebab-case`);
      continue;
    }
    if (listed.has(name)) {
      errors.push(`marketplace: duplicate plugin entry '${name}'`);
    }
    listed.set(name, entry);

    if (entry.source?.source !== "local") {
      errors.push(`${name}: marketplace source.source must be 'local'`);
    }
    if (entry.source?.path !== `./plugins/${name}`) {
      errors.push(`${name}: marketplace source.path must be './plugins/${name}'`);
    }
    if (entry.policy?.installation !== "AVAILABLE") {
      errors.push(`${name}: policy.installation must be AVAILABLE`);
    }
    if (entry.policy?.authentication !== "ON_INSTALL") {
      errors.push(`${name}: policy.authentication must be ON_INSTALL`);
    }
    if (!nonEmptyString(entry.category)) {
      errors.push(`${name}: marketplace entry missing category`);
    }
  }

  for (const name of onDisk) {
    if (!listed.has(name)) {
      errors.push(`${name}: plugin directory is missing from Codex marketplace`);
    }
  }
  for (const name of listed.keys()) {
    if (!onDisk.includes(name)) {
      errors.push(`${name}: listed in Codex marketplace but no plugin directory exists`);
    }
  }

  for (const name of onDisk) {
    const base = join(pluginDir, name);
    const manifestPath = join(base, ".codex-plugin", "plugin.json");
    if (!existsSync(manifestPath)) {
      errors.push(`${name}: missing .codex-plugin/plugin.json`);
      continue;
    }
    const manifest = readJson(manifestPath, errors, name);
    if (!isObject(manifest)) {
      errors.push(`${name}: manifest must be a JSON object`);
      continue;
    }

    for (const key of Object.keys(manifest)) {
      if (!ALLOWED_MANIFEST_FIELDS.has(key)) {
        errors.push(`${name}: unsupported plugin.json field '${key}'`);
      }
    }
    if (manifest.name !== name) {
      errors.push(`${name}: plugin.json name must match directory name`);
    }
    if (!nonEmptyString(manifest.version) || !SEMVER.test(manifest.version)) {
      errors.push(`${name}: version must be strict semver`);
    }
    if (!nonEmptyString(manifest.description)) {
      errors.push(`${name}: description must be non-empty`);
    }
    if (!isObject(manifest.author) || !nonEmptyString(manifest.author.name)) {
      errors.push(`${name}: author.name must be non-empty`);
    }
    if (manifest.skills !== "./skills/") {
      errors.push(`${name}: skills must be './skills/'`);
    }
    if (!existsSync(join(base, "skills"))) {
      errors.push(`${name}: skills directory missing`);
    }

    const iface = manifest.interface;
    if (!isObject(iface)) {
      errors.push(`${name}: interface must be an object`);
      continue;
    }
    for (const key of Object.keys(iface)) {
      if (!ALLOWED_INTERFACE_FIELDS.has(key)) {
        errors.push(`${name}: unsupported interface field '${key}'`);
      }
    }
    for (const field of REQUIRED_INTERFACE_FIELDS) {
      if (!nonEmptyString(iface[field])) {
        errors.push(`${name}: interface.${field} must be non-empty`);
      }
    }
    if (!Array.isArray(iface.capabilities) || !iface.capabilities.every(nonEmptyString)) {
      errors.push(`${name}: interface.capabilities must be an array of strings`);
    }
    if (
      !Array.isArray(iface.defaultPrompt) ||
      iface.defaultPrompt.length === 0 ||
      !iface.defaultPrompt.every(nonEmptyString)
    ) {
      errors.push(`${name}: interface.defaultPrompt must be a non-empty array of strings`);
    }
    if (iface.brandColor !== undefined && !HEX_COLOR.test(iface.brandColor)) {
      errors.push(`${name}: interface.brandColor must use #RRGGBB`);
    }

    const skillsRoot = join(base, "skills");
    if (existsSync(skillsRoot) && statSync(skillsRoot).isDirectory()) {
      for (const skill of readdirSync(skillsRoot, { withFileTypes: true })) {
        if (!skill.isDirectory() || skill.name.startsWith(".")) continue;
        validateSkillFrontmatter(
          join(skillsRoot, skill.name),
          `${name}/skills/${skill.name}`,
          errors,
        );
      }
    }

    for (const pathField of ["composerIcon", "logo", "logoDark"]) {
      if (iface[pathField] !== undefined) {
        const normalized = normalize(iface[pathField]);
        if (normalized.startsWith("..") || normalized.startsWith("/")) {
          errors.push(`${name}: interface.${pathField} must stay inside plugin root`);
        }
      }
    }
  }

  return { errors, warnings, pluginCount: onDisk.length };
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("validate-codex-plugins.mjs")) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const root = resolve(args.find((arg) => !arg.startsWith("--")) ?? ".");
  const { errors, warnings, pluginCount = 0 } = validateCodexPlugins(root);
  if (asJson) {
    process.stdout.write(JSON.stringify({ errors, warnings, pluginCount }, null, 2) + "\n");
  } else {
    for (const warning of warnings) process.stderr.write(`  warn  ${warning}\n`);
    for (const error of errors) process.stderr.write(`  FAIL  ${error}\n`);
    process.stderr.write(
      `\n${pluginCount} Codex plugin(s): ${errors.length} error(s), ${warnings.length} warning(s)\n`,
    );
  }
  process.exit(errors.length ? 1 : 0);
}
