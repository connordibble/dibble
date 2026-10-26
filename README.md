# dibble

Plugins for Claude Code and Codex, with engineering checks you can also run
from the command line and in CI.

I built dibble because I kept correcting the same mistakes in agent-generated
work: hardcoded colors in projects with design tokens, duplicated tool schemas,
and summaries with quotes that did not match their sources. The plugins pair
instructions for the agent with scripts that check specific failures.

## Try a check

Install the CLI in a project. It requires Node.js 20 or later:

```bash
npm install --save-dev dibble
npx dibble tokenlock src
```

For example, if a component uses `#18181B` and the project defines that value
as `--color-surface`, tokenlock reports the violation and the matching token.
Abbreviated output from the [included fixture](examples/tokenlock):

```text
$ npx dibble tokenlock examples/tokenlock/src

tokenlock: 3 design-token violations in examples/tokenlock/src/Card.tsx

     2  bg-zinc-900/80  → use a token-mapped utility instead of the raw Tailwind palette
     2  border-red-500  → use a token-mapped utility instead of the raw Tailwind palette
     2  #18181B         → var(--color-surface) or the mapped utility (e.g. bg-surface) ...
```

The command exits with code 1. It reports findings; it does not rewrite the
component. In an agent session, the tokenlock hook returns those findings to
the agent so it can correct the code. A developer can run the same scanner
locally or use its exit code to fail a CI job.

Clone this repository to run the fixture above. [examples/](examples/) has a
runnable failure for every plugin with a checker.

## How it is built

Each plugin keeps its instructions, scripts, and tests together. The
instructions use the [Agent Skills](https://agentskills.io) format: a Markdown
file with supporting resources. Claude Code and Codex have separate manifests
that point to the same skill directories.

The division between instructions and code is deliberate:

| Part | Responsibility |
| --- | --- |
| Skill | Explain the workflow and decisions that need judgment, such as reviewing a rendered UI or assessing whether a source supports a claim. |
| Checker | Apply a defined rule to files or configuration and return findings with an exit code. Checkers are zero-dependency Node.js scripts. |
| Hook | Run a checker during an agent tool call. `install-gate` checks before a package install; `tokenlock` scans after an edit. |
| CI | Run checkers without an agent. The project's pipeline decides which findings block a merge or release. |

The checker supplies repeatable feedback when an agent misses an instruction.
A team can also use it without adopting a particular coding agent. Browser
review and other judgment calls still need someone to assess the result.

For an implementation to review, start with
[tokenlock's scanner](plugins/tokenlock/skills/tokenlock/scripts/scan.mjs),
its [hook](plugins/tokenlock/hooks/), and its [tests](plugins/tokenlock/tests/).
They show how one rule runs during an agent session and independently in CI.

## Plugins

Install only the plugins relevant to your project. Each has its own README
with usage and limits.

| Plugin | What it does |
| --- | --- |
| [tokenlock](plugins/tokenlock) | Finds hardcoded colors and raw Tailwind palette utilities; suggests matching project tokens. Includes an edit hook. |
| [token-drift](plugins/token-drift) | Compares exported design tokens with CSS variables, including aliases, types, and cycles. |
| [tailwind-v4-tokens](plugins/tailwind-v4-tokens) | Guides Tailwind v4 theme configuration, token definitions, and dark mode. Instructions only. |
| [zod-first-tools](plugins/zod-first-tools) | Teaches tool definitions derived from one Zod schema and lints for separately maintained JSON schemas. |
| [install-gate](plugins/install-gate) | Checks install commands for likely package-name typos and sources that need review. Includes a pre-install hook. |
| [agent-audit](plugins/agent-audit) | Audits local coding-agent configuration, including hooks, permissions, and MCP servers. Read-only. |
| [plugin-inspector](plugins/plugin-inspector) | Validates Claude Code and Codex plugin packages and lists what they can execute or connect to. |
| [design-verify](plugins/design-verify) | Guides browser review of rendered UI and provides a static checker for responsive layout mistakes. |
| [receipts](plugins/receipts) | Checks that quoted evidence in Markdown appears in the cited source files. |
| [no-slop](plugins/no-slop) | Provides writing and personal-voice workflows, plus a linter for common prose patterns. |
| [readme-that-sells](plugins/readme-that-sells) | Guides README structure and checks for an early example, installation instructions, and stated limits. |

## Install plugins

### Claude Code

Add the marketplace once, then install a plugin:

```text
/plugin marketplace add connordibble/dibble
/plugin install tokenlock@dibble
```

### Codex

```bash
codex plugin marketplace add connordibble/dibble
codex plugin marketplace upgrade dibble
codex plugin add tokenlock@dibble
```

For `tokenlock` and `install-gate`, open `/hooks`, inspect the command, and
trust its current definition before expecting automatic checks. Namespaced
slash commands are specific to Claude Code.

Other hosts that support Agent Skills can use the skill directories and run
the checkers explicitly. Hook support depends on the host. See
[docs/compatibility.md](docs/compatibility.md) for the support matrix and host
verification status.

### CLI and CI

The npm package contains every deterministic checker. Commands run from the
current working directory:

```bash
npx dibble sloplint --strict README.md docs
npx dibble tokenlock src
npx dibble token-drift path/to/figma.tokens.json path/to/globals.css
npx dibble plugin-inspector .
```

`npx dibble --help` lists every command. Each checker also has its own bin
entry point for projects that install `dibble` as a dependency.

## Verification

This repository runs its own checkers in
[CI](.github/workflows/ci.yml) on Node.js 20, 22, and 24:

- `plugin-inspector` validates both marketplaces, local plugin manifests,
  component paths, and evaluation-case coverage. It also inventories declared
  execution and network access.
- The test suite covers the deterministic scripts. CI enforces a 95% line
  coverage floor and additional branch coverage floors for `install-gate`,
  `agent-audit`, and `plugin-inspector`.
- Strict prose linting checks this README, plugin READMEs, and every skill.
  The README auditor checks the root and plugin READMEs.

The [behavioral evaluation corpus](evals/) contains 60 cases for 12 skills
across 11 plugins. Cases cover explicit and indirect requests, missing context,
requests that should not activate a skill, and unsafe or unsupported actions.
CI checks that each skill has those cases. Running the prompts against a model
and judging its behavior is a separate step; corpus coverage is not a measured
agent success rate.

To run the repository checks locally:

```bash
pnpm validate
pnpm lint:prose
pnpm lint:readmes
pnpm test:coverage
```

## Limitations

These tools check specific failure patterns. Passing them does not establish
that generated code is correct, a dependency is safe, or a summary's conclusions
follow from its evidence. For example, `receipts` can verify that a quote
exists; a reviewer still has to assess what it means in context.

Skills depend on the model following instructions. Hooks depend on host
support and trust settings. The browser portion of `design-verify` needs a
browser in the host and cannot run as a static CI check. Remaining interactive
host checks are tracked in [HANDOFF.md](HANDOFF.md).

External adoption and effects on team delivery time or review effort have not
been established.

## Contributing

Start with a recurring mistake you can reproduce. Include a small failing
example and explain what the check can and cannot determine. If a rule can be
checked in code, keep the checker runnable outside the agent and add tests for
both findings and valid inputs. Document host-specific behavior in the plugin
README.

See [SECURITY.md](SECURITY.md) to report a vulnerability privately.

## Author

Built by [Connor Dibble](https://connordibble.dev). My work on design systems,
AI-generated summaries, and [Zod-based tool definitions](https://www.npmjs.com/package/zod-ai-tool)
informed the checks here.

MIT licensed.
