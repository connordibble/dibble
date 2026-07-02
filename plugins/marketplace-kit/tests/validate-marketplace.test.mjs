import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { validateMarketplace } from "../skills/marketplace-kit/scripts/validate-marketplace.mjs";

let base;
before(() => { base = mkdtempSync(join(tmpdir(), "mk-")); });
after(() => rmSync(base, { recursive: true, force: true }));

let n = 0;
function repo({ marketplace, plugins = {} }) {
  const root = join(base, `r-${n++}`);
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(join(root, ".claude-plugin", "marketplace.json"), JSON.stringify(marketplace, null, 2));
  for (const [name, spec] of Object.entries(plugins)) {
    const pdir = join(root, "plugins", name);
    mkdirSync(join(pdir, ".claude-plugin"), { recursive: true });
    if (spec.manifest) writeFileSync(join(pdir, ".claude-plugin", "plugin.json"), JSON.stringify(spec.manifest, null, 2));
    if (spec.readme !== false) writeFileSync(join(pdir, "README.md"), "# " + name);
    for (const [skill, body] of Object.entries(spec.skills ?? {})) {
      mkdirSync(join(pdir, "skills", skill), { recursive: true });
      writeFileSync(join(pdir, "skills", skill, "SKILL.md"), body);
    }
    for (const [rel, content] of Object.entries(spec.files ?? {})) {
      const fp = join(pdir, rel);
      mkdirSync(dirname(fp), { recursive: true });
      writeFileSync(fp, content);
    }
  }
  return root;
}

const okMarketplace = (plugins) => ({
  name: "dibble", owner: { name: "C" }, metadata: { pluginRoot: "./plugins" },
  plugins: plugins.map((p) => ({ name: p, source: `./${p}` })),
});
const okManifest = (name) => ({ name, description: "d", version: "1.0.0" });
const okSkill = "---\nname: s\ndescription: does a thing when asked\n---\nbody";

test("a well-formed marketplace passes", () => {
  const root = repo({
    marketplace: okMarketplace(["alpha"]),
    plugins: { alpha: { manifest: okManifest("alpha"), skills: { s: okSkill } } },
  });
  const { errors } = validateMarketplace(root);
  assert.deepEqual(errors, []);
});

test("reserved marketplace name is rejected", () => {
  const root = repo({ marketplace: { ...okMarketplace([]), name: "agent-skills" } });
  const { errors } = validateMarketplace(root);
  assert.ok(errors.some((e) => /reserved/.test(e)));
});

test("plugin on disk but not listed is an error", () => {
  const root = repo({
    marketplace: okMarketplace([]), // lists nothing
    plugins: { ghost: { manifest: okManifest("ghost") } },
  });
  const { errors } = validateMarketplace(root);
  assert.ok(errors.some((e) => /not listed/.test(e)));
});

test("version mismatch between pin and manifest is caught", () => {
  const mp = okMarketplace(["alpha"]);
  mp.plugins[0].version = "2.0.0";
  const root = repo({ marketplace: mp, plugins: { alpha: { manifest: okManifest("alpha"), skills: { s: okSkill } } } });
  const { errors } = validateMarketplace(root);
  assert.ok(errors.some((e) => /pins 2.0.0 but plugin.json is 1.0.0/.test(e)));
});

test("components nested in .claude-plugin/ are caught", () => {
  const root = repo({
    marketplace: okMarketplace(["alpha"]),
    plugins: { alpha: { manifest: okManifest("alpha"), files: { ".claude-plugin/skills/x/SKILL.md": okSkill } } },
  });
  const { errors } = validateMarketplace(root);
  assert.ok(errors.some((e) => /inside \.claude-plugin/.test(e)));
});

test("skill without a description errors", () => {
  const root = repo({
    marketplace: okMarketplace(["alpha"]),
    plugins: { alpha: { manifest: okManifest("alpha"), skills: { s: "---\nname: s\n---\nbody" } } },
  });
  const { errors } = validateMarketplace(root);
  assert.ok(errors.some((e) => /missing 'description'/.test(e)));
});

test("hook referencing a missing script errors", () => {
  const root = repo({
    marketplace: okMarketplace(["alpha"]),
    plugins: {
      alpha: {
        manifest: okManifest("alpha"), skills: { s: okSkill },
        files: { "hooks/hooks.json": JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/scripts/nope.mjs"], timeout: 5 }] }] } }) },
      },
    },
  });
  const { errors } = validateMarketplace(root);
  assert.ok(errors.some((e) => /nope\.mjs which does not exist/.test(e)));
});

test("non-semver version and missing version behave correctly", () => {
  const root = repo({
    marketplace: okMarketplace(["alpha"]),
    plugins: { alpha: { manifest: { name: "alpha", description: "d", version: "v1" }, skills: { s: okSkill } } },
  });
  const { errors } = validateMarketplace(root);
  assert.ok(errors.some((e) => /not semver/.test(e)));

  const root2 = repo({
    marketplace: okMarketplace(["beta"]),
    plugins: { beta: { manifest: { name: "beta", description: "d" }, skills: { s: okSkill } } },
  });
  const { errors: e2, warnings } = validateMarketplace(root2);
  assert.deepEqual(e2, []);
  assert.ok(warnings.some((w) => /every commit becomes an update/.test(w)));
});
