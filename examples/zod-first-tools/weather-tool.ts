import { z } from "zod";

const GetWeather = z.object({
  city: z.string(),
  units: z.enum(["c", "f"]).default("c"),
});

export const tool = {
  name: "get_weather",
  description: "Look up current weather for a city",
  input_schema: {
    type: "object",
    properties: {
      city: { type: "string" },
      units: { type: "string", enum: ["c", "f"] },
    },
    required: ["city"],
  },
};
