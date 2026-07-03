import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, parseInstall, levenshtein } from "../skills/install-gate/scripts/gate.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "install-gate", "scripts", "gate.mjs");

function hook(command) {
  const r = spawnSync("node", [SCRIPT, "--hook"], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
  return { exit: r.status, decision: r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null };
}

test("levenshtein distance basics", () => {
  assert.equal(levenshtein("react", "reactt"), 1); // insertion
  assert.equal(levenshtein("chalk", "chalt"), 1); // substitution
  // Adjacent transpositions are the most common real typo and must score 1,
  // not 2 — a plain (non-Damerau) edit distance misses exactly these.
  assert.equal(levenshtein("react", "recat"), 1); // ac -> ca
  assert.equal(levenshtein("lodash", "lodahs"), 1); // sh -> hs
  assert.equal(levenshtein("axios", "axois"), 1); // io -> oi
});

test("the typosquats named in the README are actually caught", () => {
  // These exact examples are documented in plugins/install-gate/README.md.
  // Both are adjacent-transposition typos of a popular package.
  assert.equal(hook("pip install reqeusts").decision.permissionDecision, "deny");
  assert.equal(hook("npm install lodahs").decision.permissionDecision, "deny");
});

test("python -m pip install is recognized as a pip install", () => {
  const p = parseInstall("python -m pip install requests");
  assert.equal(p.manager, "pip");
  assert.equal(p.ecosystem, "pip");
  assert.deepEqual(p.specs, ["requests"]);

  const p3 = parseInstall("python3 -m pip install --upgrade requests");
  assert.equal(p3.manager, "pip");
  assert.deepEqual(p3.flags, ["--upgrade"]);

  // sudo + python -m pip: both the sudo-pip block AND typosquat detection apply
  const { decision } = hook("sudo python -m pip install reqeusts");
  assert.equal(decision.permissionDecision, "deny");
  assert.match(decision.permissionDecisionReason, /virtualenv/);

  // bare `python script.py` / `python -c ...` are not installs
  assert.equal(parseInstall("python script.py"), null);
  assert.equal(parseInstall("python -c \"print(1)\""), null);
  assert.equal(evaluate("python manage.py migrate").length, 0);
});

test("parses managers, verbs, flags, specs", () => {
  const p = parseInstall("pnpm add -D typescript@5.4.0 zod");
  assert.equal(p.manager, "pnpm");
  assert.equal(p.ecosystem, "npm");
  assert.deepEqual(p.specs, ["typescript@5.4.0", "zod"]);
  assert.deepEqual(p.flags, ["-D"]);
  assert.equal(parseInstall("ls -la"), null);
  assert.equal(parseInstall("npm run build"), null);
});

test("exact popular packages pass clean", () => {
  assert.equal(evaluate("npm install react react-dom lodash").length, 0);
  assert.equal(evaluate("pip install requests numpy pandas").length, 0);
  assert.equal(evaluate("cargo add serde tokio").length, 0);
});

test("typosquat one char from a popular name is blocked", () => {
  const { exit, decision } = hook("npm install chalt");
  assert.equal(exit, 0);
  assert.equal(decision.permissionDecision, "deny");
  assert.match(decision.permissionDecisionReason, /one character from the popular package "chalk"/);
});

test("scope impersonation is blocked", () => {
  // @type is one character from the official @types scope
  const flat = JSON.stringify(evaluate("npm install @type/node"));
  assert.match(flat, /impersonation risk/);
  // a legitimate known scope is clean
  assert.equal(evaluate("npm install @types/node").length, 0);
});

test("slopsquat-shaped generic name asks for verification", () => {
  const { decision } = hook("npm install ai-utils-helper");
  assert.equal(decision.permissionDecision, "ask");
  assert.match(decision.permissionDecisionReason, /hallucinated names|confirm it exists/);
});

test("lifecycle-script flags are blocked", () => {
  const { decision } = hook("pnpm add some-lib --allow-scripts");
  assert.equal(decision.permissionDecision, "deny");
  assert.match(decision.permissionDecisionReason, /lifecycle scripts/);
});

test("sudo pip install is blocked", () => {
  const { decision } = hook("sudo pip install requests");
  assert.equal(decision.permissionDecision, "deny");
  assert.match(decision.permissionDecisionReason, /virtualenv/);
});

test("non-registry sources ask for verification", () => {
  const { decision } = hook("npm install git+https://github.com/x/y.git");
  assert.equal(decision.permissionDecision, "ask");
  assert.match(decision.permissionDecisionReason, /non-registry source/);
});

test("install commands chained after other commands are still seen", () => {
  const { decision } = hook("cd /tmp && npm install chalt");
  assert.equal(decision.permissionDecision, "deny");
});

test("clean install produces no decision (exit 0, empty stdout)", () => {
  const r = spawnSync("node", [SCRIPT, "--hook"], {
    input: JSON.stringify({ tool_input: { command: "npm install react" } }),
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("non-install bash commands are ignored", () => {
  const r = spawnSync("node", [SCRIPT, "--hook"], {
    input: JSON.stringify({ tool_input: { command: "git commit -m 'add install docs'" } }),
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("CLI mode exits 1 on a block, 0 when clean", () => {
  assert.equal(spawnSync("node", [SCRIPT, "npm", "install", "chalt"], { encoding: "utf8" }).status, 1);
  assert.equal(spawnSync("node", [SCRIPT, "npm", "install", "react"], { encoding: "utf8" }).status, 0);
});
