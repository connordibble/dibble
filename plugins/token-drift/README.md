# token-drift

**Design tokens drift in two places: design moves ahead of code, and code keeps
tokens design deleted. token-drift shows both.**

token-drift compares a Figma Variables export, or any W3C DTCG JSON file,
against the code side of your tokens. It reports values that changed, tokens
missing from code, orphaned code tokens, type mismatches, and alias cycles.

```
$ npx dibble token-drift figma-export.tokens.json globals.css

token-drift: 3 finding(s) between figma-export.tokens.json and globals.css

VALUE_DRIFT (fails)
  color.brand.500
    design: #1d4ed8
    code:   #2563eb
```

## Install

```
/plugin marketplace add connordibble/dibble
/plugin install token-drift@dibble
```

Run it directly in a repo or in CI:

```bash
npx dibble token-drift path/to/figma-export.tokens.json src/app/globals.css
```

## What it catches

| Verdict | Meaning | Exit |
| --- | --- | --- |
| `VALUE_DRIFT` | Same token key, different normalized value | 1 |
| `TYPE_MISMATCH` | Same key, different DTCG `$type` | 1 |
| `CYCLE` | Alias chain loops, so the value cannot be resolved | 1 |
| `MISSING_IN_CODE` | Design has the token, code does not | 0 |
| `ORPHAN_IN_CODE` | Code has a token design no longer exports | 0 |

Presence gaps warn by default because token rollout often happens in stages.
Add `--strict` when a release branch should fail on any gap.

## Token formats

DTCG JSON is flattened to dot paths, so:

```json
{
  "color": {
    "brand": {
      "500": { "$type": "color", "$value": "#1d4ed8" }
    }
  }
}
```

matches this CSS custom property:

```css
:root {
  --color-brand-500: #1d4ed8;
}
```

The default name mapper strips `--`, then maps hyphens to dots:
`--color-brand-500` becomes `color.brand.500`. Put `.token-drift.json` at the
project root to change that:

```json
{
  "cssPrefix": "--",
  "separator": "-",
  "dtcgSeparator": "."
}
```

DTCG aliases like `{color.brand.500}` and CSS aliases like
`var(--color-brand-500)` are resolved before values are compared. Cycles fail
instead of hanging. Add `$extensions: { "token-drift": "ignore" }` to a DTCG
token or `/* token-drift-ignore */` on a CSS variable line to suppress that
token.

## CI

```yaml
- run: npx dibble token-drift tokens/figma.tokens.json src/app/globals.css --strict
```

Use `--json` for dashboards or PR comments:

```bash
npx dibble token-drift tokens/figma.tokens.json src/app/globals.css --json
```

## Honest limits

- v1 reads exported files. It does not call the Figma API or a Figma MCP
  server yet.
- CSS parsing is line-based and aimed at token definition files, not arbitrary
  generated CSS.
- Alias resolution is exact by token name. It will not guess that a renamed
  token is "probably" the same design decision.

Part of the [dibble](../../README.md) catalog. MIT.
