---
description: Validate Claude Code and ChatGPT/Codex plugin structure, then report executable and network authority.
---

Inspect the current plugin or marketplace repository.

1. Run `node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-inspector/scripts/inspect.mjs ${CLAUDE_PROJECT_DIR}`.
2. Fix structural errors before reviewing warnings.
3. Read the authority inventory and inspect every declared hook, executable,
   MCP server, app mapping, LSP server, monitor, and dependency.
4. Do not call a plugin safe or release-ready from structural validation alone.
   Name the remaining live checks: installation, hook trust, authentication,
   workspace policy, and low-risk tool invocation.
