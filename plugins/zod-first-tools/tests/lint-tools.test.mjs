import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "zod-first-tools", "scripts", "lint-tools.mjs");

let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), "zft-")); });
after(() => rmSync(dir, { recursive: true, force: true }));

function lint(name, content, args = []) {
  const f = join(dir, name);
  writeFileSync(f, content);
  return spawnSync("node", [SCRIPT, f, ...args], { encoding: "utf8" });
}

test("flags a file that uses Zod and hand-writes an input_schema", () => {
  const r = lint("bad.ts", `
    import { z } from "zod";
    const Params = z.object({ city: z.string() });
    export const tool = {
      name: "get_weather",
      input_schema: {
        type: "object",
        properties: { city: { type: "string" } },
      },
    };
  `);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /hand-written "input_schema"/);
  assert.match(r.stdout, /two schemas for one tool boundary/);
});

test("passes a file that derives the schema from Zod", () => {
  const r = lint("good.ts", `
    import { z } from "zod";
    import { toAnthropicTool } from "zod-ai-tool";
    const Params = z.object({ city: z.string() });
    export const tool = toAnthropicTool("get_weather", "desc", Params);
  `);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /clean/);
});

test("passes a file using Zod's own toJSONSchema", () => {
  const r = lint("native.ts", `
    import { z } from "zod";
    const Params = z.object({ city: z.string() });
    const parameters = z.toJSONSchema(Params);
    export const tool = { name: "x", parameters };
  `);
  assert.equal(r.status, 0);
});

test("ignores a hand-written schema with no Zod in the file", () => {
  const r = lint("plain.ts", `
    export const tool = {
      name: "get_weather",
      parameters: { type: "object", properties: {} },
    };
  `);
  assert.equal(r.status, 0);
});

test("ignores Zod usage with no hand-written tool schema", () => {
  const r = lint("schema-only.ts", `
    import { z } from "zod";
    export const User = z.object({ id: z.string(), age: z.number() });
  `);
  assert.equal(r.status, 0);
});

test("--json reports the offending key and line", () => {
  const r = lint("bad2.ts", `
    import { z } from "zod";
    const S = z.object({ n: z.number() });
    const t = { inputSchema: {
      type: "object", properties: { n: { type: "number" } } } };
  `, ["--json"]);
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.results[0].findings[0].key, "inputSchema");
});
