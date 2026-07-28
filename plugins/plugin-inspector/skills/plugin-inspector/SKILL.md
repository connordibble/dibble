---
name: plugin-inspector
description: Inspect, validate, and explain Claude Code and ChatGPT/Codex plugins and marketplaces. Use when creating or publishing a plugin, debugging why one will not load, reviewing plugin authority before install, checking manifests, hooks, skills, MCP servers, app mappings, LSP servers, monitors, assets, dependencies, or marketplace sources, or when a plugin-inspector report flags a problem.
---

# Inspect the package and its authority

A plugin is more than its instructions. Depending on the host, installing one
can add hooks, executable commands, MCP servers, registered apps, agents, LSP
servers, background monitors, and dependencies. Validate the package and show
that authority before calling it ready.

## Run the inspector first

```bash
node <this-skill-directory>/scripts/inspect.mjs .
node <this-skill-directory>/scripts/inspect.mjs . --json
node <this-skill-directory>/scripts/inspect.mjs . --strict
```

Point it at a marketplace repository or one standalone plugin. It auto-detects:

- Claude marketplaces at `.claude-plugin/marketplace.json`
- OpenAI marketplaces at `.agents/plugins/marketplace.json`
- Claude manifests at `.claude-plugin/plugin.json`
- ChatGPT/Codex manifests at `.codex-plugin/plugin.json`

Errors fail with exit 1. Warnings pass unless `--strict` is set. Unknown fields
warn rather than fail because both hosts add plugin capabilities over time.

## Read the report in two passes

Fix structural failures first. These are conditions the host cannot load
safely or predictably: invalid JSON, missing manifests, paths outside the
plugin, missing component files, insecure remote transports, or malformed
marketplace sources.

Then read the authority inventory. For each plugin it lists what loads, what
can execute locally, and what can connect to a network service. A clean
structural report does not make a hook or MCP server trustworthy; it makes the
authority visible enough to review.

## Keep the two host formats distinct

Claude Code and ChatGPT/Codex share skills, hooks, MCP configuration, and many
marketplace source shapes. Their full plugin models are not identical.

Claude Code currently supports skills, commands, agents, workflows, hooks, MCP
servers, LSP servers, output styles, themes, monitors, channels, typed user
configuration, `bin/` executables, settings, and plugin dependencies. Its
manifest is optional when default component paths are enough. If a marketplace
and `plugin.json` declare different versions, `plugin.json` wins; treat that
duplication as drift, not a loader failure.

ChatGPT/Codex requires `.codex-plugin/plugin.json`. It can bundle skills,
hooks, MCP servers, registered app mappings, and install-surface assets. Public
plugins use one directory shared by ChatGPT and Codex; repo and personal
marketplaces remain separate distribution sources.

Do not force one host's fields into the other manifest. Shared component files
are fine when their runtime contract is actually compatible.

## Review code execution deliberately

Inspect every command shown under `executes`:

1. Open the referenced hook, MCP, monitor, LSP, or `bin/` script.
2. Confirm the plugin bundles it and does not download code at runtime.
3. Pin package-backed commands such as `npx` or `uvx` to exact versions.
4. Confirm timeouts on command hooks.
5. Check whether it runs automatically or only after direct invocation.

Codex requires users to review and trust non-managed command hooks. A changed
hook hash requires review again. `PLUGIN_ROOT` is the native Codex variable;
Codex also provides `CLAUDE_PLUGIN_ROOT` for compatible shared hooks. Do not
describe an installed hook as active until the user has trusted it.

Claude Code supports command, HTTP, MCP-tool, prompt, and agent hook handlers.
Codex currently runs command handlers; it parses prompt and agent handlers but
skips them. Keep host-specific behavior explicit in documentation.

## Review network authority separately

For each app, remote MCP server, or HTTP hook:

- require HTTPS
- keep credentials out of committed JSON
- verify the named service and publisher
- request the smallest practical scopes
- distinguish read tools from write or destructive tools
- retain host confirmation for irreversible actions

The inspector can prove what the package declares. It cannot inspect a remote
server's implementation, OAuth scopes granted at runtime, workspace policy, or
the behavior of code fetched after installation.

## Marketplace sources should be reproducible

Local paths must start with `./` and stay under the marketplace root. GitHub,
Git URL, Git-subdirectory, and npm sources are supported by current hosts.
Prefer an exact Git SHA or package version. Branches, tags such as `latest`,
and semver ranges are valid distribution choices but produce mutable installs,
so the inspector reports them as warnings.

## Before publishing

Run the inspector against the packed or checked-out artifact, not only the
source tree. Then test the real install path in each claimed host:

1. add or refresh the marketplace
2. install and enable the plugin
3. start a new session where the host requires it
4. invoke each skill and executable component
5. review and trust hooks, then trigger them with a low-risk action
6. connect each MCP server or app with least-privilege access
7. confirm the install-surface copy and assets render

The deterministic report belongs in CI. The live install remains a release
check because caches, trust state, workspace policy, and authentication do not
exist in a repository fixture.
