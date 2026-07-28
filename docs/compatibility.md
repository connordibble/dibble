# Compatibility

dibble is the engineering contract that travels between coding agents. Skills
carry working context across hosts; scripts and hooks keep deterministic rules
consistent across the agent, local CLI, and CI.

Every plugin's knowledge is a portable
[Agent Skill](https://agentskills.io): plain Markdown plus zero-dependency Node
scripts. CLI entry points are host-neutral. Hook entry points intentionally
read and write the lifecycle APIs supported by Claude Code and Codex. Copy any
`skills/<name>/` directory into another tool's skills location and its
knowledge and direct CLI still work, because [32+ tools read the same SKILL.md format](https://code.claude.com/docs/en/skills):
Codex CLI, Cursor, Gemini CLI, and others.

**What now travels through Codex** is a separate Codex marketplace sidecar:
`.agents/plugins/marketplace.json` plus one `.codex-plugin/plugin.json` per
plugin. Those Codex manifests point at the existing portable `skills/`
directories and use source paths such as `./plugins/design-verify`, so Codex
can install the plugin instead of only rendering the Claude marketplace card.

**Bundled hooks travel to Codex too.** Codex discovers a plugin's
`hooks/hooks.json`, supports PreToolUse/PostToolUse for Bash and `apply_patch`,
and provides `CLAUDE_PLUGIN_ROOT` for compatibility. Non-managed command hooks
do not run merely because the plugin is installed or enabled: Codex shows the
exact definition for review and skips it until the user trusts its current
hash. tokenlock's matcher covers `apply_patch` alongside Claude's `Write` and
`Edit`, and its hook reads both hosts' documented payload fields. Slash commands
remain Claude-only; Cursor and Gemini CLI run the skills and CLIs but not the
bundled hook layer.

| Plugin | Skill (portable) | Codex plugin | CLI script | Bundled hook (review required) | Claude command | CI usable |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| [tokenlock](../plugins/tokenlock) | ✅ | ✅ | ✅ | ✅ PostToolUse | n/a | ✅ |
| [token-drift](../plugins/token-drift) | ✅ | ✅ | ✅ | n/a | n/a | ✅ |
| [install-gate](../plugins/install-gate) | ✅ | ✅ | ✅ | ✅ PreToolUse | n/a | ✅ |
| [agent-audit](../plugins/agent-audit) | ✅ | ✅ | ✅ | n/a | ✅ `/agent-audit:audit` | ✅ |
| [design-verify](../plugins/design-verify) | ✅ | ✅ | ✅ (linter half) | n/a | ✅ `/design-verify:verify` | ✅ (linter) |
| [plugin-inspector](../plugins/plugin-inspector) | ✅ | ✅ | ✅ | n/a | ✅ `/plugin-inspector:inspect` | ✅ |
| [receipts](../plugins/receipts) | ✅ | ✅ | ✅ | n/a | n/a | ✅ |
| [zod-first-tools](../plugins/zod-first-tools) | ✅ | ✅ | ✅ | n/a | n/a | ✅ |
| [no-slop](../plugins/no-slop) | ✅ | ✅ | ✅ | n/a | n/a | ✅ |
| [readme-that-sells](../plugins/readme-that-sells) | ✅ | ✅ | ✅ | n/a | n/a | ✅ |
| [tailwind-v4-tokens](../plugins/tailwind-v4-tokens) | ✅ | ✅ | n/a (knowledge only) | n/a | n/a | n/a |

## What this means in practice

**On Codex:** add or upgrade the `connordibble/dibble` marketplace with Codex's
`codex plugin marketplace` command, then install from the Codex plugin browser.
The Codex sidecar exposes the portable skills and keeps every plugin source
path under `./plugins/<name>`.

**On Codex:** enable tokenlock or install-gate, open `/hooks`, review the bundled
command, and trust it before expecting enforcement. Codex records trust against
the definition hash, so an updated hook requires review again. Repository
fixtures cover the payload and output shapes in the documented Codex contract;
an interactive end-to-end hook firing remains an explicit release check. All
11 plugins have also passed the current Codex desktop CLI's live marketplace parser and installer;
the remaining interactive hook and Plugins Directory checks are tracked in
[HANDOFF.md](../HANDOFF.md).

**On Cursor or Gemini CLI:** every skill's knowledge applies and every CLI
script runs the same way (`node skills/<name>/scripts/<script>.mjs ...`, or via
`npx dibble <name> ...`), but there is no automatic hook layer. tokenlock and
install-gate won't intercept a tool call on their own there; run the checker
explicitly, or in CI.

**In CI, on any platform:** every checker is a deterministic script with
sensible exit codes (0 clean, 1 or 2 on findings) and most support `--json`.
This is the layer that doesn't care what agent (or human) wrote the code;
see each plugin's README for the exact command.

**Design-verify is a partial exception:** the responsive-smell linter
(`responsive-smells.mjs`) is a portable static check. The screenshot-loop
half of the workflow needs a browser surface in the host, such as Codex browser
or computer tools, Claude Code's Chrome or Desktop integration, or a browser
MCP such as Playwright. That part is host-dependent regardless of vendor.
