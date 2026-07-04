# Compatibility

Every plugin's knowledge (the `SKILL.md` files and the scripts they call) is a
portable [Agent Skill](https://agentskills.io): plain Markdown plus
zero-dependency Node scripts, no Claude Code APIs. Copy any `skills/<name>/`
directory into another tool's skills location and the knowledge and the
checker both work, because [32+ tools read the same SKILL.md format](https://code.claude.com/docs/en/skills):
Codex CLI, Cursor, Gemini CLI, and others.

**What does not travel** is Claude Code's plugin packaging on top of that
skill: automatic hooks (the model never has to remember to run the check),
namespaced slash commands, and one-command marketplace install. Those three
features are Claude Code plugin mechanics; another tool gets the skill and
its CLI, run on demand, not the automatic enforcement layer.

| Plugin | Skill (portable) | CLI script | Claude hook | Claude command | CI usable |
| --- | :---: | :---: | :---: | :---: | :---: |
| [tokenlock](../plugins/tokenlock) | ✅ | ✅ | ✅ PostToolUse | n/a | ✅ |
| [token-drift](../plugins/token-drift) | ✅ | ✅ | n/a | n/a | ✅ |
| [install-gate](../plugins/install-gate) | ✅ | ✅ | ✅ PreToolUse | n/a | ✅ |
| [agent-audit](../plugins/agent-audit) | ✅ | ✅ | n/a | ✅ `/agent-audit:audit` | ✅ |
| [design-verify](../plugins/design-verify) | ✅ | ✅ (linter half) | n/a | ✅ `/design-verify:verify` | ✅ (linter) |
| [marketplace-kit](../plugins/marketplace-kit) | ✅ | ✅ | n/a | ✅ `/marketplace-kit:validate` | ✅ |
| [receipts](../plugins/receipts) | ✅ | ✅ | n/a | n/a | ✅ |
| [zod-first-tools](../plugins/zod-first-tools) | ✅ | ✅ | n/a | n/a | ✅ |
| [no-slop](../plugins/no-slop) | ✅ | ✅ | n/a | n/a | ✅ |
| [readme-that-sells](../plugins/readme-that-sells) | ✅ | ✅ | n/a | n/a | ✅ |
| [tailwind-v4-tokens](../plugins/tailwind-v4-tokens) | ✅ | n/a (knowledge only) | n/a | n/a | n/a |

## What this means in practice

**On Codex, Cursor, or Gemini CLI:** every skill's knowledge applies, and
every CLI script runs the same way (`node skills/<name>/scripts/<script>.mjs
...`, or via `npx dibble <name> ...` once published). What you lose
is automatic triggering: tokenlock and install-gate won't intercept a tool
call on their own, because PreToolUse/PostToolUse hooks are a Claude Code
plugin mechanic, not part of the Agent Skills spec. Run the checker
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
