#!/usr/bin/env node
/**
 * agent-audit — hygiene scanner for your coding-agent configuration.
 *
 * Checks the places a compromised package or a careless afternoon actually
 * touches: Claude Code and Codex hook definitions (command, http, mcp_tool,
 * prompt, and agent handlers), permission grants, MCP server configs, and the
 * file permissions on the configs themselves. Every check maps to a
 * documented attack pattern (lifecycle-hook re-execution, MCP rerouting,
 * curl|bash payloads, hook payload exfiltration, hidden prompt instructions,
 * plaintext transports, inline secrets).
 *
 *   node audit.mjs                       # audit ~ and the current project
 *   node audit.mjs --json                # machine-readable
 *   node audit.mjs --home DIR --project DIR   # override roots (tests/CI)
 *
 * Exit codes: 0 clean/info · 1 warnings · 2 critical findings.
 * Zero dependencies. Read-only: this tool never modifies anything.
 */

import { readFileSync, existsSync, statSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
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

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

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

function auditHookCommand(cmd, sourceFile, event, kind = "hook") {
  const where = `${sourceFile} (${event} ${kind})`;
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

// Events that fire on session, config, or filesystem activity rather than on
// a tool call the user watches. Any handler here runs without a visible
// trigger, which is what persistence needs.
const LIFECYCLE_EVENTS = {
  SessionStart: "runs on every session start",
  Setup: "runs on every init or maintenance run",
  InstructionsLoaded: "runs whenever CLAUDE.md or rules files load",
  ConfigChange: "runs whenever a config file changes, so it can undo an edit you just made",
  FileChanged: "runs whenever a watched file changes on disk",
  CwdChanged: "runs whenever the working directory changes",
  DirectoryAdded: "runs whenever a directory is added to the session",
  WorktreeCreate: "replaces git worktree creation, so it decides where new worktrees come from",
  WorktreeRemove: "runs whenever a hook-created worktree is removed",
  PreCompact: "runs before every context compaction",
  PostCompact: "runs after every context compaction",
  PreModelSwitch: "runs before every model switch and can block it",
  PostModelSwitch: "runs after every model change",
  SessionEnd: "runs when every session ends",
};

function lifecycleCallout(label, event, summary) {
  const what = LIFECYCLE_EVENTS[event];
  if (!what) return;
  add("info", `${label} (${event} hook)`, `${what}: ${trim(summary)}`,
    `${event} fires without a tool call, which makes it a re-execution vector malware uses; confirm you added this yourself`);
}

// Tag characters smuggle invisible ASCII; bidi controls reorder what a reviewer
// sees; zero-width spaces split keywords. Zero-width joiner is left out
// because emoji sequences use it legitimately.
const HIDDEN_TEXT = /[\u{E0000}-\u{E007F}‪-‮⁦-⁩​‌⁠﻿]/u;
const ENCODED_BLOB = /[A-Za-z0-9+/]{120,}={0,2}/;
const AUTO_APPROVE = /\b(?:always|unconditionally|automatically)\s+(?:allow|approve|permit|accept)\b/i;
const PERMISSION_EVENTS = new Set(["PreToolUse", "PermissionRequest"]);

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "[::1]" || /^127\.\d+\.\d+\.\d+$/.test(hostname);
}

function auditHttpHook(h, where, event) {
  if (typeof h.url !== "string") {
    add("info", where, "could not inspect http hook: url is missing or not a string",
      "set url to the endpoint this hook posts to, or remove the hook");
    return null;
  }
  let url;
  try { url = new URL(h.url); } catch {
    add("info", where, `could not inspect http hook url: ${trim(h.url)}`,
      "use an absolute https URL, or review this hook manually");
    return null;
  }
  const envVars = Array.isArray(h.allowedEnvVars) ? h.allowedEnvVars.filter((v) => typeof v === "string") : [];
  const forwards = envVars.length ? ` and forwards ${envVars.join(", ")} in its headers` : "";
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    add("warn", where, `http hook uses unsupported scheme ${url.protocol}: ${trim(h.url)}`,
      "point the hook at an http or https endpoint you control, or remove it");
  } else if (!isLoopback(url.hostname)) {
    if (url.protocol === "http:") {
      add("critical", where, `http hook sends every ${event} payload over plaintext http to ${url.host}${forwards}`,
        "hook payloads carry tool inputs, file paths, and prompt text; use https, or remove the hook");
    } else {
      add("warn", where, `http hook sends every ${event} payload to ${url.host}${forwards}`,
        "hook payloads carry tool inputs, file paths, and prompt text; confirm you trust this endpoint");
    }
  } else {
    add("info", where, `http hook posts every ${event} payload to a local service at ${url.host}`,
      "any local process can bind this port; confirm which service is meant to receive it");
  }
  const literal = [h.url, ...Object.values(isObject(h.headers) ? h.headers : {})];
  if (url.username || url.password || literal.some((v) => typeof v === "string" && SECRET_SHAPES.test(v))) {
    add("warn", where, "credential stored inline in http hook url or headers",
      "reference an environment variable through allowedEnvVars instead of writing the secret into config");
  }
  return `POST ${h.url}`;
}

function auditMcpToolHook(h, where, event) {
  if (typeof h.server !== "string" || typeof h.tool !== "string" || !h.server || !h.tool) {
    add("info", where, "could not inspect mcp_tool hook: server or tool is missing",
      "name the MCP server and tool this hook calls, or remove the hook");
    return null;
  }
  add("info", where, `hook calls MCP tool ${h.server}/${h.tool} on every ${event}`,
    "the call can carry tool arguments and file paths to that server; confirm the server is one you configured");
  if (SECRET_SHAPES.test(JSON.stringify(h.input ?? {}))) {
    add("warn", where, "credential stored inline in mcp_tool hook input",
      "pass secrets through the MCP server's own configuration instead of the hook input");
  }
  return `MCP tool ${h.server}/${h.tool}`;
}

// prompt hooks ask a model for a one-turn decision; agent hooks spawn a
// subagent that can use tools. Both carry instructions, so the prompt text is
// the payload to review.
function auditPromptHook(h, where, event) {
  if (typeof h.prompt !== "string") {
    add("info", where, `could not inspect ${h.type} hook: prompt is missing or not a string`,
      "set the prompt this hook sends, or remove the hook");
    return null;
  }
  const text = h.prompt;
  const tools = h.type === "agent";
  if (HIDDEN_TEXT.test(text)) {
    add("critical", where, `${h.type} hook prompt contains invisible Unicode that can hide instructions`,
      "rewrite the prompt in plain text and review what the hidden characters spelled");
  }
  const pipesToShell = REMOTE_EXEC.some((pattern) => pattern.test(text));
  if (pipesToShell || /\b(?:curl|wget)\b[\s\S]*\b(?:sh|bash|zsh|node|python3?|eval)\b/.test(text)) {
    // Only an exact download-and-execute shape is critical; prose that merely
    // mentions both a fetch and an interpreter is a review prompt.
    add(tools && pipesToShell ? "critical" : "warn", where,
      `${h.type} hook prompt asks the model to fetch and run code: ${trim(text)}`,
      tools
        ? "an agent hook can act on this with real tools; remove it unless you wrote it and vendor the script locally"
        : "a hook prompt has no reason to mention downloading and running code; review or remove it");
  }
  if (OBFUSCATION.test(text) || ENCODED_BLOB.test(text)) {
    add("warn", where, `${h.type} hook prompt carries an encoded blob`,
      "decode it and review it; a hook prompt should be readable at a glance");
  }
  if (PERMISSION_EVENTS.has(event) && AUTO_APPROVE.test(text)) {
    add("warn", where, `${h.type} hook on ${event} tells the model to approve tool calls: ${trim(text)}`,
      "a hook that always approves bypasses the permission layer; allowlist specific commands instead");
  }
  if (tools) {
    add("info", where, `agent hook spawns a tool-using subagent on every ${event}`,
      "agent hooks run tools without asking you first; confirm you added this yourself");
  }
  return `${h.type} hook: ${text}`;
}

function auditHook(h, label, event, pluginRoot = null) {
  const where = `${label} (${event} hook)`;
  if (!isObject(h)) return;
  // Plugin hooks reference their own files through CLAUDE_PLUGIN_ROOT; resolve
  // it so the world-writable script check sees the real path.
  if (pluginRoot && typeof h.command === "string") {
    const expand = (s) => (typeof s === "string" ? s.replaceAll("${CLAUDE_PLUGIN_ROOT}", pluginRoot) : s);
    h = { ...h, command: expand(h.command), args: Array.isArray(h.args) ? h.args.map(expand) : h.args };
  }
  // Older Codex hook files omit type on command hooks.
  const type = h.type ?? (typeof h.command === "string" ? "command" : undefined);
  let summary = null;
  if (type === "command") {
    if (typeof h.command !== "string") {
      add("info", where, "could not inspect command hook: command is missing or not a string",
        "set the command this hook runs, or remove the hook");
    } else {
      summary = fullHookCommand(h);
      auditHookCommand(summary, label, event);
    }
  } else if (type === "http") summary = auditHttpHook(h, where, event);
  else if (type === "mcp_tool") summary = auditMcpToolHook(h, where, event);
  else if (type === "prompt" || type === "agent") summary = auditPromptHook({ ...h, type }, where, event);
  else {
    add("info", where, `could not inspect hook of type ${JSON.stringify(type ?? null)}`,
      "check this hook against the host's hook reference and review it manually");
  }
  if (summary) lifecycleCallout(label, event, summary);
}

// An event map: { PreToolUse: [{ matcher, hooks: [handler, ...] }], ... }
function auditHookMap(map, label, pluginRoot = null) {
  for (const [event, groups] of Object.entries(isObject(map) ? map : {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const h of Array.isArray(group?.hooks) ? group.hooks : []) auditHook(h, label, event, pluginRoot);
    }
  }
}

function auditSettingsFile(path, label) {
  const cfg = readJson(path);
  if (!cfg) return;

  auditHookMap(cfg.hooks, label);

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
      lifecycleCallout(label, hookEvent, value);
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
// Check 4: what installed plugins can run
// ---------------------------------------------------------------------------

// Names a plugin's bin/ could shadow on the Bash tool's PATH.
const SHADOWABLE = new Set([
  "bash", "bun", "cargo", "cat", "claude", "codex", "cp", "curl", "docker", "env", "gh", "git", "go",
  "ls", "make", "mv", "node", "npm", "npx", "pip", "pip3", "pnpm", "python", "python3", "rm", "sh",
  "ssh", "sudo", "wget", "which", "yarn", "zsh",
]);

function readJsonResult(path) {
  if (!existsSync(path)) return { missing: true };
  try { return { value: JSON.parse(readFileSync(path, "utf8")) }; } catch { return { error: true }; }
}

const listDirs = (dir) => {
  try { return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name); }
  catch { return []; }
};

// A manifest path must stay inside the plugin; the host refuses one that
// escapes, so the audit reports it instead of following it.
function pluginPath(root, rel, label, field) {
  if (typeof rel !== "string") return null;
  const full = resolve(root, rel);
  if (full !== root && !full.startsWith(root + sep)) {
    add("info", label, `manifest ${field} path escapes the plugin directory: ${rel}`,
      "the host will not load it; review why the plugin points outside itself");
    return null;
  }
  return full;
}

function readPluginJson(path, label, what) {
  const r = readJsonResult(path);
  if (r.error) add("info", label, `could not parse ${what}: ${path}`,
    "a file the scanner cannot read is not a clean result; review it manually");
  return r.value;
}

function auditPluginHooks(root, manifest, label) {
  const files = [join(root, "hooks", "hooks.json")];
  const inline = [];
  for (const entry of Array.isArray(manifest?.hooks) ? manifest.hooks : manifest?.hooks ? [manifest.hooks] : []) {
    if (typeof entry === "string") {
      const full = pluginPath(root, entry, label, "hooks");
      if (full && !files.includes(full)) files.push(full);
    } else if (isObject(entry)) inline.push(entry);
  }
  for (const file of files) {
    const cfg = readPluginJson(file, label, "plugin hooks file");
    if (!cfg) continue;
    auditHookMap(cfg.hooks, label, root);
    if (isWorldWritable(file)) {
      add("critical", label, `plugin hooks file is world-writable: ${file}`,
        `chmod o-w ${file} — any local process can change what this plugin runs`);
    }
  }
  for (const map of inline) auditHookMap(map, label, root);
}

function auditPluginMonitors(root, manifest, label) {
  const declared = manifest?.experimental?.monitors ?? manifest?.monitors;
  let monitors = Array.isArray(declared) ? declared : null;
  if (!monitors) {
    const file = typeof declared === "string" ? pluginPath(root, declared, label, "monitors") : join(root, "monitors", "monitors.json");
    const value = file && readPluginJson(file, label, "plugin monitors file");
    monitors = Array.isArray(value) ? value : Array.isArray(value?.monitors) ? value.monitors : [];
  }
  for (const m of monitors) {
    if (!isObject(m) || typeof m.command !== "string") {
      add("info", label, "could not inspect monitor: command is missing or not a string",
        "check the monitor entry against the plugin reference and review it manually");
      continue;
    }
    const name = typeof m.name === "string" ? m.name : "unnamed";
    const command = m.command.replaceAll("${CLAUDE_PLUGIN_ROOT}", root);
    const when = typeof m.when === "string" && m.when.startsWith("on-skill-invoke:")
      ? `the first time skill ${m.when.slice("on-skill-invoke:".length)} runs`
      : "every session start";
    add("info", `${label} (monitor ${name})`, `starts a background process at ${when}: ${trim(command)}`,
      "monitors keep running for the whole session; confirm you expect this plugin to run one");
    auditHookCommand(command, label, name, "monitor");
  }
}

function auditPluginMcp(root, manifest, label) {
  const servers = {};
  const collect = (value) => {
    const map = isObject(value?.mcpServers) ? value.mcpServers : value;
    if (isObject(map)) Object.assign(servers, map);
  };
  collect(readPluginJson(join(root, ".mcp.json"), label, "plugin MCP config"));
  for (const entry of Array.isArray(manifest?.mcpServers) ? manifest.mcpServers : manifest?.mcpServers ? [manifest.mcpServers] : []) {
    if (typeof entry === "string" && entry.endsWith(".json")) {
      const full = pluginPath(root, entry, label, "mcpServers");
      if (full) collect(readPluginJson(full, label, "plugin MCP config"));
    } else if (typeof entry === "string") {
      add("info", label, `plugin ships an MCP bundle the audit cannot open: ${entry}`,
        "bundles run their own server code; review the bundle before enabling this plugin");
    } else collect(entry);
  }
  auditMcpServers(servers, label);
}

function auditPluginBin(root, label) {
  const dir = join(root, "bin");
  let names;
  try { names = readdirSync(dir).filter((n) => !n.startsWith(".")); } catch { return; }
  if (!names.length) return;
  add("info", label, `puts ${names.length} executable(s) on the Bash tool's PATH: ${trim(names.join(", "))}`,
    "the agent runs these as bare commands; confirm you expect this plugin to ship executables");
  const shadows = names.filter((n) => SHADOWABLE.has(n.replace(/\.(?:sh|cmd|exe)$/i, "")));
  if (shadows.length) {
    add("warn", label, `bin/ shadows common commands: ${shadows.join(", ")}`,
      "a plugin that replaces git, node, or curl on PATH sees every call to them; remove it unless you know why it does this");
  }
}

function auditPluginDir(root, label, host) {
  const manifestDir = host === "codex" ? ".codex-plugin" : ".claude-plugin";
  const manifest = readPluginJson(join(root, manifestDir, "plugin.json"), label, "plugin manifest");
  auditPluginHooks(root, manifest, label);
  auditPluginMcp(root, manifest, label);
  if (host === "claude") {
    auditPluginMonitors(root, manifest, label);
    auditPluginBin(root, label);
  }
}

// Every version directory on disk is audited, enabled or not: a project
// settings file can enable any installed plugin, and an older version keeps
// running in sessions that loaded it until cleanup removes it.
function auditInstalledPlugins(pluginsRoot, host) {
  const seen = new Set();
  const visit = (root, label) => {
    let real;
    try { real = realpathSync(root); } catch { return; }
    if (seen.has(real) || existsSync(join(real, ".orphaned_at"))) return;
    seen.add(real);
    auditPluginDir(real, label, host);
  };
  const prefix = host === "codex" ? "codex plugin" : "plugin";
  const cache = join(pluginsRoot, "cache");
  for (const market of listDirs(cache)) {
    for (const plugin of listDirs(join(cache, market))) {
      for (const version of listDirs(join(cache, market, plugin))) {
        visit(join(cache, market, plugin, version), `${prefix} ${plugin}@${market} ${version}`);
      }
    }
  }
  if (host !== "claude") return;
  // Plugins loaded in place from a local marketplace are recorded here with
  // their source path rather than copied into cache/.
  const installed = readPluginJson(join(pluginsRoot, "installed_plugins.json"), pluginsRoot, "installed_plugins.json");
  for (const [id, records] of Object.entries(isObject(installed?.plugins) ? installed.plugins : {})) {
    for (const record of Array.isArray(records) ? records : [records]) {
      if (typeof record?.installPath === "string") visit(record.installPath, `${prefix} ${id}`);
    }
  }
  for (const name of listDirs(join(pluginsRoot, "synced"))) visit(join(pluginsRoot, "synced", name), `${prefix} ${name}@synced`);
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
// --home pins every root for tests and CI; otherwise honor a relocated cache.
const claudePlugins = (!flag("--home") && process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR) || join(HOME, ".claude", "plugins");
auditInstalledPlugins(claudePlugins, "claude");
auditInstalledPlugins(join(HOME, ".codex", "plugins"), "codex");

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
