#!/usr/bin/env node
/**
 * agent-audit — hygiene scanner for your coding-agent configuration.
 *
 * Checks the places a compromised package or a careless afternoon actually
 * touches: hook definitions, permission grants, MCP server configs, and the
 * file permissions on the configs themselves. Every check maps to a
 * documented attack pattern (SessionStart re-execution, MCP rerouting,
 * curl|bash payloads, plaintext transports, inline secrets).
 *
 *   node audit.mjs                       # audit ~ and the current project
 *   node audit.mjs --json                # machine-readable
 *   node audit.mjs --home DIR --project DIR   # override roots (tests/CI)
 *
 * Exit codes: 0 clean/info · 1 warnings · 2 critical findings.
 * Zero dependencies. Read-only: this tool never modifies anything.
 */

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const HOME = flag("--home") ?? homedir();
const PROJECT = flag("--project") ?? process.cwd();
const AS_JSON = args.includes("--json");

const findings = [];
const add = (severity, file, issue, fix) => findings.push({ severity, file, issue, fix });

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function isWorldWritable(path) {
  try { return Boolean(statSync(path).mode & 0o002); } catch { return false; }
}

// ---------------------------------------------------------------------------
// Check 1: hook commands in settings files
// ---------------------------------------------------------------------------

const REMOTE_EXEC = /\b(curl|wget)\b[^|;&]*(\||;|&&)[^|;&]*\b(sh|bash|zsh|node|python3?)\b/;
const OBFUSCATION = /\bbase64\b.*(-d|--decode|-D)|\batob\s*\(/;
const TMP_EXEC = /(^|[\s"'=])\/(?:var\/)?tmp\//;
const INLINE_EVAL = /\b(node\s+-e|sh\s+-c|bash\s+-c|eval)\b/;

// hooks.json supports the exec form ({ command, args: [...] }), which is how
// this catalog's own plugins wire their hooks. Scanning h.command alone lets
// a payload hide in args — e.g. { command: "bash", args: ["-c", "curl ... | sh"] }
// evades every pattern below if only "bash" is examined. Join them into the
// same effective string a shell would see.
function fullHookCommand(h) {
  const args = Array.isArray(h.args)
    ? h.args.map((a) => (typeof a === "string" && /\s/.test(a) ? `"${a}"` : a)).join(" ")
    : "";
  return args ? `${h.command} ${args}` : h.command;
}

function auditHookCommand(cmd, sourceFile, event) {
  const where = `${sourceFile} (${event} hook)`;
  if (REMOTE_EXEC.test(cmd)) {
    add("critical", where, `hook pipes a network download into an interpreter: ${trim(cmd)}`,
      "vendor the script locally, read it, then reference the local copy");
  }
  if (OBFUSCATION.test(cmd)) {
    add("critical", where, `hook decodes an obfuscated payload: ${trim(cmd)}`,
      "legitimate hooks don't need base64; remove it or decode and review what it runs");
  }
  if (TMP_EXEC.test(cmd)) {
    add("warn", where, `hook executes from a world-writable temp directory: ${trim(cmd)}`,
      "move the script into the project or dotfiles where changes are tracked");
  }
  if (INLINE_EVAL.test(cmd) && cmd.length > 200) {
    add("warn", where, `hook is a ${cmd.length}-char inline script, too long to review at a glance`,
      "move the logic into a version-controlled file and call that");
  }
  // If the command references a concrete script path, check who can rewrite it.
  const pathMatch = cmd.match(/(?:^|\s|"|')(\/[^\s"']+\.(?:sh|mjs|js|cjs|py))\b/);
  if (pathMatch && existsSync(pathMatch[1]) && isWorldWritable(pathMatch[1])) {
    add("critical", where, `hook script ${pathMatch[1]} is world-writable`,
      `chmod o-w ${pathMatch[1]} — anyone on this machine can make your agent run their code`);
  }
}

const trim = (s) => (s.length > 90 ? s.slice(0, 87) + "…" : s).replace(/\s+/g, " ");

function auditSettingsFile(path, label) {
  const cfg = readJson(path);
  if (!cfg) return;

  for (const [event, groups] of Object.entries(cfg.hooks ?? {})) {
    const sessionStart = event === "SessionStart";
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const h of group.hooks ?? []) {
        if (h.type === "command" && typeof h.command === "string") {
          const full = fullHookCommand(h);
          auditHookCommand(full, label, event);
          if (sessionStart) {
            add("info", `${label} (SessionStart hook)`, `runs on every session start: ${trim(full)}`,
              "SessionStart is the re-execution vector malware uses; confirm you added this yourself");
          }
        }
      }
    }
  }

  const perms = cfg.permissions ?? {};
  if (perms.defaultMode === "bypassPermissions") {
    add("critical", label, "defaultMode is bypassPermissions — every tool call runs unprompted",
      "set defaultMode back to a prompting mode and allowlist specific commands instead");
  }
  for (const rule of perms.allow ?? []) {
    if (/^Bash$|^Bash\(\*?\)$|^Bash\(\*:\*\)$/.test(rule)) {
      add("warn", label, `blanket shell approval in allow list: "${rule}"`,
        "replace with specific command patterns like Bash(pnpm test:*)");
    } else if (/rm -rf|\|\s*(sh|bash)\b|curl|wget/.test(rule)) {
      add("warn", label, `allow rule pre-approves a dangerous pattern: "${rule}"`,
        "pre-approving downloads or recursive deletes defeats the permission layer");
    }
  }

  if (isWorldWritable(path)) {
    add("critical", label, "settings file is world-writable",
      `chmod o-w ${path} — hooks and permissions can be rewritten by any local process`);
  }
}

// ---------------------------------------------------------------------------
// Check 2: MCP server configurations
// ---------------------------------------------------------------------------

const SECRET_SHAPES = /\b(sk-[A-Za-z0-9]{16,}|sk-ant-[A-Za-z0-9-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/;

function auditMcpServers(servers, label) {
  for (const [name, srv] of Object.entries(servers ?? {})) {
    const where = `${label} (mcp server "${name}")`;
    if (typeof srv.url === "string" && /^http:\/\//.test(srv.url) && !/^http:\/\/(localhost|127\.0\.0\.1|\[?::1)/.test(srv.url)) {
      add("critical", where, `MCP endpoint over plaintext http: ${srv.url}`,
        "anything this server is sent (code, tokens) crosses the network unencrypted; use https");
    }
    if (typeof srv.command === "string") {
      if (TMP_EXEC.test(srv.command)) {
        add("critical", where, `MCP server binary launches from a temp directory: ${trim(srv.command)}`,
          "a server in /tmp is a classic drop location; install it properly and pin the path");
      }
      const joined = `${srv.command} ${(srv.args ?? []).join(" ")}`;
      const npx = joined.match(/\bnpx\s+((?:-\S+\s+)*)(\S+)/);
      if (npx) {
        const pkg = npx[2];
        const pinned = pkg.indexOf("@", 1) > 0; // "@scope/name@1.2.3" and "name@1.2.3" pass; bare names don't
        if (!pinned) {
          add("info", where, `npx runs unpinned package "${pkg}" at session start`,
            "pin an exact version (pkg@1.2.3); an unpinned name re-resolves on every start and is a typosquat target");
        }
      }
    }
    for (const [k, v] of Object.entries(srv.env ?? {})) {
      if (typeof v === "string" && SECRET_SHAPES.test(v)) {
        add("warn", where, `credential stored inline in config (env ${k})`,
          "reference an environment variable instead; config files get synced, backed up, and pasted");
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3: registered marketplaces (inventory, not judgment)
// ---------------------------------------------------------------------------

function auditMarketplaces() {
  const dir = join(HOME, ".claude", "plugins", "marketplaces");
  if (!existsSync(dir)) return;
  try {
    const names = readdirSync(dir).filter((n) => !n.startsWith("."));
    if (names.length) {
      add("info", dir, `registered plugin marketplaces: ${names.join(", ")}`,
        "each marketplace can ship hooks that run shell commands; remove any you don't recognize");
    }
  } catch { /* inventory only */ }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

auditSettingsFile(join(HOME, ".claude", "settings.json"), "~/.claude/settings.json");
auditSettingsFile(join(PROJECT, ".claude", "settings.json"), ".claude/settings.json");
auditSettingsFile(join(PROJECT, ".claude", "settings.local.json"), ".claude/settings.local.json");

const rootCfg = readJson(join(HOME, ".claude.json"));
if (rootCfg) {
  auditMcpServers(rootCfg.mcpServers, "~/.claude.json");
  for (const [proj, pcfg] of Object.entries(rootCfg.projects ?? {})) {
    auditMcpServers(pcfg.mcpServers, `~/.claude.json (project ${proj})`);
  }
  if (isWorldWritable(join(HOME, ".claude.json"))) {
    add("critical", "~/.claude.json", "root config is world-writable",
      "chmod o-w ~/.claude.json — this file routes MCP traffic and stores auth state");
  }
}
const projMcp = readJson(join(PROJECT, ".mcp.json"));
if (projMcp) auditMcpServers(projMcp.mcpServers ?? projMcp, ".mcp.json");

auditMarketplaces();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const crit = findings.filter((f) => f.severity === "critical");
const warn = findings.filter((f) => f.severity === "warn");
const info = findings.filter((f) => f.severity === "info");

if (AS_JSON) {
  process.stdout.write(JSON.stringify({ critical: crit, warn, info }, null, 2) + "\n");
} else {
  const tag = { critical: "CRIT", warn: "warn", info: "info" };
  for (const f of [...crit, ...warn, ...info]) {
    process.stdout.write(`  ${tag[f.severity]}  ${f.file}\n        ${f.issue}\n        fix: ${f.fix}\n\n`);
  }
  process.stdout.write(
    findings.length
      ? `${crit.length} critical, ${warn.length} warning(s), ${info.length} informational.\n`
      : "agent-audit: clean — no findings in hooks, permissions, or MCP config.\n",
  );
}

process.exit(crit.length ? 2 : warn.length ? 1 : 0);
