# dibble

**The engineering context I carry between coding agents.**

I use Claude and GPT for different parts of software work. The models are good
at different things, but I kept carrying the same instructions between them:
use the design system, check the package before installing it, derive the tool
schema from Zod, render the UI before calling it done, and keep summaries tied
to their evidence.

dibble packages those repeated instructions and checks as portable plugins.
Some teach a focused workflow. Others enforce a deterministic rule through a
hook or CLI. The same checkers run in CI, so the contract survives when a human
or another model edits the code.

**The model can change. The engineering contract stays put.**

## Try it

Install the CLI in a project and inspect its agent plugins:

```bash
npm install --save-dev dibble
npx dibble plugin-inspector .
```

The same package contains every deterministic checker. Native Claude Code and
Codex installation is covered below.

## One working loop

The plugins follow the same loop I use while working with an agent:

| Stage | Question | Plugins |
| --- | --- | --- |
| **Trust the inputs** | What can this package, plugin, or agent configuration execute? | [install-gate](plugins/install-gate), [agent-audit](plugins/agent-audit), [plugin-inspector](plugins/plugin-inspector) |
| **Guide the work** | Which engineering standards should survive the model boundary? | [tokenlock](plugins/tokenlock), [tailwind-v4-tokens](plugins/tailwind-v4-tokens), [zod-first-tools](plugins/zod-first-tools), [no-slop](plugins/no-slop) |
| **Verify the result** | What evidence should exist before the work is accepted? | [design-verify](plugins/design-verify), [token-drift](plugins/token-drift), [receipts](plugins/receipts), [readme-that-sells](plugins/readme-that-sells) |

A frontend change makes the loop concrete. `install-gate` checks an unfamiliar
dependency before it enters the project. `tokenlock` keeps the implementation
on the design system. `design-verify` checks the rendered result. CI runs the
same deterministic checks again after the conversation ends.

## Start with the failure you recognize

You do not need the whole catalog to get value from one plugin.

- **Safer agent setup:** start with `install-gate` and `agent-audit`.
- **Frontend work:** start with `tokenlock`, `token-drift`, and
  `design-verify`.
- **Evidence-backed writing:** start with `receipts` and `no-slop`.
- **Agent tooling:** start with `zod-first-tools` and `plugin-inspector`.

Each plugin is installed separately. Pick the repeated failure mode you already
have.

## Install

### Claude Code

Add the marketplace once:

```text
/plugin marketplace add connordibble/dibble
```

Then install the plugin you want:

```text
/plugin install tokenlock@dibble
```

### Codex

```bash
codex plugin marketplace add connordibble/dibble
codex plugin marketplace upgrade dibble
codex plugin add tokenlock@dibble
```

Codex installs the portable skills and bundled command hooks. For `tokenlock`
and `install-gate`, open `/hooks`, inspect the command, and trust its current
definition before expecting automatic enforcement. Namespaced slash commands
remain specific to Claude Code.

See [docs/compatibility.md](docs/compatibility.md) for the exact capability
available on each host.

### CI and npm

Every deterministic checker also ships through npm. It runs from the current
working directory and needs no plugin host:

```bash
npx dibble sloplint --strict README.md docs
npx dibble tokenlock src
npx dibble token-drift path/to/figma.tokens.json path/to/globals.css
npx dibble plugin-inspector .
```

`npx dibble --help` lists every command, including `agent-audit`,
`install-gate`, `receipts`, `zod-lint`, `readme-audit`, and
`responsive-smells`. Each checker also publishes its own bin for projects that
install `dibble` as a dependency.

[examples/](examples/) contains a runnable failure for every plugin with a
checker. Each example takes one command and a few seconds.

## Trust the inputs

| Plugin | Repeated problem | Mechanism |
| --- | --- | --- |
| [install-gate](plugins/install-gate) | An agent installs a typo, an invented package, or a source that deserves review | PreToolUse hook plus an offline CLI for npm, pnpm, yarn, bun, pip, and cargo |
| [agent-audit](plugins/agent-audit) | A hook, permission, or MCP entry changes the authority of the agent | Read-only Claude Code and Codex configuration audit |
| [plugin-inspector](plugins/plugin-inspector) | A plugin package looks valid without showing what it can execute or contact | Dual-host validator plus execution, network, and installation authority inventory |

## Guide the work

| Plugin | Repeated problem | Mechanism |
| --- | --- | --- |
| [tokenlock](plugins/tokenlock) | Generated UI bypasses the design system with raw colors or Tailwind palette utilities | PostToolUse enforcement, audit CLI, and CI check |
| [tailwind-v4-tokens](plugins/tailwind-v4-tokens) | Tailwind v4 theming drifts across `@theme`, dark mode, and legacy configuration | Focused knowledge skill for token-first Tailwind work |
| [zod-first-tools](plugins/zod-first-tools) | Runtime validation and model-facing tool schemas become two contracts | Provider and MCP patterns derived from one Zod schema, plus a drift linter |
| [no-slop](plugins/no-slop) | Technical writing loses evidence and starts sounding like the average model output | Writing and voice skills plus deterministic prose checks |

## Verify the result

| Plugin | Repeated problem | Mechanism |
| --- | --- | --- |
| [design-verify](plugins/design-verify) | UI work compiles without looking right at real viewport widths | Static responsive checks plus a browser-backed review loop |
| [token-drift](plugins/token-drift) | Design tokens and code-side CSS variables disagree | DTCG and CSS comparison with alias, `$ref`, type, and cycle handling |
| [receipts](plugins/receipts) | A clean summary drifts away from its sources | Verbatim evidence format plus quote verification |
| [readme-that-sells](plugins/readme-that-sells) | A developer tool is documented without a quick path to understanding or trying it | README workflow plus structural audit |

## How the contract travels

Every plugin ships its knowledge as a portable
[Agent Skill](https://agentskills.io). The skills are Markdown, and their
checkers are zero-dependency Node scripts. Claude Code and Codex get native
marketplace metadata. Other Agent Skill hosts can use the same skill directory,
while npm and CI run the deterministic layer directly.

The boundary is deliberate. A skill carries judgment and context. A script
handles rules that should return the same result regardless of which model or
person produced the work. Hooks put those rules at the point of action. CI
keeps them after the session is gone.

## What dibble does not do

dibble does not make Claude and GPT behave identically. Skills still depend on
the model following their instructions, browser-backed verification depends on
the host exposing a browser, and command hooks follow each host's trust and
approval rules. The deterministic scripts cover the parts that can return the
same answer everywhere.

The catalog is also early. Its package contracts and fixtures are tested, but
external adoption is still the evidence it needs next.

## Quality bar

This repository is governed by the plugins it ships:

- `plugin-inspector` validates both marketplace formats, every local manifest,
  component paths, evaluation coverage, and declared authority.
- 148 tests run across every deterministic script. CI enforces a 95% line
  coverage floor, currently 95.61%, plus focused branch floors for the three
  security-oriented checkers.
- 60 behavioral cases cover direct activation, indirect activation, missing
  context, non-activation, and unsafe edges for all 12 skills.
- `sloplint --strict` checks the root README, plugin READMEs, and every skill.
- `readme-that-sells` audits the root README and every plugin README.

Each plugin remains self-contained, with its own skill, script where useful,
tests, example, and README. A reviewer can inspect one without trusting the
rest of the catalog.

## Contributing

The useful starting question is: **what engineering instruction do you keep
repeating to coding agents?**

A good contribution encodes a recurring decision, catches a failure the model
regularly misses, or adds evidence before work is accepted. If the rule can be
checked deterministically, its script should also run outside the agent. If it
cannot work across hosts, document the boundary plainly.

Issues and contributions are welcome.

## Author

Built by [Connor Dibble](https://connordibble.dev). The design-system and
evidence plugins come from production work: an enterprise design system used
by 1000+ engineers, an AI feedback platform where summaries had to remain tied
to evidence, and a schema library
([zod-ai-tool](https://www.npmjs.com/package/zod-ai-tool)) for the tool-definition
boundary.

MIT licensed.
