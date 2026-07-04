# dibble

**Guardrails and craft for coding agents.** Deterministic hooks where judgment
isn't needed, sharp skills where it is.

Agents are fast and forgetful. They know your project has design tokens and
write `bg-zinc-900` anyway; they summarize convincingly and drift from the
evidence; they install a package a model hallucinated. dibble is a catalog of
small, focused plugins that give an agent your system's constraints, taste, and
evidence standards, and enforce them at the moment work happens rather than
hoping the instructions stuck.

Every plugin's skill and CLI script ship as a portable
[Agent Skill](https://agentskills.io) — no Claude Code APIs, so the knowledge
and the checkers both work as-is in **Codex, Cursor, and Gemini CLI**, and in
CI on any platform. Claude Code gets a Claude marketplace for hooks and slash
commands; Codex gets a separate Codex marketplace sidecar that installs the
same skills without claiming Claude-only hook behavior. See
[docs/compatibility.md](docs/compatibility.md) for exactly which layer each
plugin has.

## Install

### Claude Code

```
/plugin marketplace add connordibble/dibble
```

Then install any plugin from the catalog:

```
/plugin install tokenlock@dibble
```

Add the marketplace once; every plugin below (and every one added later) shows
up in your `/plugin` browser.

### Codex

```bash
codex plugin marketplace add connordibble/dibble
codex plugin marketplace upgrade dibble
```

Then install from the Codex plugin browser. Codex installs the skill layer and
the same CLI-backed workflows. Claude-specific PreToolUse/PostToolUse hooks and
namespaced slash commands stay Claude-only.

### CI and npm

Every checker also ships on npm, so CI can run the same rules without
installing a plugin. Run these from the project you want to check, and replace
the paths with real paths in that project. `npx` still uses your current
working directory.

```bash
npx dibble sloplint --strict README.md docs
npx dibble tokenlock src
npx dibble token-drift path/to/figma.tokens.json path/to/globals.css
npx dibble validate-marketplace .
npx dibble validate-codex .
```

`npx dibble --help` lists every tool (also `agent-audit`, `install-gate`,
`token-drift`, `receipts`, `zod-lint`, `readme-audit`, `responsive-smells`,
`validate-codex`).
Each tool also publishes its own bin (`dibble-tokenlock`,
`dibble-token-drift`, `dibble-sloplint`, ...) for when only one is installed as
a project dependency rather than run ad hoc.

Don't want to set anything up first: [examples/](examples/) has runnable
fixtures for every plugin with a checker, each with a copy-paste command that
finds the issue.

## The catalog

| Plugin | What it does | Enforcement |
| --- | --- | --- |
| [tokenlock](plugins/tokenlock) | Catches hardcoded colors and raw Tailwind palette utilities on every edit, and suggests the matching token from your files | PostToolUse hook + audit + CI |
| [token-drift](plugins/token-drift) | Compares Figma Variables or DTCG exports against CSS custom properties, with alias-aware value checks and presence-gap warnings | Skill + checker + CI |
| [install-gate](plugins/install-gate) | Blocks typosquats and install-time code execution, flags hallucinated package names before install | PreToolUse hook + CLI |
| [agent-audit](plugins/agent-audit) | Read-only security audit of your agent config: hijacked hooks, permission creep, plaintext MCP, inline secrets | `/agent-audit:audit` command + CLI |
| [receipts](plugins/receipts) | Evidence-linked summaries where every claim traces to a verbatim quote; catches quotes that were subtly reworded | Skill + checker + CI |
| [no-slop](plugins/no-slop) | Technical writing without the machine-prose tells, plus a voice extractor that builds a personal voice skill from your writing | Skill + sloplint + CI |
| [design-verify](plugins/design-verify) | Renders UI changes and critiques them at 375px/1280px; static linter for mobile-overflow bugs | `/design-verify:verify` command + linter |
| [tailwind-v4-tokens](plugins/tailwind-v4-tokens) | The Tailwind v4 theming knowledge behind the enforcement: `@theme`, token-first dark mode, the spacing-shadow trap | Skill |
| [zod-first-tools](plugins/zod-first-tools) | Build LLM tool definitions and MCP servers from one Zod schema; linter flags a hand-written schema beside it | Skill + linter + CI |
| [readme-that-sells](plugins/readme-that-sells) | README and launch copy built around the conversion funnel; auditor measures time-to-install and time-to-example | Skill + auditor + CI |
| [marketplace-kit](plugins/marketplace-kit) | Build and validate a plugin marketplace; catches the version and layout bugs that break installs | `/marketplace-kit:validate` command + validator |

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

- **marketplace-kit** validates the Claude Code catalog (structure, versions,
  hook references) — the plugin validating its own marketplace
- **validate-codex-plugins** validates the Codex sidecar marketplace and every
  `.codex-plugin/plugin.json`
- **90+ tests** across every script (`node --test`)
- **sloplint** (`--strict`) on the root README, plugin READMEs, and every
  catalog SKILL.md
- the root README and every plugin README pass **readme-that-sells**' own
  auditor

Each plugin is self-contained (skills, scripts, tests, README) so it can be read
and trusted on its own.

## Author

Built by [Connor Dibble](https://connordibble.dev). The design-system and
evidence plugins come out of production work: an enterprise design system used
by 1000+ engineers, an AI feedback platform where a summary that drifted from
its evidence was a real liability, and a schema library ([zod-ai-tool](https://www.npmjs.com/package/zod-ai-tool))
for the tool-definition boundary.

MIT licensed. Contributions and issues welcome.
