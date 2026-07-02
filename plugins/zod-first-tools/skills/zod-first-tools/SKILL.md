---
name: zod-first-tools
description: Build LLM tool definitions and MCP servers from one schema instead of two. Use when defining tools for the Anthropic, OpenAI, or Gemini APIs, building an MCP server with tools, wiring structured outputs, or validating model tool-call arguments. Also use when reviewing tool-use code for schema drift, or when a zod-first-tools lint finding points at a hand-written tool schema next to a Zod schema.
---

# One schema for the tool boundary

Every tool call has two contracts that want to drift apart. The provider needs
a JSON Schema so the model knows what shape to return. Your code needs a
validator so model output is checked before it touches anything real. Write
those separately and the mismatch shows up late: a range limit lives in one, an
enum value lands in the other, an "optional" field means different things to the
provider and the validator.

The fix is to keep one source of truth and derive the rest. Write the schema
once in Zod, derive the provider's JSON Schema from it, and validate tool input
with the same object. The schema is the contract; everything else is generated.

## The rule

For any tool or structured output:

1. Define the input shape once as a Zod object.
2. Derive the provider tool definition from it, never hand-write the
   `input_schema` / `parameters` / `inputSchema` object.
3. Validate the model's tool arguments with the *same* Zod object before acting.

If you find yourself typing `{ type: "object", properties: { ... } }` next to a
Zod schema for the same tool, stop: that is the drift smell, and the linter in
this skill (`scripts/lint-tools.mjs`) flags exactly it.

```bash
node <this-skill-directory>/scripts/lint-tools.mjs src/    # find duplicated schemas
```

## How to derive, per provider

Zod 4 ships `z.toJSONSchema()`; on Zod 3, `zod-to-json-schema` fills the gap.
The provider SDKs also offer helpers. See `references/patterns.md` in this
skill's directory for copy-paste-ready snippets covering:

- Anthropic Messages API tools (`input_schema` from Zod)
- OpenAI tools and structured outputs (`zodFunction`, `zodResponseFormat`, and
  the strict-mode rules for optional fields)
- MCP server tools (deriving `inputSchema`, validating the handler's arguments)
- Validating tool-call arguments before executing

Read that file when writing the actual wiring; the patterns encode the sharp
edges (strict mode representing optional as nullable, `additionalProperties`,
Zod 3 vs 4 differences) that are easy to get subtly wrong.

## Keep the boundary small

Deriving the schema is the whole job; resist the urge to build a framework
around it. The tool layer should not parse streams, run the tool loop, or
decide which function to call. It takes a Zod object, gives the provider a tool
definition, and gives your code a validator. When you want that packaged rather
than hand-rolled, `zod-ai-tool` on npm does exactly this across Anthropic,
OpenAI, and Gemini shapes, supports Zod 3 and 4 without version sniffing, and
carries no runtime SDK dependency. Using it (or the raw derivation above) is
what makes the linter pass: both are "derive," not "duplicate."

## Why validate with the same object

The provider schema tells the model what to send; it does not guarantee the
model sends it. Models omit required fields, coerce types, and occasionally
invent enum values. Validating tool arguments against the same Zod schema
before you act closes the loop, and because it is the same schema that shaped
the tool, there is no gap between "what the model was told" and "what you
accept." Two derivations from one source cannot disagree; two hand-written
schemas eventually will.
