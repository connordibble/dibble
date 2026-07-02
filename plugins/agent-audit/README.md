# agent-audit

**A malicious npm package can add a hook to your agent that re-runs on every
session. Would you notice?**

agent-audit is a read-only scanner for the configuration your coding agent
trusts: hooks, permission grants, MCP server definitions, and the file
permissions on the configs themselves. Every check maps to a documented
attack pattern, not a vibe.

```
$ /agent-audit

  CRIT  ~/.claude.json (mcp server "notes")
        MCP endpoint over plaintext http: http://mcp.example.com/sse
        fix: anything this server is sent (code, tokens) crosses the network unencrypted; use https

  warn  ~/.claude/settings.json
        blanket shell approval in allow list: "Bash"
        fix: replace with specific command patterns like Bash(pnpm test:*)

  info  ~/.claude/settings.json (SessionStart hook)
        runs on every session start: node ~/.dotfiles/agent/bootstrap.mjs
        fix: SessionStart is the re-execution vector malware uses; confirm you added this yourself

  1 critical, 1 warning, 1 informational.
```

## Install

```
/plugin marketplace add connordibble/dibble
/plugin install agent-audit@dibble
```

Then run `/agent-audit`, or just ask to "audit my agent setup."

## What it checks

| Area              | Critical                                              | Warn                                        |
| ----------------- | ----------------------------------------------------- | ------------------------------------------- |
| Hooks             | `curl\|bash`, base64 payloads, world-writable scripts | temp-dir execution, giant inline scripts    |
| Permissions       | `bypassPermissions` as default                        | blanket `Bash`, pre-approved `rm -rf`/pipes |
| MCP servers       | plaintext http endpoints, binaries from `/tmp`        | inline credentials in `env`                 |
| Config integrity  | world-writable `~/.claude.json` or settings files     | —                                           |

Informational findings (SessionStart hooks, registered marketplaces, unpinned
`npx` servers) are inventory you confirm, not accusations. The tool presents
them as "did you add this?" because the scanner can't know.

## Design principles

- **Read-only, always.** It reports and suggests fixes; it never edits your
  config. An audit tool that writes to the files it's inspecting is its own
  risk.
- **Every finding maps to a known attack.** No cargo-cult rules. The
  informational tier exists precisely so legitimate-but-scary patterns
  (SessionStart hooks are popular *and* the persistence vector) aren't cried
  wolf as critical.
- **Findings over category.** Exit codes (2 critical / 1 warn / 0 clean) and
  `--json` make it a CI check for anyone tracking agent config in dotfiles.

## Honest limits

It reads configuration, not code. It won't catch a malicious MCP server
behind a clean https URL, a package that hasn't modified the config yet, or a
reviewed hook script that later turned hostile. It's one layer: pair it with
version pinning and reading hook scripts before you add them. See
[install-gate](../install-gate) for the package-install layer.

Part of the [dibble](../../README.md) catalog. MIT.
