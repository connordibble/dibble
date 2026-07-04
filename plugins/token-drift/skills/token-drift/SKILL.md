---
name: token-drift
description: Audit design-token drift between Figma Variables exports, W3C DTCG JSON, and code-side CSS custom properties. Use when syncing design tokens, after a Figma token export, before a design-system release, when tokens look out of sync between design and code, when setting up a token pipeline, or when a token-drift report flags VALUE_DRIFT, MISSING_IN_CODE, ORPHAN_IN_CODE, TYPE_MISMATCH, or CYCLE.
---

# token-drift

Use this skill when design tokens need to match between design source and code.
The deterministic checker is `scripts/diff-tokens.mjs`.

## Workflow

1. Identify the design/reference token source. Prefer a Figma Variables export
   in W3C DTCG JSON, but any DTCG JSON file works.
2. Identify the code token source. For v1, use the CSS file that defines custom
   properties, usually `globals.css`, `tokens.css`, or `theme.css`.
3. Run:

```bash
node <this-skill-directory>/scripts/diff-tokens.mjs <design.tokens.json> <code.css>
```

Use `--json` for machine-readable output. Use `--strict` when missing or
orphaned tokens should fail CI.

## Reading verdicts

- `VALUE_DRIFT`: same token key, different normalized value. Treat this as a
  release blocker until design or code is updated.
- `TYPE_MISMATCH`: same token key, different DTCG `$type`. Fix the source of
  truth before changing consumers.
- `CYCLE`: an alias chain loops. Break the cycle before trusting any derived
  token.
- `MISSING_IN_CODE`: design exports a token code does not define. This warns by
  default because design may be ahead of rollout.
- `ORPHAN_IN_CODE`: code defines a token design no longer exports. This warns
  by default because deprecation can be staged.

Presence gaps fail with `--strict`.

## Name mapping

The CSS parser maps custom properties to DTCG paths by stripping `--`, splitting
on hyphens, and joining with dots. Example:

```text
--color-brand-500 -> color.brand.500
```

Override this with `.token-drift.json` at the project root:

```json
{
  "cssPrefix": "--",
  "separator": "-",
  "dtcgSeparator": "."
}
```

## Escape hatches

Use escape hatches rarely and leave the reason near the token.

- DTCG: `$extensions: { "token-drift": "ignore" }`
- CSS: `/* token-drift-ignore */` on the custom-property line

## Reference

Read `references/dtcg.md` when you need DTCG shape details, alias examples, or
the comparison rules behind the checker.
