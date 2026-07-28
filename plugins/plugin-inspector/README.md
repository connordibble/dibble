# plugin-inspector

**A plugin can contain instructions, shell hooks, MCP servers, registered apps,
background monitors, and executables. This shows the whole package before you
ship or install it.**

plugin-inspector validates Claude Code and ChatGPT/Codex plugins, then prints an
authority inventory: what each plugin loads, what can execute locally, and what
can connect to an external service.

```text
$ npx dibble plugin-inspector .

Authority inventory
  install-gate [claude, openai]
    loads: 1 skill, 1 hook
    executes: hook:PreToolUse
    connects: no declared network service
    installs: local:./install-gate, local:./plugins/install-gate

11 plugin(s), 0 error(s), 0 warning(s)
```

## Install

Claude Code:

```text
/plugin marketplace add connordibble/dibble
/plugin install plugin-inspector@dibble
```

Then run `/plugin-inspector:inspect` or ask Claude to inspect a plugin.

Codex and CI:

```bash
codex plugin marketplace add connordibble/dibble
npx dibble plugin-inspector .
```

Use `--json` for tooling and `--strict` to fail on warnings. The previous
`validate-marketplace` and `validate-codex` subcommands remain aliases.

## One report covers both plugin models

The inspector auto-detects both marketplace and standalone-plugin layouts. It
checks:

- Claude and OpenAI marketplace names, policies, and local/Git/npm sources
- host-specific manifest fields without treating future fields as fatal
- component paths, path escapes, missing files, and misplaced directories
- skill frontmatter and trigger descriptions
- command, HTTP, MCP-tool, prompt, and agent hook definitions
- bundled MCP servers, registered app mappings, LSP servers, workflows, themes,
  monitors, channels, user configuration, plugin dependencies, `bin/`
  executables, settings, and install-surface assets
- inline credentials, non-HTTPS endpoints, remote-download execution, mutable
  Git refs, package ranges, unpinned `npx`/`uvx`, and hooks without timeouts

Shared definitions are counted once in the human report even when both hosts
load them. JSON output retains host-specific entries for automation.

Unknown fields warn rather than fail. Plugin schemas move; a validator that
rejects every new host field becomes a source of breakage itself.

## Structure passing is not a trust verdict

The authority inventory is the second half of the result. It distinguishes a
skills-only plugin from one that starts a monitor, adds a shell hook, or reaches
an authenticated service. Review the referenced code and runtime permissions
before trusting those capabilities.

Codex loads enabled plugin hooks but skips non-managed command hooks until the
user reviews and trusts their current definition. Claude Code and Codex also
apply their own sandbox, approval, workspace, and authentication controls;
plugin-inspector does not replace them.

## Dogfooded

dibble runs plugin-inspector against its own dual-host catalog in CI. The same
command validates both marketplace files and every local plugin manifest.

Part of the [dibble](../../README.md) catalog. MIT.
