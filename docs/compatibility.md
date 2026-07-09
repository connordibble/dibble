# Compatibility

Every plugin's knowledge (the `SKILL.md` files and the scripts they call) is a
portable [Agent Skill](https://agentskills.io): plain Markdown plus
zero-dependency Node scripts, no Claude Code APIs. Copy any `skills/<name>/`
directory into another tool's skills location and the knowledge and the
checker both work, because [32+ tools read the same SKILL.md format](https://code.claude.com/docs/en/skills):
Codex CLI, Cursor, Gemini CLI, and others.

**What now travels through Codex** is a separate Codex marketplace sidecar:
`.agents/plugins/marketplace.json` plus one `.codex-plugin/plugin.json` per
plugin. Those Codex manifests point at the existing portable `skills/`
directories and use source paths such as `./plugins/design-verify`, so Codex
can install the plugin instead of only rendering the Claude marketplace card.

**Automatic hooks now travel to Codex too.** Codex supports the same
PreToolUse/PostToolUse hook events as Claude Code, auto-discovers a plugin's
bundled `hooks/hooks.json`, and honors `CLAUDE_PLUGIN_ROOT` for compatibility,
so tokenlock and install-gate enforce automatically on both. tokenlock's
matcher covers Codex's `apply_patch` tool alongside Claude's `Write`/`Edit`, and
its hook reads the file path from either payload shape. What stays Claude-only
is slash commands; Cursor and Gemini CLI run the skills and CLIs but not the
automatic hooks.

| Plugin | Skill (portable) | Codex plugin | CLI script | Auto hook (Claude + Codex) | Claude command | CI usable |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| [tokenlock](../plugins/tokenlock) | ✅ | ✅ | ✅ | ✅ PostToolUse | n/a | ✅ |
| [token-drift](../plugins/token-drift) | ✅ | ✅ | ✅ | n/a | n/a | ✅ |
| [install-gate](../plugins/install-gate) | ✅ | ✅ | ✅ | ✅ PreToolUse | n/a | ✅ |
| [agent-audit](../plugins/agent-audit) | ✅ | ✅ | ✅ | n/a | ✅ `/agent-audit:audit` | ✅ |
| [design-verify](../plugins/design-verify) | ✅ | ✅ | ✅ (linter half) | n/a | ✅ `/design-verify:verify` | ✅ (linter) |
| [marketplace-kit](../plugins/marketplace-kit) | ✅ | ✅ | ✅ | n/a | ✅ `/marketplace-kit:validate` | ✅ |
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

**On Codex:** the hooks fire automatically once the plugin is installed, so
tokenlock and install-gate intercept edits and installs the same way they do in
Claude Code. (The hook wiring is verified against Codex's documented hook
system; end-to-end confirmation on a live Codex install is tracked in
[HANDOFF.md](../HANDOFF.md).)

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
half of the workflow assumes a browser-preview tool exists in the
environment (Claude Code's `preview_*` tools, or an equivalent), so that part
is inherently host-dependent regardless of vendor.
