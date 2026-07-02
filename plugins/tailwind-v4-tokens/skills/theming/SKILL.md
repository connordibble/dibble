---
name: theming
description: Tailwind CSS v4 theming and design tokens done right - @theme, CSS-first configuration, and the traps in between. Use when setting up or editing themes, colors, or design tokens in a Tailwind v4 project, migrating a v3 tailwind.config.js project to v4, implementing dark mode, wiring Figma or W3C design tokens into Tailwind, or debugging v4 utilities that don't generate, resolve to wrong values, or break after adding tokens (including spacing utilities like max-w-56 misbehaving and @apply failing in Vue/Svelte/CSS modules).
---

# Tailwind v4 theming: tokens first

In v4 there is no `tailwind.config.js`. The theme IS CSS: custom properties
declared in an `@theme` block, from which Tailwind generates utilities. Get
the token layer right and everything else (dark mode, Figma sync, consistent
agents) follows from it. Get it wrong and utilities silently vanish or
resolve to the wrong values.

## The mental model

```css
@import "tailwindcss";

@theme {
  --color-surface: #18181b;   /* → bg-surface, text-surface, border-surface… */
  --font-display: "Inter";    /* → font-display */
  --text-hero: 3.5rem;        /* → text-hero */
  --radius-card: 0.75rem;     /* → rounded-card */
  --breakpoint-wide: 90rem;   /* → wide:* variants */
}
```

The namespace prefix decides which utilities a token generates: `--color-*`,
`--spacing-*`, `--font-*` (family), `--text-*` (size), `--radius-*`,
`--shadow-*`, `--breakpoint-*`, `--animate-*`. A token outside these
namespaces is still a fine CSS variable; it just generates nothing.

**`@theme` vs `:root` is a real decision, not a style choice.** Variables in
`:root` do not generate utilities. Put a token in `@theme` when you want
classes from it; keep it in `:root` when it's an implementation detail. Most
"my utility doesn't exist" bugs are a token defined in the wrong block.

## Semantic tokens and dark mode, the token-first way

Define primitives once, express meaning per mode in `:root`, and bridge with
`@theme inline` so utilities reference the live variable instead of a
snapshot of its value:

```css
:root {
  --surface: var(--zinc-50);
  --ink: var(--zinc-900);
}
.dark {
  --surface: var(--zinc-950);
  --ink: var(--zinc-100);
}

@theme inline {
  --color-surface: var(--surface);
  --color-ink: var(--ink);
}
```

Components write `bg-surface text-ink` once, with no `dark:` prefix anywhere.
The `inline` keyword matters: without it, the generated utilities can capture
the variable reference at the wrong scope and dark mode half-works. If you
need a class-based dark variant anyway (for one-off overrides), define it
explicitly:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

Scattering `dark:bg-zinc-950` through components is the same drift as
hardcoding hex: it moves a design decision out of the token layer and into
every call site.

## The traps

**Named spacing tokens can shadow the numeric scale.** v4 derives numeric
spacing utilities from one multiplier: `p-4` is `calc(var(--spacing) * 4)`,
`max-w-56` is `calc(var(--spacing) * 56)`. Two consequences:

- Removing or renaming `--spacing` kills every numeric spacing utility.
- A named token whose suffix looks like a scale number (`--spacing-56: 14rem`)
  shadows the numeric utility of the same name, and nearby numerics
  (`max-w-56` vs `max-w-64`) now resolve from different systems. This
  fails silently and looks fine until it doesn't.

Rule: keep `--spacing` intact, never name spacing tokens with bare numbers,
and when a one-off size is genuinely needed, prefer `max-w-[14rem]` or the
CSS-variable shorthand `max-w-(--my-width)` over inventing a numeric-looking
token.

**`@apply` in scoped style blocks needs `@reference`.** Inside Vue SFC
`<style>`, Svelte styles, or CSS modules, the compiler processes the block in
isolation and knows nothing about your theme. Point it at your stylesheet
first, or skip `@apply` and use the variables directly (cheaper, no compiler
dependency):

```css
@reference "../../app.css";
.button { @apply bg-surface rounded-card; }
/* or simply: */
.button { background: var(--color-surface); border-radius: var(--radius-card); }
```

**`theme()` is legacy.** In v4, reach for `var(--color-surface)` in CSS, not
`theme(colors.surface)`. Same for JS: read tokens off
`getComputedStyle(document.documentElement)` instead of importing a config.

**Opacity modifiers work on token utilities** (`bg-surface/50` compiles to
color-mix), including on arbitrary variables: `bg-(--brand)/20`. No need to
pre-generate alpha variants as separate tokens.

## Migrating from v3

Run `npx @tailwindcss/upgrade` on a clean branch and review its diff rather
than migrating by hand. What changes conceptually:

1. `@tailwind base/components/utilities` directives → one `@import "tailwindcss"`.
2. `theme.extend` → `@theme` tokens (extend semantics are the default:
   your tokens add to the built-in scales, same-name tokens override).
3. `content: [...]` globs → automatic source detection. Add `@source` lines
   only for paths it can't see (ignored dirs, external packages).
4. A JS config can be kept temporarily via `@config "./tailwind.config.js"`,
   but treat it as scaffolding to remove, not an end state.

After migrating, sweep for the traps above: `theme()` calls, `@apply` in
scoped blocks, and any spacing overrides. Then confirm the token layer is the
single source of truth: if the design values also live in a Figma variables
export or a W3C token JSON, generate the `@theme` block from that file in CI
instead of editing it by hand, so design and code can't drift apart.

If tokenlock (this catalog's enforcement plugin) is installed, it reads the
same `@theme` block this skill teaches you to build; its scanner is how the
token contract survives contact with day-to-day edits.
