---
description: Run a read-only security audit of this machine's coding-agent configuration (hooks, permissions, MCP servers, config integrity) and walk the findings.
---

Run the agent-audit scanner and help me act on what it finds.

1. Execute: `node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs`
2. Read the `audit` skill for how to interpret severities and act safely.
3. Summarize findings grouped by severity. For each CRITICAL finding, show me
   the exact config it points at and ask whether I recognize it before
   suggesting any change. Do not modify any file without my confirmation.
4. If everything is clean, say so and note when I should run this again
   (after adding a marketplace/plugin/MCP server, or after any supply-chain
   incident in the news).
