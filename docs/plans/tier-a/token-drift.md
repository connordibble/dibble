# Plan: token-drift (Tier A, dibble monorepo)

> Read [00-CONVENTIONS.md](../00-CONVENTIONS.md) first. This plan only states
> what is specific to token-drift.

## One-line pitch

Audits whether a project's design tokens agree between **Figma Variables** (the
design source) and the **code** (CSS custom properties / W3C DTCG JSON), and
reports what drifted, in both directions.

## Why it stands out / why Connor

`tokenlock` (already shipped) enforces that code *uses* tokens. token-drift is
the layer above: it checks that the tokens themselves still *match design*.
Existing tools extract tokens Figma→code; almost none audit the two sides for
divergence. Connor built exactly this Figma-Variables→W3C-token pipeline at
State Farm for 1000+ engineers (see `sfds` project), so the authority is real.
This is the governance half of the design-token story tokenlock started.

## The clever differentiator

**Bidirectional diff with a "who's ahead" verdict per token.** Not just "these
differ" but: token exists in Figma but not code (design shipped, code behind),
exists in code but not Figma (orphaned/legacy), exists in both but values
differ (the dangerous case — silent divergence). Plus **alias-aware
comparison**: DTCG tokens can reference other tokens (`{color.brand.500}`);
resolve aliases before comparing so a renamed primitive doesn't produce false
drift across every semantic token that points at it.

## Deliverables (file tree)

```
plugins/token-drift/
├── .claude-plugin/plugin.json
├── skills/token-drift/
│   ├── SKILL.md
│   ├── scripts/
│   │   ├── diff-tokens.mjs        # core: diff two token sources
│   │   └── parse-dtcg.mjs         # DTCG + CSS-custom-property parsers (imported by diff-tokens)
│   └── references/dtcg.md         # DTCG format notes, alias resolution rules
├── tests/diff-tokens.test.mjs
└── README.md
examples/token-drift/
├── figma-export.tokens.json       # DTCG export (mock)
├── globals.css                    # the code side, intentionally drifted
└── README.md
```

Note: this plugin is a **skill + CLI**, not a hook (a live Figma diff can't run
in a PostToolUse hot path). No `hooks/`. It may ship a `/token-drift:audit`
slash command (optional; follow the agent-audit command pattern).

## Script spec: `diff-tokens.mjs`

### Invocation
```
node diff-tokens.mjs <source-a> <source-b> [--json] [--format dtcg|css|auto]
# e.g. node diff-tokens.mjs figma-export.tokens.json globals.css
```
- Auto-detect format per file by extension (`.json`→DTCG, `.css`/`.scss`→CSS
  custom properties). `--format` overrides.
- `source-a` is treated as the **design/reference** side, `source-b` as the
  **code** side, so verdicts read "design has X, code doesn't."

### Parsing (`parse-dtcg.mjs`, exported functions)
- `parseDtcg(text)` → `Map<string, {value, type, alias?}>`. Flatten the nested
  DTCG tree into dot-paths (`color.brand.500`). Detect `$value`, `$type`.
  Record alias references (`{color.brand.500}` syntax) without resolving yet.
- `parseCssVars(text)` → `Map<string, {value}>`. Extract `--token-name: value;`
  declarations. Normalize the token name to a comparable key: strip a
  configurable prefix (`--color-` ↔ `color.`) so `--color-brand-500` compares
  to DTCG `color.brand.500`. This name-mapping is the fiddly part — document
  the default mapping and make it configurable via `.token-drift.json`
  (`{ "cssPrefix": "--", "separator": "-", "dtcgSeparator": "." }`).
- `resolveAliases(map)` → new map with `{ref}` values replaced by their target
  value (iteratively, with cycle detection → report a `CYCLE` finding, never
  infinite-loop).

### Comparison + verdicts
Normalize values before comparing (reuse `tokenlock`'s color normalization
approach: fold `#RGB`→`#RRGGBB`, collapse `rgb()` spacing, lowercase). Classify
each token key:
- `MISSING_IN_CODE` — in design, not code
- `ORPHAN_IN_CODE` — in code, not design
- `VALUE_DRIFT` — in both, values differ after normalization (show both values)
- `TYPE_MISMATCH` — same key, different `$type` (e.g. color vs dimension)
- `CYCLE` — unresolvable alias cycle
Matching keys with equal values are not reported.

### Output / exit
- Human report groups by verdict, most-severe first (`VALUE_DRIFT` and
  `TYPE_MISMATCH` before the presence gaps).
- `--json`: `{ driftCount, results: [{key, verdict, designValue?, codeValue?}] }`.
- Exit `1` if any `VALUE_DRIFT`/`TYPE_MISMATCH`/`CYCLE`, else `0` even if there
  are presence gaps (those are often intentional; document that presence gaps
  warn, value drift fails). Reconsider: make `--strict` fail on presence gaps
  too.
- Ignore marker: a token can carry `$extensions: { "token-drift": "ignore" }`
  in DTCG, or `/* token-drift-ignore */` on the CSS line.

## Test cases (`tests/diff-tokens.test.mjs`)
1. Identical token sets → clean, exit 0.
2. A value differs between DTCG and CSS → `VALUE_DRIFT`, exit 1, both values shown.
3. Token in DTCG only → `MISSING_IN_CODE`.
4. Token in CSS only → `ORPHAN_IN_CODE`.
5. DTCG alias (`{color.brand.500}`) resolves and matches the CSS literal → clean.
6. Alias cycle → `CYCLE` finding, no hang.
7. Name mapping: `--color-brand-500` (CSS) matches `color.brand.500` (DTCG).
8. Type mismatch (color vs dimension) → `TYPE_MISMATCH`.
9. Color normalization: `#FFF` in DTCG equals `#ffffff` in CSS → clean.
10. `--json` shape correct; ignore marker suppresses a token.

## SKILL.md description (draft)
> Audit design-token drift between Figma Variables (or any W3C DTCG export) and
> your code's CSS custom properties. Use when syncing design tokens, after a
> Figma token export, when tokens look out of sync between design and code,
> when setting up a token pipeline, or when a token-drift report appears. Pairs
> with tokenlock, which enforces that code uses tokens; token-drift checks the
> tokens themselves still match design.

## examples/token-drift
`figma-export.tokens.json` and `globals.css` share most tokens but: one color
value drifts, one token is Figma-only, one is code-only. Command:
```
npx dibble token-drift examples/token-drift/figma-export.tokens.json examples/token-drift/globals.css
```
Expect: 1 VALUE_DRIFT (exit 1), 1 MISSING_IN_CODE, 1 ORPHAN_IN_CODE.

## Integration checklist (from conventions §4)
- marketplace.json entry; bin `dibble-token-drift` → `diff-tokens.mjs`;
  dispatcher case `token-drift`; compatibility.md row (Skill ✅, CLI ✅, hook
  n/a, command optional, CI ✅).

## Effort
Medium. The parsers are the work; the diff is straightforward. ~1 focused
session. No Figma API needed for v1 — operate on an exported DTCG file, and
note in the README that live Figma-MCP integration is a future enhancement.
