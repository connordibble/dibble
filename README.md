# dibble

**Guardrails and craft for coding agents.** Deterministic hooks where judgment
isn't needed, sharp skills where it is.

Agents are fast and forgetful. They know your project has design tokens and
write `bg-zinc-900` anyway; they summarize convincingly and drift from the
evidence; they install a package a model hallucinated. dibble is a catalog of
small, focused plugins that give an agent your system's constraints, taste, and
evidence standards, and enforce them at the moment work happens rather than
hoping the instructions stuck.

Every tool here ships as a portable [Agent Skill](https://agentskills.io), so
the knowledge works in **Claude Code, Codex, Cursor, and Gemini CLI**. Where
enforcement needs to be deterministic, a Claude Code plugin wraps the same
script in a hook. One codebase, two tiers: automatic in Claude Code, runnable
on demand everywhere else.

## Install

```
/plugin marketplace add connordibble/dibble
```

Then install any plugin from the catalog:

```
/plugin install tokenlock@dibble
```

Add the marketplace once; every plugin below (and every one added later) shows
up in your `/plugin` browser.

## The catalog

| Plugin | What it does | Enforcement |
| --- | --- | --- |
| [tokenlock](plugins/tokenlock) | Catches hardcoded colors and raw Tailwind palette utilities on every edit, and suggests the matching token from your files | PostToolUse hook + audit + CI |
| [install-gate](plugins/install-gate) | Blocks typosquats and install-time code execution, flags hallucinated package names before install | PreToolUse hook + CLI |
| [agent-audit](plugins/agent-audit) | Read-only security audit of your agent config: hijacked hooks, permission creep, plaintext MCP, inline secrets | `/agent-audit` command + CLI |
| [receipts](plugins/receipts) | Evidence-linked summaries where every claim traces to a verbatim quote; catches quotes that were subtly reworded | Skill + checker + CI |
| [no-slop](plugins/no-slop) | Technical writing without the machine-prose tells, plus a voice extractor that builds a personal voice skill from your writing | Skill + sloplint + CI |
| [design-verify](plugins/design-verify) | Renders UI changes and critiques them at 375px/1280px; static linter for mobile-overflow bugs | `/design-verify` command + linter |
| [tailwind-v4-tokens](plugins/tailwind-v4-tokens) | The Tailwind v4 theming knowledge behind the enforcement: `@theme`, token-first dark mode, the spacing-shadow trap | Skill |
| [zod-first-tools](plugins/zod-first-tools) | Build LLM tool definitions and MCP servers from one Zod schema; linter flags a hand-written schema beside it | Skill + linter + CI |
| [readme-that-sells](plugins/readme-that-sells) | README and launch copy built around the conversion funnel; auditor measures time-to-install and time-to-example | Skill + auditor + CI |
| [marketplace-kit](plugins/marketplace-kit) | Build and validate a plugin marketplace; catches the version and layout bugs that break installs | `/validate-marketplace` + validator |

## The idea behind the catalog

An agent should inherit your system's taste, constraints, and evidence
standards, not the average of its training data. Each plugin proves one piece of
that:

- **Taste and constraints:** tokenlock and tailwind-v4-tokens keep styling on
  your design system; design-verify confirms it renders right.
- **Evidence standards:** receipts makes summaries prove themselves; no-slop
  strips the adjectives that hide missing evidence.
- **Safety:** install-gate and agent-audit cover the two agent supply-chain
  surfaces (what gets installed, and what rewrote your config).
- **Craft for builders:** zod-first-tools, readme-that-sells, and
  marketplace-kit are the tools you use to ship the rest.

A recurring pattern: put the deterministic logic in a script inside the skill,
then have the plugin's hook call it. So the rule that governs your agent is the
same rule that governs your CI. No divergence between what the agent is told and
what the pipeline enforces.

## Quality bar

This repo holds itself to what it sells. On every push, CI runs:

- **marketplace-kit** validates the whole catalog (structure, versions, hook
  references) — the plugin validating its own marketplace
- **80+ tests** across every script (`node --test`)
- **sloplint** (`--strict`) on every README and SKILL.md in the repo
- every README passes **readme-that-sells**' own auditor

Each plugin is self-contained (skills, scripts, tests, README) so it can be read
and trusted on its own.

## Author

Built by [Connor Dibble](https://connordibble.dev). The design-system and
evidence plugins come out of production work: an enterprise design system used
by 1000+ engineers, an AI feedback platform where a summary that drifted from
its evidence was a real liability, and a schema library ([zod-ai-tool](https://www.npmjs.com/package/zod-ai-tool))
for the tool-definition boundary.

MIT licensed. Contributions and issues welcome.
