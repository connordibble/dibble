# zod-first-tools

**A tool call has two schemas: one for the model, one for your validator. Write
them separately and they drift. Derive both from one Zod object and they can't.**

zod-first-tools teaches an agent to build LLM tool definitions and MCP servers
from a single Zod schema, and ships a linter that catches the moment someone
hand-writes the second one.

```
$ node skills/zod-first-tools/scripts/lint-tools.mjs src/

  src/tools/weather.ts:14  hand-written "input_schema" alongside a Zod schema

  1 file(s) maintain two schemas for one tool boundary.
  Derive the provider schema from the Zod schema instead.
```

## What it does

- **The skill** gives an agent the rule (one Zod object → derived provider
  schema → same object validates the response) and a reference file of
  copy-paste derivations for Anthropic Messages tools, OpenAI tools and
  structured outputs (including the strict-mode nullable-optional gotcha), and
  MCP server tools.
- **The linter** flags files that use Zod *and* hand-write a
  `input_schema` / `parameters` / `inputSchema` object literal for the same
  tool. Files that already derive (via `z.toJSONSchema`, `zodFunction`,
  `zod-ai-tool`, etc.) pass. Exit 1 on findings, so it runs in CI.

## Install

```
/plugin marketplace add connordibble/dibble
/plugin install zod-first-tools@dibble
```

## The boundary stays small

Deriving the schema is the whole job. This skill deliberately does not turn into
a tool-loop framework: it takes a Zod object, gives the provider a definition,
gives your code a validator, and stops. When you want that packaged rather than
hand-rolled, [`zod-ai-tool`](https://www.npmjs.com/package/zod-ai-tool) does
exactly this across Anthropic, OpenAI, and Gemini shapes with no runtime SDK
dependency. Using it, or the raw derivations in the reference, is what makes the
linter pass.

Portable Agent Skill: copy `skills/zod-first-tools/` into any tool that reads
SKILL.md. Part of the [dibble](../../README.md) catalog. MIT.
