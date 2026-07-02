---
name: tokenlock
description: Design-token discipline for styling work. Use whenever writing or editing UI styling in a project that has design tokens (CSS custom properties, a globals.css/tokens.css, or a Tailwind @theme block), whenever a tokenlock violation report appears after an edit, when asked to audit a codebase for token drift or hardcoded colors, or when configuring tokenlock itself. Also use when choosing between similar tokens or deciding whether a new token should be added.
---

# tokenlock: working in a token-governed codebase

This project enforces design tokens. A scanner checks every file you write for
hardcoded colors and raw Tailwind palette utilities, and reports violations
back to you. This skill explains how to work so those reports rarely appear,
and how to resolve them correctly when they do.

## Why this is enforced

A design token is a contract: `--color-surface` means "the surface color,
wherever the design team takes it next." A hardcoded `#18181b` means "whatever
this happened to be the day it was written." The two look identical in a diff
and render identically today; the difference only shows up months later, when
the palette changes and 40 hardcoded copies don't. Agents make this worse at
scale: training data is full of `bg-zinc-900`, so drift is the default output
unless something pushes back. tokenlock is that push-back.

## Resolving a violation report

The report names the violation and, when a token's value matches, suggests it
with its definition site. Resolve in this order:

1. **Prefer the semantically right token over the value match.** The scanner
   matches by value; you can match by meaning. If the report suggests
   `--color-surface` but the element is a border, check the token file for a
   border token first. A value-matched but semantically wrong token is drift
   with extra steps: it breaks the first time the two tokens diverge.
2. **If no token fits, add one — in the token file, not inline.** Define it
   alongside its siblings with a semantic name (`--color-warning-border`, not
   `--color-yellow-2`), then reference it. Never scatter the raw value and
   move on; that converts one report into a future migration.
3. **In Tailwind projects, use the mapped utility form** (`bg-surface`) when
   the project maps tokens through `@theme`, and `var(--token)` in plain CSS.
   Match whichever form the surrounding code already uses.
4. **Only suppress with evidence.** `/* tokenlock-ignore */` on a line is for
   values that are genuinely not design decisions (a canvas fallback, a
   third-party API constant). Leave a short comment saying why, or the next
   reader will "fix" it back.

Do not work around the scanner by moving a hardcoded value into a variable
with a local name; the value still bypasses the token contract.

## Auditing a whole codebase

The scanner lives at `scripts/scan.mjs` inside this skill's directory. Run it
directly for a full-repo sweep, not just the hook's per-edit check:

```bash
node <this-skill-directory>/scripts/scan.mjs src/          # human report
node <this-skill-directory>/scripts/scan.mjs --json src/   # machine-readable
```

Exit code 1 means violations were found, so the same command works as a CI
gate. When asked to "clean up token drift," run the audit first, group the
results by token (not by file), and fix one token's occurrences at a time;
that keeps each change reviewable and reveals which missing tokens to add.

## Configuration

`.tokenlock.json` at the project root. All fields optional:

| Field         | Default                                  | Meaning                                            |
| ------------- | ---------------------------------------- | -------------------------------------------------- |
| `mode`        | `"correct"`                              | `correct` (report as error), `warn` (report as context), `off` |
| `tokenFiles`  | auto-discovered (globals/tokens/theme.css) | Where token definitions live                       |
| `allowValues` | `#fff`, `#000`, `transparent`, …         | Raw values permitted anywhere (replaces defaults)  |
| `extensions`  | css, scss, tsx, jsx, vue, svelte, astro, html | File types scanned                            |
| `ignore`      | node_modules, dist, build, …             | Directories skipped (additive)                     |

When setting tokenlock up in a new project, point `tokenFiles` at the real
token source explicitly rather than relying on auto-discovery: it makes the
suggestion engine exact and the configuration reviewable.
