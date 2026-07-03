#!/usr/bin/env node
/**
 * Sync every plugin.json version to the release version, so the marketplace
 * catalog and the npm package can't drift apart. Runs in the semantic-release
 * prepare phase (see .releaserc.json); the git plugin commits the result.
 *
 *   node scripts/sync-versions.mjs 1.2.3
 *   node scripts/sync-versions.mjs            # defaults to package.json version
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const version =
  process.argv[2] ??
  JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`sync-versions: '${version}' is not semver`);
  process.exit(1);
}

const pluginsDir = join(root, "plugins");
let updated = 0;
for (const dir of readdirSync(pluginsDir)) {
  const manifestPath = join(pluginsDir, dir, ".claude-plugin", "plugin.json");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    continue;
  }
  if (manifest.version !== version) {
    manifest.version = version;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    updated++;
  }
}
console.log(`sync-versions: ${version} written to ${updated} plugin manifest(s)`);
