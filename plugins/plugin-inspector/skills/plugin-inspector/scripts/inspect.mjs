#!/usr/bin/env node
/**
 * plugin-inspector — validates Claude Code and ChatGPT/Codex plugins, then
 * reports what each plugin can load, execute, and connect to.
 *
 *   node inspect.mjs [repo-or-plugin-root] [--json] [--strict]
 *
 * Exit codes: 0 clean (warnings allowed), 1 errors or --strict warnings,
 * 64 invalid CLI usage. Zero dependencies. Node 20+.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SECRET = /\b(?:sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/;
const REMOTE_EXEC = [
  /\b(?:curl|wget)\b[^|;&]*(?:\||;|&&)[^|;&]*\b(?:sh|bash|zsh|node|python3?)\b/,
  /\b(?:sh|bash|zsh|node|python3?)\b[^\n]*<\(\s*(?:curl|wget)\b/,
  /\beval\s+["']?\$\(\s*(?:curl|wget)\b/,
];
const MUTABLE_REF = /^(?:main|master|head|latest|next|dev|develop)$/i;

const RESERVED_CLAUDE_MARKETPLACES = new Set([
  "claude-code-marketplace", "claude-code-plugins", "claude-plugins-official",
  "claude-plugins-community", "claude-community", "anthropic-marketplace",
  "anthropic-plugins", "agent-skills", "anthropic-agent-skills",
  "knowledge-work-plugins", "life-sciences", "claude-for-legal",
  "claude-for-financial-services", "financial-services-plugins",
]);

const CLAUDE_MANIFEST_FIELDS = new Set([
  "$schema", "name", "displayName", "version", "description", "author",
  "homepage", "repository", "license", "keywords", "skills", "commands",
  "agents", "hooks", "mcpServers", "outputStyles", "lspServers",
  "experimental", "dependencies", "defaultEnabled", "workflows",
  "userConfig", "channels",
]);
const OPENAI_MANIFEST_FIELDS = new Set([
  "id", "name", "version", "description", "author", "homepage",
  "repository", "license", "keywords", "skills", "mcpServers", "apps",
  "hooks", "interface",
]);
const OPENAI_INTERFACE_FIELDS = new Set([
  "displayName", "shortDescription", "longDescription", "developerName",
  "category", "capabilities", "websiteURL", "privacyPolicyURL",
  "termsOfServiceURL", "brandColor", "composerIcon", "logo", "logoDark",
  "screenshots", "defaultPrompt", "default_prompt",
]);
const SOURCE_TYPES = new Set(["local", "github", "url", "git-subdir", "npm"]);
const CLAUDE_HOOK_TYPES = new Set(["command", "http", "mcp_tool", "prompt", "agent"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function relDisplay(root, path) {
  const rel = relative(root, path);
  return rel && !rel.startsWith("..") ? rel : path;
}

function inside(base, path) {
  const rel = relative(resolve(base), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function downloadsAndExecutesRemote(command) {
  return REMOTE_EXEC.some((pattern) => pattern.test(command));
}

function hasUnclassifiedRemoteExecutionShape(command) {
  return /\b(?:curl|wget)\b/.test(command)
    && /\b(?:sh|bash|zsh|node|python3?|eval)\b/.test(command)
    && !downloadsAndExecutesRemote(command);
}

function isLoopbackHttp(url) {
  return /^http:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::|\/|$)/i.test(url);
}

function temporaryAbsolutePaths(command) {
  const matches = command.match(/(?:^|\s|["'])(\/(?:tmp|private\/tmp|var\/tmp)\/[^\s"']+)/g) ?? [];
  return matches.map((match) => match.trim().replace(/^["']|["']$/g, ""));
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (pair) fields[pair[1]] = pair[2].replace(/^['"]|['"]$/g, "");
  }
  return fields;
}

function parseArgs(argv) {
  const options = { root: ".", json: false, strict: false };
  const positional = [];
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--")) throw new Error(`unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length > 1) throw new Error("expected at most one repository or plugin path");
  if (positional[0]) options.root = positional[0];
  return options;
}

function usage() {
  return "usage: plugin-inspector [repo-or-plugin-root] [--json] [--strict]\n";
}

export function inspectRepository(inputRoot) {
  const root = resolve(inputRoot);
  const findings = [];
  const plugins = new Map();
  const marketplaces = [];

  const add = (severity, host, plugin, file, issue, fix) => {
    findings.push({ severity, host, plugin: plugin ?? null, file: file ? relDisplay(root, file) : null, issue, fix });
  };
  const error = (...args) => add("error", ...args);
  const warn = (...args) => add("warn", ...args);

  const readJson = (path, host, plugin, label) => {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (cause) {
      error(host, plugin, path, `${label} is not valid JSON (${cause.message})`, "fix the JSON syntax");
      return null;
    }
  };

  const ensurePlugin = (name, base = null) => {
    const key = base ? resolve(base) : `external:${name}`;
    let plugin = plugins.get(key);
    if (!plugin) {
      plugin = {
        name,
        base: base ? resolve(base) : null,
        hosts: new Set(),
        sources: [],
        components: {
          skills: new Set(), commands: new Set(), agents: new Set(),
          hooks: [], mcpServers: [], apps: [], lspServers: [], monitors: [],
          workflows: new Set(), themes: new Set(), channels: [], userConfig: [],
          executables: new Set(), dependencies: [], assets: new Set(),
        },
        authority: { execution: [], network: [], install: [] },
      };
      plugins.set(key, plugin);
    }
    return plugin;
  };

  const resolveLocalPath = (host, sourcePath, pluginRoot = ".") => {
    const direct = resolve(root, sourcePath);
    const rooted = resolve(root, pluginRoot, sourcePath);
    if (host === "claude" && pluginRoot !== "." && existsSync(rooted)) return rooted;
    if (existsSync(direct)) return direct;
    return host === "claude" && pluginRoot !== "." ? rooted : direct;
  };

  const validateRelativePath = (host, plugin, base, value, label, expected = null) => {
    if (!nonEmptyString(value)) {
      error(host, plugin.name, base, `${label} must be a non-empty relative path`, "use a ./-prefixed path inside the plugin");
      return null;
    }
    if (isAbsolute(value) || !value.startsWith("./")) {
      error(host, plugin.name, base, `${label} must start with ./ and stay inside the plugin`, "replace it with a plugin-relative path");
      return null;
    }
    const target = resolve(base, value);
    if (!inside(base, target)) {
      error(host, plugin.name, base, `${label} escapes the plugin root: ${value}`, "point it at a file bundled inside the plugin");
      return null;
    }
    if (!existsSync(target)) {
      error(host, plugin.name, base, `${label} points to missing ${value}`, "add the referenced file or correct the path");
      return null;
    }
    if (expected === "file" && !statSync(target).isFile()) {
      error(host, plugin.name, target, `${label} must point to a file`, "point it at the expected file");
    }
    if (expected === "dir" && !statSync(target).isDirectory()) {
      error(host, plugin.name, target, `${label} must point to a directory`, "point it at the expected directory");
    }
    return target;
  };

  const validateSource = (host, entry, pluginRoot, marketplacePath) => {
    const name = entry?.name;
    const source = entry?.source;
    if (typeof source === "string") {
      if (!source.startsWith("./")) {
        error(host, name, marketplacePath, `local source '${source}' must start with ./`, "use a marketplace-relative path");
        return { base: null, descriptor: source };
      }
      const base = resolveLocalPath(host, source, pluginRoot);
      if (!inside(root, base)) {
        error(host, name, marketplacePath, `local source '${source}' escapes the marketplace root`, "keep local plugins inside the marketplace");
        return { base: null, descriptor: source };
      }
      if (!existsSync(base)) error(host, name, marketplacePath, `local source '${source}' does not exist`, "add the plugin directory or correct source");
      return { base, descriptor: `local:${source}` };
    }
    if (!isObject(source)) {
      error(host, name, marketplacePath, "plugin source must be a local path or source object", "set source to ./path or a supported source object");
      return { base: null, descriptor: "invalid" };
    }
    const type = source.source;
    if (!SOURCE_TYPES.has(type)) {
      error(host, name, marketplacePath, `unsupported plugin source type '${type}'`, "use local, github, url, git-subdir, or npm");
      return { base: null, descriptor: String(type) };
    }
    if (type === "local") {
      if (host === "claude") warn(host, name, marketplacePath, "Claude local sources normally use a plain ./path string", "use the documented string form unless another host shares this entry");
      const path = source.path;
      if (!nonEmptyString(path) || !path.startsWith("./")) {
        error(host, name, marketplacePath, "local source.path must start with ./", "use a marketplace-relative path");
        return { base: null, descriptor: "local" };
      }
      const base = resolveLocalPath(host, path, pluginRoot);
      if (!inside(root, base)) error(host, name, marketplacePath, `local source.path escapes the marketplace root: ${path}`, "keep local plugins inside the marketplace");
      if (!existsSync(base)) error(host, name, marketplacePath, `local source.path does not exist: ${path}`, "add the plugin directory or correct source.path");
      return { base, descriptor: `local:${path}` };
    }
    if (type === "github") {
      if (!nonEmptyString(source.repo) || !/^[^/]+\/[^/]+$/.test(source.repo)) {
        error(host, name, marketplacePath, "github source requires repo as owner/name", "set source.repo to the GitHub repository");
      }
    }
    if (type === "url" || type === "git-subdir") {
      if (!nonEmptyString(source.url)) error(host, name, marketplacePath, `${type} source requires url`, "set the Git repository URL");
      if (type === "git-subdir" && (!nonEmptyString(source.path) || !source.path.startsWith("./"))) {
        error(host, name, marketplacePath, "git-subdir source.path must start with ./", "set the repository-relative plugin directory");
      }
    }
    if (["github", "url", "git-subdir"].includes(type)) {
      if (!source.sha) {
        const detail = source.ref ? `ref '${source.ref}'` : "the repository default branch";
        warn(host, name, marketplacePath, `Git source follows mutable ${detail}`, "pin source.sha for reproducible installs");
      }
      if (source.ref && MUTABLE_REF.test(source.ref)) {
        warn(host, name, marketplacePath, `Git source uses moving ref '${source.ref}'`, "pin a release tag or source.sha");
      }
    }
    if (type === "npm") {
      if (!nonEmptyString(source.package)) error(host, name, marketplacePath, "npm source requires package", "set the registry package name");
      if (!source.version || !EXACT_VERSION.test(source.version)) {
        warn(host, name, marketplacePath, `npm source is not pinned to an exact version${source.version ? ` (${source.version})` : ""}`, "pin an exact package version for reproducible installs");
      }
      if (source.registry !== undefined) {
        try {
          const url = new URL(source.registry);
          if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
        } catch {
          error(host, name, marketplacePath, "npm registry must be HTTPS without credentials, query, or fragment", "use a clean https:// registry URL and external authentication");
        }
      }
    }
    return { base: null, descriptor: `${type}:${source.repo ?? source.url ?? source.package ?? "unknown"}`, source };
  };

  const registerMarketplace = (host, path) => {
    const marketplace = readJson(path, host, null, "marketplace");
    if (!isObject(marketplace)) return;
    marketplaces.push({ host, path: relDisplay(root, path), name: marketplace.name ?? null });
    if (!nonEmptyString(marketplace.name) || !KEBAB.test(marketplace.name)) {
      error(host, null, path, "marketplace name must be non-empty kebab-case", "set a stable kebab-case name");
    }
    if (host === "claude") {
      if (RESERVED_CLAUDE_MARKETPLACES.has(marketplace.name)) error(host, null, path, `marketplace name '${marketplace.name}' is reserved`, "choose a distinct marketplace name");
      if (!nonEmptyString(marketplace.owner?.name)) error(host, null, path, "marketplace owner.name is required", "identify the marketplace owner");
    } else if (marketplace.interface !== undefined && !nonEmptyString(marketplace.interface?.displayName)) {
      error(host, null, path, "marketplace interface.displayName must be non-empty when interface is present", "set the title shown in the plugin picker");
    }
    if (!Array.isArray(marketplace.plugins)) {
      error(host, null, path, "marketplace plugins must be an array", "add a plugins array");
      return;
    }
    const names = new Set();
    const pluginRoot = host === "claude" ? marketplace.metadata?.pluginRoot ?? "." : ".";
    for (const entry of marketplace.plugins) {
      if (!isObject(entry)) {
        error(host, null, path, "every marketplace plugin entry must be an object", "replace the invalid entry");
        continue;
      }
      if (!nonEmptyString(entry.name) || !KEBAB.test(entry.name)) {
        error(host, entry.name, path, `plugin name '${entry.name}' must be kebab-case`, "set a stable kebab-case name");
        continue;
      }
      if (names.has(entry.name)) error(host, entry.name, path, "duplicate marketplace plugin entry", "keep one entry per plugin name");
      names.add(entry.name);
      if (host === "claude" && entry.strict !== undefined && typeof entry.strict !== "boolean") {
        error(host, entry.name, path, "marketplace strict must be boolean", "use true or false");
      }
      if (host === "claude" && entry.defaultEnabled !== undefined && typeof entry.defaultEnabled !== "boolean") {
        error(host, entry.name, path, "marketplace defaultEnabled must be boolean", "use true or false");
      }
      if (host === "openai") {
        if (!isObject(entry.policy)) error(host, entry.name, path, "OpenAI marketplace entry requires policy", "set installation and authentication policy");
        else {
          if (!["AVAILABLE", "INSTALLED_BY_DEFAULT", "NOT_AVAILABLE"].includes(entry.policy.installation)) {
            error(host, entry.name, path, `unsupported installation policy '${entry.policy.installation}'`, "use AVAILABLE, INSTALLED_BY_DEFAULT, or NOT_AVAILABLE");
          }
          if (!nonEmptyString(entry.policy.authentication)) error(host, entry.name, path, "policy.authentication must be non-empty", "declare when authentication occurs");
        }
        if (!nonEmptyString(entry.category)) error(host, entry.name, path, "OpenAI marketplace entry requires category", "set the picker category");
      }
      const resolvedSource = validateSource(host, entry, pluginRoot, path);
      const plugin = ensurePlugin(entry.name, resolvedSource.base);
      plugin.hosts.add(host);
      plugin.sources.push({ host, value: resolvedSource.descriptor });
      plugin.authority.install.push({ host, source: resolvedSource.descriptor });
      if (host === "claude" && entry.version && plugin.base) plugin.claudeMarketplaceVersion = entry.version;
    }
  };

  const claudeMarketplace = join(root, ".claude-plugin", "marketplace.json");
  const openaiMarketplace = join(root, ".agents", "plugins", "marketplace.json");
  if (existsSync(claudeMarketplace)) registerMarketplace("claude", claudeMarketplace);
  if (existsSync(openaiMarketplace)) registerMarketplace("openai", openaiMarketplace);

  const standaloneClaude = join(root, ".claude-plugin", "plugin.json");
  const standaloneOpenAI = join(root, ".codex-plugin", "plugin.json");
  if (!marketplaces.length && (existsSync(standaloneClaude) || existsSync(standaloneOpenAI))) {
    const first = existsSync(standaloneOpenAI)
      ? readJson(standaloneOpenAI, "openai", null, "plugin manifest")
      : readJson(standaloneClaude, "claude", null, "plugin manifest");
    const plugin = ensurePlugin(first?.name ?? root.split(/[\\/]/).pop(), root);
    if (existsSync(standaloneClaude)) plugin.hosts.add("claude");
    if (existsSync(standaloneOpenAI)) plugin.hosts.add("openai");
  }
  if (!marketplaces.length && !plugins.size) {
    error("shared", null, root, "no Claude or OpenAI marketplace or plugin manifest found", "point plugin-inspector at a marketplace repository or plugin directory");
  }

  const validateSkillRoots = (host, plugin, roots) => {
    for (const skillRoot of roots) {
      if (!existsSync(skillRoot) || !statSync(skillRoot).isDirectory()) continue;
      const rootSkill = join(skillRoot, "SKILL.md");
      const entries = existsSync(rootSkill)
        ? [{ name: relative(plugin.base, skillRoot) || plugin.name, path: rootSkill }]
        : readdirSync(skillRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
            .map((entry) => ({ name: entry.name, path: join(skillRoot, entry.name, "SKILL.md") }));
      for (const entry of entries) {
        const skillPath = entry.path;
        const label = `${plugin.name}/skills/${entry.name}`;
        if (!existsSync(skillPath)) {
          error(host, plugin.name, join(skillRoot, entry.name), `${label} is missing SKILL.md`, "add the skill entry file");
          continue;
        }
        const fields = parseFrontmatter(readFileSync(skillPath, "utf8"));
        if (!fields) error(host, plugin.name, skillPath, `${label} has no YAML frontmatter`, "add name and description frontmatter");
        else {
          if (!nonEmptyString(fields.name)) error(host, plugin.name, skillPath, `${label} is missing frontmatter name`, "add the skill name");
          if (!nonEmptyString(fields.description)) error(host, plugin.name, skillPath, `${label} is missing frontmatter description`, "describe when the skill should trigger");
          else if (fields.description.length > 1024) error(host, plugin.name, skillPath, `${label} description exceeds 1024 characters`, "shorten the trigger description");
        }
        plugin.components.skills.add(entry.name);
      }
    }
  };

  const referencedPaths = (host, plugin, base, value, label, defaultPath = null, expected = null) => {
    if (value === undefined || value === null) {
      if (!defaultPath || !existsSync(join(base, defaultPath))) return [];
      return [join(base, defaultPath)];
    }
    const values = Array.isArray(value) ? value : [value];
    const paths = [];
    for (const item of values) {
      if (typeof item !== "string") continue;
      const target = validateRelativePath(host, plugin, base, item, label, expected);
      if (target) paths.push(target);
    }
    return paths;
  };

  const inspectHookConfig = (host, plugin, config, sourcePath) => {
    if (!isObject(config?.hooks)) {
      error(host, plugin.name, sourcePath, "hook configuration must contain a hooks object", "wrap event definitions in { hooks: { ... } }");
      return;
    }
    for (const [event, groups] of Object.entries(config.hooks)) {
      if (!Array.isArray(groups)) {
        error(host, plugin.name, sourcePath, `hook event ${event} must be an array`, "use an array of matcher groups");
        continue;
      }
      for (const group of groups) {
        for (const hook of Array.isArray(group?.hooks) ? group.hooks : []) {
          const type = hook?.type;
          if (!nonEmptyString(type)) {
            error(host, plugin.name, sourcePath, `${event} hook is missing type`, "set the hook type");
            continue;
          }
          if (host === "claude" && !CLAUDE_HOOK_TYPES.has(type)) warn(host, plugin.name, sourcePath, `unknown Claude hook type '${type}'`, "check it against the installed Claude Code version");
          const detail = hook.command ?? hook.url ?? hook.tool ?? hook.prompt ?? type;
          plugin.components.hooks.push({ host, event, type, detail });
          if (type === "command") {
            if (!nonEmptyString(hook.command)) error(host, plugin.name, sourcePath, `${event} command hook is missing command`, "set the executable command");
            const full = [hook.command, ...(Array.isArray(hook.args) ? hook.args : [])].filter(nonEmptyString).join(" ");
            plugin.authority.execution.push({ host, kind: "hook", event, command: full });
            if (downloadsAndExecutesRemote(full)) error(host, plugin.name, sourcePath, `${event} hook downloads and executes remote code`, "vendor and review the script inside the plugin");
            else if (hasUnclassifiedRemoteExecutionShape(full)) error(host, plugin.name, sourcePath, `${event} hook combines a remote fetch and interpreter in an unclassified shell shape`, "rewrite the command for review or vendor the script inside the plugin");
            for (const outside of temporaryAbsolutePaths(full)) {
              error(host, plugin.name, sourcePath, `${event} hook executes a temporary path outside the plugin: ${outside}`, "bundle the executable inside the plugin and reference it through the plugin root");
            }
            if (SECRET.test(full)) error(host, plugin.name, sourcePath, `${event} hook contains a credential-shaped value`, "load secrets from the host environment instead");
            const refs = [...full.matchAll(/\$\{(CLAUDE_PLUGIN_ROOT|PLUGIN_ROOT)\}\/([^\s"']+)/g)];
            for (const match of refs) {
              const target = resolve(plugin.base, match[2]);
              if (!inside(plugin.base, target)) error(host, plugin.name, sourcePath, `${event} hook path escapes the plugin root: ${match[2]}`, "keep hook scripts inside the plugin root");
              else if (!existsSync(target)) error(host, plugin.name, sourcePath, `${event} hook references missing ${match[2]}`, "bundle the referenced script or fix the path");
              if (host === "claude" && match[1] === "PLUGIN_ROOT") warn(host, plugin.name, sourcePath, "Claude hook uses PLUGIN_ROOT instead of CLAUDE_PLUGIN_ROOT", "use the host-documented plugin root variable");
            }
            if (hook.timeout === undefined) warn(host, plugin.name, sourcePath, `${event} command hook has no timeout`, "set a timeout so a hung hook cannot stall the agent");
          } else if (type === "http") {
            plugin.authority.network.push({ host, kind: "hook", event, target: hook.url ?? "unknown" });
            if (!/^https:\/\//.test(hook.url ?? "") && !isLoopbackHttp(hook.url ?? "")) error(host, plugin.name, sourcePath, `${event} HTTP hook must use HTTPS`, "use a TLS-protected endpoint for non-loopback hosts");
          } else if (type === "mcp_tool") {
            plugin.authority.network.push({ host, kind: "mcp-hook", event, target: hook.tool ?? "unknown" });
          }
          if (host === "openai" && type !== "command") {
            warn(host, plugin.name, sourcePath, `OpenAI currently parses but does not run '${type}' hook handlers`, "use a command hook for runtime behavior or treat this as host-specific Claude configuration");
          }
        }
      }
    }
  };

  const inspectHooks = (host, plugin, manifest) => {
    const value = manifest?.hooks;
    const items = value === undefined || value === null
      ? (existsSync(join(plugin.base, "hooks/hooks.json")) ? ["./hooks/hooks.json"] : [])
      : (Array.isArray(value) ? value : [value]);
    for (const item of items) {
      if (isObject(item)) {
        inspectHookConfig(host, plugin, item, plugin.base);
        continue;
      }
      const path = validateRelativePath(host, plugin, plugin.base, item, "hooks", "file");
      if (!path) continue;
      const config = readJson(path, host, plugin.name, "hooks");
      if (config) inspectHookConfig(host, plugin, config, path);
    }
  };

  const normalizeServerMap = (config) => isObject(config?.mcp_servers) ? config.mcp_servers : config;
  const inspectMcpConfig = (host, plugin, config, sourcePath) => {
    const servers = normalizeServerMap(config);
    if (!isObject(servers)) {
      error(host, plugin.name, sourcePath, "MCP configuration must be a server map or mcp_servers wrapper", "use an object keyed by server name");
      return;
    }
    for (const [name, server] of Object.entries(servers)) {
      if (!isObject(server)) {
        error(host, plugin.name, sourcePath, `MCP server '${name}' must be an object`, "define its command or URL");
        continue;
      }
      const detail = server.url ?? [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");
      plugin.components.mcpServers.push({ host, name, detail });
      if (server.url) {
        plugin.authority.network.push({ host, kind: "mcp", name, target: server.url });
        if (!/^https:\/\//.test(server.url) && !isLoopbackHttp(server.url)) error(host, plugin.name, sourcePath, `MCP server '${name}' uses a non-HTTPS URL`, "use HTTPS for remote MCP transport; loopback HTTP is allowed for local development");
      }
      if (server.command) {
        const command = [server.command, ...(Array.isArray(server.args) ? server.args : [])].join(" ");
        plugin.authority.execution.push({ host, kind: "mcp", name, command });
        if (/\bnpx\b/.test(command) && !/@\d+\.\d+\.\d+/.test(command)) warn(host, plugin.name, sourcePath, `MCP server '${name}' runs an unpinned npx package`, "pin an exact package version");
        if (/\buvx\b/.test(command) && !/==\d+\.\d+\.\d+/.test(command)) warn(host, plugin.name, sourcePath, `MCP server '${name}' runs an unpinned uvx package`, "pin an exact package version");
        if (downloadsAndExecutesRemote(command)) error(host, plugin.name, sourcePath, `MCP server '${name}' downloads and executes remote code`, "bundle or pin a reviewed executable");
        else if (hasUnclassifiedRemoteExecutionShape(command)) error(host, plugin.name, sourcePath, `MCP server '${name}' combines a remote fetch and interpreter in an unclassified shell shape`, "rewrite the command for review or bundle a reviewed executable");
      }
      const envText = JSON.stringify(server.env ?? {});
      if (SECRET.test(envText)) error(host, plugin.name, sourcePath, `MCP server '${name}' embeds a credential`, "reference an environment variable instead of storing the secret");
    }
  };

  const inspectMcp = (host, plugin, manifest) => {
    const value = manifest?.mcpServers;
    const items = value === undefined || value === null
      ? (existsSync(join(plugin.base, ".mcp.json")) ? ["./.mcp.json"] : [])
      : (Array.isArray(value) ? value : [value]);
    for (const item of items) {
      if (isObject(item)) {
        inspectMcpConfig(host, plugin, item, plugin.base);
        continue;
      }
      const path = validateRelativePath(host, plugin, plugin.base, item, "mcpServers", "file");
      if (!path) continue;
      const config = readJson(path, host, plugin.name, "MCP configuration");
      if (config) inspectMcpConfig(host, plugin, config, path);
    }
  };

  const inspectApps = (plugin, manifest) => {
    if (manifest?.apps === undefined) return;
    if (isObject(manifest.apps)) {
      const mappings = isObject(manifest.apps.apps) ? manifest.apps.apps : manifest.apps;
      for (const [name, value] of Object.entries(mappings)) {
        const id = typeof value === "string" ? value : value?.id ?? value?.app_id;
        if (!nonEmptyString(id)) error("openai", plugin.name, plugin.base, `app mapping '${name}' has no registered app ID`, "set the plugin_asdk_app... identifier");
        plugin.components.apps.push({ name, id: id ?? "unknown" });
        plugin.authority.network.push({ host: "openai", kind: "app", name, target: id ?? "unknown" });
      }
      return;
    }
    const paths = referencedPaths("openai", plugin, plugin.base, manifest.apps, "apps", null, "file");
    for (const path of paths) {
      const config = readJson(path, "openai", plugin.name, "app mapping");
      if (!isObject(config)) continue;
      const mappings = isObject(config.apps) ? config.apps : config;
      for (const [name, value] of Object.entries(mappings)) {
        const id = typeof value === "string" ? value : value?.id ?? value?.app_id;
        if (!nonEmptyString(id)) error("openai", plugin.name, path, `app mapping '${name}' has no registered app ID`, "set the plugin_asdk_app... identifier");
        plugin.components.apps.push({ name, id: id ?? "unknown" });
        plugin.authority.network.push({ host: "openai", kind: "app", name, target: id ?? "unknown" });
      }
    }
  };

  const inspectAssets = (plugin, manifest) => {
    if (!isObject(manifest?.interface)) return;
    for (const field of Object.keys(manifest.interface)) {
      if (!OPENAI_INTERFACE_FIELDS.has(field)) warn("openai", plugin.name, join(plugin.base, ".codex-plugin", "plugin.json"), `unknown interface field '${field}'`, "check it against the current OpenAI plugin schema");
    }
    const refs = [
      ...["composerIcon", "logo", "logoDark"].map((field) => [field, manifest.interface[field]]),
      ...((Array.isArray(manifest.interface.screenshots) ? manifest.interface.screenshots : []).map((value, index) => [`screenshots[${index}]`, value])),
    ];
    for (const [label, value] of refs) {
      if (value === undefined) continue;
      const path = validateRelativePath("openai", plugin, plugin.base, value, `interface.${label}`, "file");
      if (path) plugin.components.assets.add(relDisplay(plugin.base, path));
    }
  };

  const inspectClaudeExtras = (plugin, manifest) => {
    const host = "claude";
    const collectMarkdown = (value, label, fallback, target) => {
      for (const path of referencedPaths(host, plugin, plugin.base, value, label, fallback)) {
        if (statSync(path).isDirectory()) {
          for (const entry of readdirSync(path)) if (extname(entry) === ".md") target.add(entry);
        } else target.add(relative(plugin.base, path));
      }
    };
    collectMarkdown(manifest?.commands, "commands", "commands", plugin.components.commands);
    collectMarkdown(manifest?.agents, "agents", "agents", plugin.components.agents);
    collectMarkdown(manifest?.workflows, "workflows", "workflows", plugin.components.workflows);
    referencedPaths(host, plugin, plugin.base, manifest?.outputStyles, "outputStyles", "output-styles");

    const inspectLspConfig = (config, sourcePath) => {
      if (!isObject(config)) {
        error(host, plugin.name, sourcePath, "LSP configuration must be an object keyed by server name", "define each LSP server as an object");
        return;
      }
      for (const [name, server] of Object.entries(config)) {
        plugin.components.lspServers.push({ name, command: server?.command ?? "unknown" });
        if (server?.command) plugin.authority.execution.push({ host, kind: "lsp", name, command: [server.command, ...(Array.isArray(server.args) ? server.args : [])].join(" ") });
      }
    };
    const lspValue = manifest?.lspServers;
    const lspItems = lspValue === undefined || lspValue === null
      ? (existsSync(join(plugin.base, ".lsp.json")) ? ["./.lsp.json"] : [])
      : (Array.isArray(lspValue) ? lspValue : [lspValue]);
    for (const item of lspItems) {
      if (isObject(item)) inspectLspConfig(item, plugin.base);
      else {
        const path = validateRelativePath(host, plugin, plugin.base, item, "lspServers", "file");
        if (path) inspectLspConfig(readJson(path, host, plugin.name, "LSP configuration"), path);
      }
    }

    const inspectMonitors = (config, sourcePath) => {
      const monitors = Array.isArray(config) ? config : config?.monitors;
      if (!Array.isArray(monitors)) {
        error(host, plugin.name, sourcePath, "monitor configuration must be an array or monitors wrapper", "use an array of monitor definitions");
        return;
      }
      for (const monitor of monitors) {
        if (!nonEmptyString(monitor?.name) || !nonEmptyString(monitor?.command)) error(host, plugin.name, sourcePath, "monitor requires name and command", "complete the monitor definition");
        plugin.components.monitors.push({ name: monitor?.name ?? "unknown", command: monitor?.command ?? "unknown", when: monitor?.when ?? "always" });
        if (monitor?.command) plugin.authority.execution.push({ host, kind: "monitor", name: monitor.name, command: monitor.command });
      }
    };
    const monitorValue = manifest?.experimental?.monitors;
    const monitorItems = monitorValue === undefined || monitorValue === null
      ? (existsSync(join(plugin.base, "monitors/monitors.json")) ? ["./monitors/monitors.json"] : [])
      : (Array.isArray(monitorValue) && monitorValue.every(isObject) ? [monitorValue] : (Array.isArray(monitorValue) ? monitorValue : [monitorValue]));
    for (const item of monitorItems) {
      if (isObject(item) || Array.isArray(item)) inspectMonitors(item, plugin.base);
      else {
        const path = validateRelativePath(host, plugin, plugin.base, item, "experimental.monitors", "file");
        if (path) inspectMonitors(readJson(path, host, plugin.name, "monitor configuration"), path);
      }
    }

    for (const path of referencedPaths(host, plugin, plugin.base, manifest?.experimental?.themes, "experimental.themes", "themes")) {
      if (statSync(path).isDirectory()) {
        for (const entry of readdirSync(path)) if (extname(entry) === ".json") plugin.components.themes.add(entry);
      } else plugin.components.themes.add(relative(plugin.base, path));
    }

    const userConfig = manifest?.userConfig;
    if (userConfig !== undefined) {
      if (!isObject(userConfig)) error(host, plugin.name, plugin.base, "userConfig must be an object keyed by setting name", "define typed configuration options");
      else for (const [name, option] of Object.entries(userConfig)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) error(host, plugin.name, plugin.base, `userConfig key '${name}' is not an identifier`, "use letters, digits, and underscores");
        if (!isObject(option)) {
          error(host, plugin.name, plugin.base, `userConfig option '${name}' must be an object`, "define its type, title, and description");
          continue;
        }
        if (!["string", "number", "boolean", "directory", "file"].includes(option.type)) error(host, plugin.name, plugin.base, `userConfig option '${name}' has unsupported type '${option.type}'`, "use string, number, boolean, directory, or file");
        if (!nonEmptyString(option.title) || !nonEmptyString(option.description)) warn(host, plugin.name, plugin.base, `userConfig option '${name}' lacks user-facing title or description`, "describe the option in the configuration UI");
        if (option.sensitive !== undefined && typeof option.sensitive !== "boolean") error(host, plugin.name, plugin.base, `userConfig option '${name}' sensitive must be boolean`, "use true or false");
        plugin.components.userConfig.push({ name, type: option.type ?? "unknown", sensitive: option.sensitive === true });
      }
    }

    if (manifest?.channels !== undefined) {
      if (!Array.isArray(manifest.channels)) error(host, plugin.name, plugin.base, "channels must be an array", "define each channel binding as an object");
      else for (const channel of manifest.channels) {
        if (!isObject(channel) || !nonEmptyString(channel.server)) {
          error(host, plugin.name, plugin.base, "channel requires an MCP server name", "set channel.server to a declared MCP server");
          continue;
        }
        const declared = plugin.components.mcpServers.some((server) => server.name === channel.server);
        if (!declared) warn(host, plugin.name, plugin.base, `channel references undeclared MCP server '${channel.server}'`, "declare the server in mcpServers or correct the binding");
        plugin.components.channels.push({ server: channel.server });
        plugin.authority.network.push({ host, kind: "channel", target: channel.server });
      }
    }
    for (const dependency of Array.isArray(manifest?.dependencies) ? manifest.dependencies : []) {
      const name = typeof dependency === "string" ? dependency : dependency?.name;
      const version = typeof dependency === "object" ? dependency?.version : null;
      if (!nonEmptyString(name)) error(host, plugin.name, plugin.base, "plugin dependency is missing name", "set the dependency plugin name");
      if (!version || !EXACT_VERSION.test(version)) warn(host, plugin.name, plugin.base, `plugin dependency '${name ?? "unknown"}' is not pinned to an exact version`, "pin an exact compatible version");
      plugin.components.dependencies.push({ name: name ?? "unknown", version: version ?? "unbounded" });
      plugin.authority.install.push({ host, source: `plugin:${name ?? "unknown"}@${version ?? "unbounded"}` });
    }
    const settingsPath = join(plugin.base, "settings.json");
    if (existsSync(settingsPath)) {
      const settings = readJson(settingsPath, host, plugin.name, "plugin settings");
      if (isObject(settings)) for (const key of Object.keys(settings)) if (!["agent", "subagentStatusLine"].includes(key)) warn(host, plugin.name, settingsPath, `unsupported plugin settings key '${key}'`, "remove it or move it to user/project settings");
    }
    const binDir = join(plugin.base, "bin");
    if (existsSync(binDir) && statSync(binDir).isDirectory()) {
      for (const entry of readdirSync(binDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const path = join(binDir, entry.name);
        plugin.components.executables.add(entry.name);
        plugin.authority.execution.push({ host, kind: "bin", command: entry.name });
        if (!(statSync(path).mode & 0o111)) warn(host, plugin.name, path, `bin/${entry.name} is not executable`, "set the executable bit before publishing");
      }
    }
  };

  const validateManifest = (host, plugin) => {
    const manifestPath = join(plugin.base, host === "claude" ? ".claude-plugin" : ".codex-plugin", "plugin.json");
    const manifestPresent = existsSync(manifestPath);
    if (!manifestPresent) {
      if (host === "openai") error(host, plugin.name, manifestPath, "OpenAI plugin requires .codex-plugin/plugin.json", "add the required manifest");
    }
    const manifest = manifestPresent ? readJson(manifestPath, host, plugin.name, "plugin manifest") : {};
    if (!isObject(manifest)) return {};
    const allowed = host === "claude" ? CLAUDE_MANIFEST_FIELDS : OPENAI_MANIFEST_FIELDS;
    for (const field of Object.keys(manifest)) if (!allowed.has(field)) warn(host, plugin.name, manifestPath, `unknown manifest field '${field}'`, "check it against the current host schema");
    if (manifestPresent && (!nonEmptyString(manifest.name) || !KEBAB.test(manifest.name))) error(host, plugin.name, manifestPath, "manifest name must be non-empty kebab-case", "set the plugin identifier");
    else if (manifest.name && manifest.name !== plugin.name) {
      const message = `manifest name '${manifest.name}' does not match marketplace name '${plugin.name}'`;
      if (host === "claude") warn(host, plugin.name, manifestPath, message, "confirm the public marketplace identifier is intentional");
      else error(host, plugin.name, manifestPath, message, "use the same stable identifier");
    }
    if (manifest.version !== undefined && !SEMVER.test(manifest.version)) error(host, plugin.name, manifestPath, `version '${manifest.version}' is not semantic versioning`, "use a version such as 1.2.0");
    if (host === "claude" && manifest.defaultEnabled !== undefined && typeof manifest.defaultEnabled !== "boolean") error(host, plugin.name, manifestPath, "defaultEnabled must be boolean", "use true or false");
    if (host === "claude" && manifest.experimental !== undefined && !isObject(manifest.experimental)) error(host, plugin.name, manifestPath, "experimental must be an object", "place monitors and themes under an object");
    else if (host === "claude" && isObject(manifest.experimental)) for (const field of Object.keys(manifest.experimental)) if (!["monitors", "themes"].includes(field)) warn(host, plugin.name, manifestPath, `unknown experimental field '${field}'`, "check it against the current Claude Code plugin schema");
    if (host === "claude" && plugin.claudeMarketplaceVersion && manifest.version && plugin.claudeMarketplaceVersion !== manifest.version) {
      warn(host, plugin.name, manifestPath, `marketplace version ${plugin.claudeMarketplaceVersion} differs from plugin.json ${manifest.version}; plugin.json wins`, "remove the duplicate marketplace version or keep both values synchronized");
    }
    if (manifestPresent && !manifest.version) warn(host, plugin.name, manifestPath, "plugin has no version, so hosts fall back to source revisions", "set an explicit semver when you want controlled releases");
    if (host === "openai" && !nonEmptyString(manifest.description)) warn(host, plugin.name, manifestPath, "published OpenAI plugin has no description", "add install-surface copy");

    const defaultSkillRoots = [];
    if (existsSync(join(plugin.base, "skills"))) defaultSkillRoots.push(join(plugin.base, "skills"));
    if (host === "claude" && existsSync(join(plugin.base, "SKILL.md"))) defaultSkillRoots.push(plugin.base);
    const customSkillRoots = manifest.skills === undefined
      ? []
      : referencedPaths(host, plugin, plugin.base, manifest.skills, "skills", null, "dir");
    const skillRoots = host === "claude"
      ? [...new Set([...defaultSkillRoots, ...customSkillRoots])]
      : (manifest.skills === undefined ? defaultSkillRoots : customSkillRoots);
    validateSkillRoots(host, plugin, skillRoots);
    inspectHooks(host, plugin, manifest);
    inspectMcp(host, plugin, manifest);
    if (host === "openai") {
      inspectApps(plugin, manifest);
      inspectAssets(plugin, manifest);
    } else inspectClaudeExtras(plugin, manifest);
    return manifest;
  };

  for (const plugin of plugins.values()) {
    if (!plugin.base || !existsSync(plugin.base)) continue;
    if (!inside(root, plugin.base)) {
      error("shared", plugin.name, plugin.base, "plugin directory escapes the inspected root", "keep local plugins inside the marketplace");
      continue;
    }
    for (const nested of ["skills", "commands", "agents", "hooks", "assets"] ) {
      for (const meta of [".claude-plugin", ".codex-plugin"]) {
        const bad = join(plugin.base, meta, nested);
        if (existsSync(bad)) error(meta === ".claude-plugin" ? "claude" : "openai", plugin.name, bad, `${nested}/ is nested inside ${meta}`, `move ${nested}/ to the plugin root`);
      }
    }
    for (const host of plugin.hosts) validateManifest(host, plugin);
    if (!existsSync(join(plugin.base, "README.md"))) warn("shared", plugin.name, plugin.base, "plugin has no README.md", "document installation, behavior, and limits");
  }

  const summaries = [...plugins.values()].map((plugin) => ({
    name: plugin.name,
    path: plugin.base ? relDisplay(root, plugin.base) : null,
    hosts: [...plugin.hosts].sort(),
    sources: plugin.sources,
    components: {
      skills: [...plugin.components.skills].sort(),
      commands: [...plugin.components.commands].sort(),
      agents: [...plugin.components.agents].sort(),
      hooks: plugin.components.hooks,
      mcpServers: plugin.components.mcpServers,
      apps: plugin.components.apps,
      lspServers: plugin.components.lspServers,
      monitors: plugin.components.monitors,
      workflows: [...plugin.components.workflows].sort(),
      themes: [...plugin.components.themes].sort(),
      channels: plugin.components.channels,
      userConfig: plugin.components.userConfig,
      executables: [...plugin.components.executables].sort(),
      dependencies: plugin.components.dependencies,
      assets: [...plugin.components.assets].sort(),
    },
    authority: plugin.authority,
  })).sort((a, b) => a.name.localeCompare(b.name));

  const evaluation = { skills: 0, cases: 0, categories: ["direct", "indirect", "incomplete", "negative", "edge"] };
  const evalPath = join(root, "evals", "skill-evals.json");
  if (existsSync(evalPath)) {
    const document = readJson(evalPath, "shared", null, "skill evaluation corpus");
    const suites = document?.skills;
    if (!Array.isArray(suites)) {
      error("shared", null, evalPath, "skill evaluation corpus must contain a skills array", "add one suite per discovered skill");
    } else {
      const expected = new Map();
      for (const plugin of summaries) {
        for (const skill of plugin.components.skills) expected.set(`${plugin.name}/${skill}`, false);
      }
      for (const suite of suites) {
        const key = `${suite?.plugin}/${suite?.skill}`;
        if (!expected.has(key)) {
          error("shared", suite?.plugin, evalPath, `evaluation suite references unknown skill '${key}'`, "match a skill discovered from a plugin manifest");
          continue;
        }
        if (expected.get(key)) {
          error("shared", suite.plugin, evalPath, `duplicate evaluation suite for '${key}'`, "keep one suite per skill");
          continue;
        }
        expected.set(key, true);
        evaluation.skills++;
        const categories = new Set();
        for (const item of Array.isArray(suite.cases) ? suite.cases : []) {
          if (!evaluation.categories.includes(item?.category)) {
            error("shared", suite.plugin, evalPath, `${key} has unknown evaluation category '${item?.category}'`, `use ${evaluation.categories.join(", ")}`);
          } else categories.add(item.category);
          const expected = Array.isArray(item?.expected) ? item.expected : [item?.expected];
          if (!nonEmptyString(item?.prompt) || !expected.length || expected.some((criterion) => !nonEmptyString(criterion))) {
            error("shared", suite.plugin, evalPath, `${key} evaluation cases need a non-empty prompt and observable expected criteria`, "state the request and split compound outcomes into pass/fail strings");
          }
          evaluation.cases++;
        }
        for (const category of evaluation.categories) {
          if (!categories.has(category)) error("shared", suite.plugin, evalPath, `${key} lacks a '${category}' activation case`, "cover direct, indirect, incomplete, negative, and edge behavior");
        }
      }
      for (const [key, found] of expected) {
        if (!found) error("shared", key.split("/")[0], evalPath, `no evaluation suite for '${key}'`, "add five host-neutral activation cases for this skill");
      }
    }
  }

  const errors = findings.filter((finding) => finding.severity === "error");
  const warnings = findings.filter((finding) => finding.severity === "warn");
  return { root, marketplaces, plugins: summaries, evaluation, findings, errors, warnings };
}

export function formatReport(result) {
  const uniqueBy = (items, key) => [...new Map(items.map((item) => [key(item), item])).values()];
  const out = [];
  for (const finding of result.findings) {
    const label = finding.severity === "error" ? "FAIL" : "warn";
    const scope = [finding.host, finding.plugin].filter(Boolean).join("/");
    out.push(`  ${label.padEnd(4)}  ${scope}${finding.file ? `  ${finding.file}` : ""}`);
    out.push(`        ${finding.issue}`);
    if (finding.fix) out.push(`        fix: ${finding.fix}`);
  }
  if (result.findings.length) out.push("");
  out.push("Authority inventory");
  for (const plugin of result.plugins) {
    const c = plugin.components;
    const hookDefinitions = uniqueBy(c.hooks, (item) => `${item.event}\0${item.type}\0${item.detail}`);
    const executions = uniqueBy(plugin.authority.execution, (item) => `${item.kind}\0${item.event ?? item.name ?? ""}\0${item.command}`);
    const networks = uniqueBy(plugin.authority.network, (item) => `${item.kind}\0${item.name ?? item.event ?? ""}\0${item.target}`);
    const installs = uniqueBy(plugin.authority.install, (item) => item.source);
    const componentParts = [
      c.skills.length && `${c.skills.length} skill${c.skills.length === 1 ? "" : "s"}`,
      hookDefinitions.length && `${hookDefinitions.length} hook${hookDefinitions.length === 1 ? "" : "s"}`,
      c.mcpServers.length && `${c.mcpServers.length} MCP server${c.mcpServers.length === 1 ? "" : "s"}`,
      c.apps.length && `${c.apps.length} app${c.apps.length === 1 ? "" : "s"}`,
      c.agents.length && `${c.agents.length} agent${c.agents.length === 1 ? "" : "s"}`,
      c.workflows.length && `${c.workflows.length} workflow${c.workflows.length === 1 ? "" : "s"}`,
      c.themes.length && `${c.themes.length} theme${c.themes.length === 1 ? "" : "s"}`,
      c.channels.length && `${c.channels.length} channel${c.channels.length === 1 ? "" : "s"}`,
      c.userConfig.length && `${c.userConfig.length} user setting${c.userConfig.length === 1 ? "" : "s"}`,
      c.monitors.length && `${c.monitors.length} monitor${c.monitors.length === 1 ? "" : "s"}`,
      c.executables.length && `${c.executables.length} executable${c.executables.length === 1 ? "" : "s"}`,
    ].filter(Boolean);
    out.push(`  ${plugin.name} [${plugin.hosts.join(", ") || "external"}]`);
    out.push(`    loads: ${componentParts.join(", ") || "metadata only"}`);
    out.push(`    executes: ${executions.length ? executions.map((item) => `${item.kind}:${item.event ?? item.name ?? item.command}`).join(", ") : "nothing automatically"}`);
    out.push(`    connects: ${networks.length ? networks.map((item) => `${item.kind}:${item.target}`).join(", ") : "no declared network service"}`);
    out.push(`    installs: ${installs.length ? installs.map((item) => item.source).join(", ") : "no declared dependency source"}`);
  }
  out.push("");
  if (result.evaluation.cases) {
    out.push(`Skill evaluations: ${result.evaluation.cases} cases across ${result.evaluation.skills} skill(s)`);
  }
  out.push(`${result.plugins.length} plugin(s), ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
  return out.join("\n") + "\n";
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (cause) {
    process.stderr.write(`plugin-inspector: ${cause.message}\n${usage()}`);
    process.exit(64);
  }
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const result = inspectRepository(options.root);
  if (options.json) {
    process.stdout.write(JSON.stringify({
      marketplaces: result.marketplaces,
      plugins: result.plugins,
      evaluation: result.evaluation,
      findings: result.findings,
      summary: { plugins: result.plugins.length, errors: result.errors.length, warnings: result.warnings.length },
    }, null, 2) + "\n");
  } else process.stdout.write(formatReport(result));
  process.exit(result.errors.length || (options.strict && result.warnings.length) ? 1 : 0);
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : null;
if (invoked === fileURLToPath(import.meta.url)) main();
