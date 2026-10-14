---
name: audit
description: Security hygiene audit for the user's coding-agent configuration - hooks, permissions, MCP servers, and config file integrity. Use when asked to audit, review, or health-check a Claude Code or Codex setup, after installing plugins or MCP servers from unfamiliar sources, when the user mentions agent supply-chain attacks or compromised packages, when something about the agent's behavior seems off, or as periodic hygiene. Read-only; reports findings with fixes but changes nothing.
---

# Auditing an agent configuration

Coding agents are configured by files that other software can write:
Claude settings, Codex `config.toml`/`hooks.json`, and MCP server lists. The
documented attacks all route through them. A malicious npm package that adds a
SessionStart hook re-executes on every session; a rewritten MCP entry
reroutes authenticated traffic to attacker infrastructure. This skill runs a
read-only scanner over those files and helps the user act on what it finds.

## Running it

```bash
node <this-skill-directory>/scripts/audit.mjs           # audit ~ and current project
node <this-skill-directory>/scripts/audit.mjs --json    # machine-readable
```

Exit 2 means critical findings, 1 warnings only, 0 clean. The scanner never
modifies anything; fixes are the user's call.

## What each severity means

- **CRIT**: a pattern with a known exploit path: hooks piping downloads into
  interpreters, obfuscated payloads, world-writable hook scripts or config
  files, plaintext MCP endpoints, `http` hooks posting to a remote host over
  plaintext, invisible Unicode in a `prompt` or `agent` hook, an `agent` hook
  told to pipe a download into a shell, Claude `bypassPermissions`, or Codex
  `danger-full-access` combined with `approval_policy = "never"`.
  Treat like a failing security control: resolve or consciously accept, today.
- **warn**: weakens the security posture without being an exploit by itself:
  blanket `Bash` approvals, pre-approved dangerous patterns, inline
  credentials in config or in hook URLs, headers, and inputs, execution from
  temp directories, a plugin `bin/` that shadows common commands such as
  `git` or `node`, `http` hooks that send every payload to a remote host,
  encoded blobs in hook prompts, and `prompt` or `agent` hooks on
  `PreToolUse` or `PermissionRequest` that tell the model to always approve.
- **info**: inventory the user must judge, because the scanner can't:
  hooks on lifecycle events that fire without a tool call (`SessionStart`,
  `Setup`, `ConfigChange`, `FileChanged`, `WorktreeCreate`, compaction, model
  switches, and the rest; legitimate and popular, also the persistence
  vector), `mcp_tool` and `agent` hooks, `http` hooks to local services,
  hook handlers the scanner could not parse, registered marketplaces,
  background monitors and `bin/` executables that installed plugins ship, and
  unpinned `npx` servers. Present these as
  "confirm you added this yourself," not as accusations.

## Acting on findings

Walk critical findings one at a time with the user; don't batch-fix. For each:

1. Show the exact config lines the finding points at.
2. Ask whether they recognize it. A hook they wrote last month is fine even
   if it looks scary; one they can't place is the actual signal.
3. Apply the `fix:` line from the report only after they confirm. For
   anything unrecognized, the safe sequence is: remove the entry, rotate any
   credentials that config had access to, then investigate how it got there
   (recently installed packages, plugins, and dotfile syncs are the usual
   suspects).

Never auto-delete an unrecognized hook silently. If it *is* an active
compromise, how it got there matters more than removing it fast.

## What this audit cannot see

Installed plugins are covered: every version on disk under
`~/.claude/plugins` and `~/.codex/plugins/cache` gets the same hook, MCP, and
permission checks, with findings labeled by plugin. A version marked for
cleanup (`.orphaned_at`) is skipped.

Say so when reporting: it reads configuration, not code. It won't catch a
hostile script body behind a plain plugin hook command, instructions hidden
in a plugin's skills or agents, a malicious MCP server behind a clean https
URL, a compromised package that hasn't touched the config yet, or a hook script that turned hostile after
review. Pair it with version pinning, reading hook scripts before adding
them, and installing plugins from marketplaces you can name the maintainer of.

Good cadence: after adding any marketplace, plugin, or MCP server; after any
npm supply-chain incident makes the news; and in dotfiles CI (`--json`) if
the user tracks their agent config in a dotfiles repo.
