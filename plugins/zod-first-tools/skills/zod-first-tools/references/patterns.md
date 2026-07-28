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
import { z } from "zod";

const openai = new OpenAI();
const GetWeather = z.object({ city: z.string(), units: z.enum(["c", "f"]) });

// Responses API tool definition, derived from the same runtime validator:
const tools = [{
  type: "function" as const,
  name: "get_weather",
  description: "Look up current weather for a city",
  parameters: z.toJSONSchema(GetWeather, { target: "draft-7" }),
  strict: true,
}];

const response = await openai.responses.create({
  model: "gpt-5.6",
  input: "What is the weather in Chicago?",
  tools,
});

for (const item of response.output) {
  if (item.type === "function_call" && item.name === "get_weather") {
    const args = GetWeather.parse(JSON.parse(item.arguments));
    // Execute only with validated args, then return a function_call_output.
  }
}

// Structured output through Responses API text.format:
const Extraction = z.object({ sentiment: z.enum(["pos", "neg", "neutral"]), score: z.number() });
const extractionResponse = await openai.responses.create({
  model: "gpt-5.6",
  input: "Classify: the release is solid.",
  text: { format: {
    type: "json_schema",
    name: "extraction",
    strict: true,
    schema: z.toJSONSchema(Extraction, { target: "draft-7" }),
  } },
});
const extraction = Extraction.parse(JSON.parse(extractionResponse.output_text));
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

Detect the installed SDK major before copying an API shape. The legacy v1
package and current split packages both use `registerTool`, but accept
different schema forms.

### MCP TypeScript SDK v1 compatibility

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({ name: "weather", version: "1.0.0" });

const GetWeather = z.object({ city: z.string(), units: z.enum(["c", "f"]).default("c") });

server.registerTool(
  "get_weather",
  {
    description: "Look up current weather",
    inputSchema: GetWeather.shape,
  },
  async (args) => {
    const { city, units } = GetWeather.parse(args); // validate inbound args
    return { content: [{ type: "text", text: await lookup(city, units) }] };
  },
);
```

### Current split MCP TypeScript SDK

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const server = new McpServer({ name: "weather", version: "1.0.0" });
const GetWeather = z.object({ city: z.string(), units: z.enum(["c", "f"]).default("c") });

server.registerTool("get_weather", {
  description: "Look up current weather",
  inputSchema: GetWeather, // v2 accepts the Standard Schema object directly
}, async (args) => {
  const { city, units } = GetWeather.parse(args);
  return { content: [{ type: "text", text: await lookup(city, units) }] };
});
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
