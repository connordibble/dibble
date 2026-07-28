#!/usr/bin/env node
/**
 * agent-audit — hygiene scanner for your coding-agent configuration.
 *
 * Checks the places a compromised package or a careless afternoon actually
 * touches: Claude Code and Codex hook definitions, permission grants, MCP
 * server configs, and the
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

const REMOTE_EXEC = [
  /\b(?:curl|wget)\b[^|;&]*(?:\||;|&&)[^|;&]*\b(?:sh|bash|zsh|node|python3?)\b/,
  /\b(?:sh|bash|zsh|node|python3?)\b[^\n]*<\(\s*(?:curl|wget)\b/,
  /\beval\s+["']?\$\(\s*(?:curl|wget)\b/,
];
const OBFUSCATION = /\bbase64\b.*(-d|--decode|-D)|\batob\s*\(/;
const TMP_EXEC = /(^|[\s"'=])\/(?:var\/)?tmp\//;
const INLINE_EVAL = /\b(node\s+-e|sh\s+-c|bash\s+-c|eval)\b/;

// Some hook formats support an exec form ({ command, args: [...] }). Scanning
// h.command alone lets
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
  const remoteExec = REMOTE_EXEC.some((pattern) => pattern.test(cmd));
  if (remoteExec) {
    add("critical", where, `hook downloads and executes remote code: ${trim(cmd)}`,
      "vendor the script locally, read it, then reference the local copy");
  } else if (/\b(?:curl|wget)\b/.test(cmd) && /\b(?:sh|bash|zsh|node|python3?|eval)\b/.test(cmd)) {
    add("warn", where, `hook combines a network fetch and interpreter in an unrecognized shell shape: ${trim(cmd)}`,
      "review this command manually or rewrite it so the audit can determine whether downloaded code executes");
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

// Codex uses TOML for permissions and MCP servers. This is a deliberately
// small reader for the security-relevant shapes below, not a general TOML
// implementation. The important contract is fail-loud: any assignment or
// table we cannot model becomes an informational finding instead of a clean
// audit result.
function stripTomlComment(raw) {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (quote === '"' && char === "\\" && !escaped) { escaped = true; continue; }
    if (char === quote && !escaped) quote = null;
    else if (!quote && (char === '"' || char === "'")) quote = char;
    else if (!quote && char === "#") return raw.slice(0, i).trimEnd();
    escaped = false;
  }
  return raw;
}

function splitToml(raw, delimiter) {
  const parts = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  let square = 0;
  let curly = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (quote === '"' && char === "\\" && !escaped) { escaped = true; continue; }
    if (char === quote && !escaped) quote = null;
    else if (!quote && (char === '"' || char === "'")) quote = char;
    else if (!quote) {
      if (char === "[") square++;
      else if (char === "]") square--;
      else if (char === "{") curly++;
      else if (char === "}") curly--;
      else if (char === delimiter && square === 0 && curly === 0) {
        parts.push(raw.slice(start, i));
        start = i + 1;
      }
    }
    escaped = false;
  }
  parts.push(raw.slice(start));
  return { parts, balanced: !quote && square === 0 && curly === 0 };
}

function tomlPath(raw) {
  const split = splitToml(raw.trim(), ".");
  if (!split.balanced) return null;
  const parts = [];
  for (const item of split.parts) {
    const key = item.trim();
    if (/^[A-Za-z0-9_-]+$/.test(key)) parts.push(key);
    else if (key.startsWith('"') && key.endsWith('"')) {
      try { parts.push(JSON.parse(key)); } catch { return null; }
    } else if (key.startsWith("'") && key.endsWith("'") && !key.slice(1, -1).includes("'")) {
      parts.push(key.slice(1, -1));
    } else return null;
  }
  return parts.length ? parts : null;
}

function splitAssignment(raw) {
  const split = splitToml(raw, "=");
  if (!split.balanced || split.parts.length < 2) return null;
  return [split.parts[0], split.parts.slice(1).join("=")];
}

function tomlValue(raw) {
  const value = stripTomlComment(raw).trim();
  if (!value) return { ok: false };
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return { ok: true, value: JSON.parse(value) }; } catch { return { ok: false }; }
  }
  if (value.startsWith("'") && value.endsWith("'") && !value.slice(1, -1).includes("'")) {
    return { ok: true, value: value.slice(1, -1) };
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const split = splitToml(value.slice(1, -1), ",");
    if (!split.balanced) return { ok: false };
    const items = [];
    for (const item of split.parts) {
      if (!item.trim()) continue;
      const parsed = tomlValue(item);
      if (!parsed.ok) return { ok: false };
      items.push(parsed.value);
    }
    return { ok: true, value: items };
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    const split = splitToml(value.slice(1, -1), ",");
    if (!split.balanced) return { ok: false };
    const table = {};
    for (const item of split.parts) {
      if (!item.trim()) continue;
      const assignment = splitAssignment(item);
      const path = assignment && tomlPath(assignment[0]);
      const parsed = assignment && tomlValue(assignment[1]);
      if (!path || !parsed?.ok || path.length !== 1) return { ok: false };
      table[path[0]] = parsed.value;
    }
    return { ok: true, value: table };
  }
  if (value === "true") return { ok: true, value: true };
  if (value === "false") return { ok: true, value: false };
  if (/^[+-]?(?:\d+(?:\.\d+)?|inf|nan)$/i.test(value)) return { ok: true, value: Number(value.replaceAll("_", "")) };
  // Keep accepting the historical bare-string subset while reporting truly
  // structured TOML that this reader cannot safely interpret.
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return { ok: true, value };
  return { ok: false };
}

function auditCodexConfig(path, label) {
  if (!existsSync(path)) return;
  let text;
  try { text = readFileSync(path, "utf8"); } catch { return; }

  let section = [];
  const root = {};
  const profiles = {};
  const servers = {};
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const header = line.match(/^\[\[?([\s\S]+?)\]\]?\s*(?:#.*)?$/);
    if (line.startsWith("[") && !header) {
      add("info", label, `could not inspect TOML table on line ${index + 1}: ${trim(line)}`,
        "rewrite this security-relevant config using a supported table shape or review it manually");
      section = [];
      continue;
    }
    if (header) {
      section = tomlPath(header[1]);
      if (!section) {
        add("info", label, `could not inspect TOML table on line ${index + 1}: ${trim(line)}`,
          "rewrite this security-relevant config using a supported table shape or review it manually");
        section = [];
      }
      continue;
    }
    const assignment = splitAssignment(line);
    const keyPath = assignment && tomlPath(assignment[0]);
    const parsed = assignment && tomlValue(assignment[1]);
    if (!assignment || !keyPath || !parsed?.ok) {
      if (line.includes("=")) add("info", label, `could not inspect TOML assignment on line ${index + 1}: ${trim(line)}`,
        "rewrite this security-relevant config using strings, arrays, or inline tables, or review it manually");
      continue;
    }
    const fullPath = [...section, ...keyPath];
    const value = parsed.value;

    if (fullPath.length === 1) root[fullPath[0]] = value;
    if (fullPath[0] === "profiles" && fullPath.length === 3) {
      (profiles[fullPath[1]] ??= {})[fullPath[2]] = value;
    }

    if (fullPath[0] === "mcp_servers" && fullPath.length >= 2) {
      const server = servers[fullPath[1]] ??= {};
      if (fullPath.length === 2 && value && typeof value === "object" && !Array.isArray(value)) Object.assign(server, value);
      else if (fullPath[2] === "env" && fullPath.length === 4) (server.env ??= {})[fullPath[3]] = value;
      else if (fullPath.length === 3) server[fullPath[2]] = value;
    }

    const hookEvent = fullPath[0] === "hooks" && fullPath.includes("hooks") ? fullPath[1] : null;
    if (hookEvent && fullPath.at(-1) === "command" && typeof value === "string") {
      auditHookCommand(value, label, hookEvent);
      if (hookEvent === "SessionStart") {
        add("info", `${label} (SessionStart hook)`, `runs on every session start: ${trim(value)}`,
          "SessionStart is a re-execution vector; confirm you added this hook yourself");
      }
    }
  }

  auditMcpServers(servers, label);
  if (root.sandbox_mode === "danger-full-access" && root.approval_policy === "never") {
    add("critical", label, "danger-full-access is combined with approval_policy = never",
      "restore workspace-write/read-only sandboxing or an approval policy before running agents");
  } else {
    if (root.sandbox_mode === "danger-full-access") {
      add("warn", label, "sandbox_mode is danger-full-access", "prefer workspace-write unless broad host access is required");
    }
    if (root.approval_policy === "never") {
      add("warn", label, "approval_policy is never", "use a prompting approval policy for commands outside the sandbox");
    }
  }
  for (const [name, profile] of Object.entries(profiles)) {
    const where = `${label} (profile "${name}")`;
    if (profile.sandbox_mode === "danger-full-access" && profile.approval_policy === "never") {
      add("critical", where, "danger-full-access is combined with approval_policy = never",
        "restore workspace-write/read-only sandboxing or an approval policy before using this profile");
    } else {
      if (profile.sandbox_mode === "danger-full-access") add("warn", where, "sandbox_mode is danger-full-access", "prefer workspace-write unless broad host access is required");
      if (profile.approval_policy === "never") add("warn", where, "approval_policy is never", "use a prompting approval policy for interactive profile runs");
    }
  }
  if (SECRET_SHAPES.test(text)) {
    add("warn", label, "credential-like value stored inline in Codex config",
      "reference an environment variable or secret store instead of committing credentials to config");
  }
  if (isWorldWritable(path)) {
    add("critical", label, "Codex config is world-writable",
      `chmod o-w ${path} — hooks, permissions, and MCP routing can be rewritten locally`);
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
auditSettingsFile(join(HOME, ".codex", "hooks.json"), "~/.codex/hooks.json");
auditSettingsFile(join(PROJECT, ".codex", "hooks.json"), ".codex/hooks.json");

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

auditCodexConfig(join(HOME, ".codex", "config.toml"), "~/.codex/config.toml");
auditCodexConfig(join(PROJECT, ".codex", "config.toml"), ".codex/config.toml");

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
