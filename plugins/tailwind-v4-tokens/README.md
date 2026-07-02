# tailwind-v4-tokens

**Tailwind v4 moved the theme into CSS. Most agents still write v3, and the
failure modes are silent.**

This plugin is one dense skill that teaches an agent (and its human) how v4
theming actually behaves:

- **`@theme` vs `:root`**: which block generates utilities, and why most
  "my class doesn't exist" bugs are a token in the wrong one.
- **Token-first dark mode**: semantic tokens swapped per mode via
  `@theme inline`, so components never scatter `dark:` prefixes.
- **The spacing-shadowing trap**: numeric utilities like `max-w-56` compute
  from one `--spacing` multiplier, and a named token that looks like a scale
  number (`--spacing-56`) silently shadows them. Found in production, not in
  the docs.
- **`@apply` in Vue/Svelte/CSS-module scopes** needs `@reference`, or better,
  plain `var()`.
- **v3 → v4 migration** as a review checklist for the upgrade tool's diff.

## Install

```
/plugin marketplace add connordibble/dibble
/plugin install tailwind-v4-tokens@dibble
```

The skill triggers on theming work, token setup, dark mode, migration, and
the specific bug shapes it covers. It also pairs with
[tokenlock](../tokenlock): this skill teaches how to build the `@theme` token
layer, tokenlock enforces that edits keep respecting it.

Portable Agent Skill: copy `skills/theming/` into any tool that reads
SKILL.md (Codex, Cursor, Gemini CLI, …).

Part of the [dibble](../../README.md) catalog. MIT.
