# zod-first-tools example

`weather-tool.ts` defines a Zod schema and then hand-writes a matching
`input_schema` JSON Schema for the same tool — the exact drift the linter
exists to catch, since the two will eventually disagree.

```bash
npx dibble zod-lint examples/zod-first-tools
```

Expect: one finding pointing at the `input_schema` line, exit code 1. Fixing
it means deriving `input_schema` from `GetWeather` with `z.toJSONSchema()`
(see the skill's `references/patterns.md`) instead of writing it by hand.
