# zod-first tool patterns

Copy-paste-ready derivations. Every one keeps a single Zod object as the source
of truth. Pick the provider section you need.

## Getting JSON Schema out of Zod

```ts
// Zod 4 (built in):
import { z } from "zod";
const Params = z.object({ city: z.string(), units: z.enum(["c", "f"]).default("c") });
const jsonSchema = z.toJSONSchema(Params);

// Zod 3 (fallback library):
import { zodToJsonSchema } from "zod-to-json-schema";
const jsonSchema = zodToJsonSchema(Params, { target: "openApi3" });
```

Do not maintain the JSON Schema by hand. It is a projection of the Zod object;
generate it.

## Anthropic Messages API

```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const GetWeather = z.object({
  city: z.string().describe("City name"),
  units: z.enum(["c", "f"]).default("c"),
});

const tools = [{
  name: "get_weather",
  description: "Look up current weather for a city",
  input_schema: z.toJSONSchema(GetWeather), // derived, not written
}];

// When a tool_use block comes back, validate before acting:
const args = GetWeather.parse(toolUseBlock.input);
```

## OpenAI: tools and structured outputs

```ts
import OpenAI from "openai";
import { zodFunction, zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

const GetWeather = z.object({ city: z.string(), units: z.enum(["c", "f"]) });

// Tool definition:
const tools = [zodFunction({ name: "get_weather", parameters: GetWeather })];

// Structured output:
const Extraction = z.object({ sentiment: z.enum(["pos", "neg", "neutral"]), score: z.number() });
const response_format = zodResponseFormat(Extraction, "extraction");
```

**Strict-mode gotcha.** OpenAI strict mode sets `additionalProperties: false`
and marks every declared property required. An optional Zod field must accept
`null`, because strict mode represents "optional" as a nullable value, not an
absent key:

```ts
// strict-mode optional: nullable, not .optional() alone
const S = z.object({ note: z.string().nullable() });
```

Do not paper over this by rewriting the model's response before validation; let
the schema say what it means.

## MCP server tools

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({ name: "weather", version: "1.0.0" });

const GetWeather = z.object({ city: z.string(), units: z.enum(["c", "f"]).default("c") });

server.tool(
  "get_weather",
  "Look up current weather",
  GetWeather.shape,           // the SDK derives inputSchema from this
  async (args) => {
    const { city, units } = GetWeather.parse(args); // validate inbound args
    return { content: [{ type: "text", text: await lookup(city, units) }] };
  },
);
```

The same `GetWeather` object drives the advertised `inputSchema` and the
runtime validation. There is no second place for the contract to live.

## Validating tool-call arguments (any provider)

```ts
function runTool<T>(schema: z.ZodType<T>, rawArgs: unknown, fn: (args: T) => R) {
  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    // Feed the error back to the model as a tool_result so it can retry.
    return { isError: true, message: parsed.error.message };
  }
  return fn(parsed.data);
}
```

Returning the validation error to the model (rather than throwing) lets the
tool loop self-correct: the model sees precisely which field it got wrong.
