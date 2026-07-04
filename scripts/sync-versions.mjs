#!/usr/bin/env node
/**
 * Sync every Claude and Codex plugin.json version to the release version, so
 * the marketplaces and the npm package can't drift apart. Runs in the
 * semantic-release prepare phase (see .releaserc.json); the git plugin commits
 * the result.
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

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

if (!SEMVER.test(version)) {
  console.error(`sync-versions: '${version}' is not semver`);
  process.exit(1);
}

const pluginsDir = join(root, "plugins");
let updated = 0;
for (const dir of readdirSync(pluginsDir)) {
  const manifestPaths = [
    join(pluginsDir, dir, ".claude-plugin", "plugin.json"),
    join(pluginsDir, dir, ".codex-plugin", "plugin.json"),
  ];

  for (const manifestPath of manifestPaths) {
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
}
console.log(`sync-versions: ${version} written to ${updated} plugin manifest(s)`);
