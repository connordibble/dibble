# tokenlock

**Your agent knows the project has design tokens. It writes `bg-zinc-900` anyway.**

tokenlock is a design-token guardrail for coding agents. Every time the agent
writes or edits a file, a hook scans it for hardcoded colors and raw Tailwind
palette utilities. Violations go straight back to the agent — with the *right*
token suggested by value, straight from your own token files — and it corrects
its own drift before you ever see it.

```
tokenlock: 2 design-token violations in src/components/Card.tsx

    12  bg-zinc-900/80       → use a token-mapped utility instead of the raw Tailwind palette
    14  #18181b              → var(--color-surface) or the mapped utility (e.g. bg-surface) — defined in src/app/globals.css:2

Colors must come from the project's design tokens.
```

## Why

Models are trained on millions of files full of `bg-zinc-900` and `#333`, so
that's what they write — even when your CLAUDE.md says not to, even when the
token is one file away. Instructions decay over a long session; hooks don't.
tokenlock moves token discipline from "please remember" to "deterministically
checked on every write."

## Install

```
/plugin marketplace add connordibble/dibble
/plugin install tokenlock@dibble
```

Zero config to start: tokenlock finds your token files automatically
(`globals.css`, `tokens.css`, `theme.css`, `*.tokens.css`) and runs in
`correct` mode. Add `.tokenlock.json` at the project root to tune it —
see [the skill reference](skills/tokenlock/SKILL.md#configuration).

## What it catches

| Violation                  | Example                        | Response                                   |
| -------------------------- | ------------------------------ | ------------------------------------------ |
| Hardcoded hex              | `#18181b`                      | Suggests the token whose value matches     |
| Raw palette utilities      | `bg-zinc-900/80`, `text-red-500` | Points at your token-mapped utilities    |
| Arbitrary color utilities  | `bg-[#ff0000]`                 | Value-matched token, or "add one first"    |
| Color function literals    | `rgb(250, 250, 250)`, `oklch(…)` | Normalized value matching (comma/space-insensitive) |

Token definition files themselves are exempt, and so are Next.js metadata
images (`opengraph-image.tsx`, `apple-icon.tsx`, …) — they render through
Satori where CSS custom properties can't resolve, so hardcoded values there
are correct, not drift. `#fff`, `#000`, `transparent`, and friends are allowed
by default (strict shops: override `allowValues`). Escape hatch:
`/* tokenlock-ignore */` on the line.

## One scanner, three surfaces

The same `scan.mjs` runs as:

1. **Agent hook** — PostToolUse on every Write/Edit, self-correcting loop
2. **Repo audit** — `node skills/tokenlock/scripts/scan.mjs src/` for existing drift
3. **CI gate** — exits 1 on violations; `--json` for tooling

So the rule that governs your agent is the same rule that governs your CI —
one definition of "clean," no divergence between what the agent is told and
what the pipeline enforces.

## Other agents (Codex, Cursor, Gemini CLI)

The skill and scanner follow the [Agent Skills](https://agentskills.io) layout:
everything lives in `skills/tokenlock/`, including `scripts/scan.mjs`. Copy
that directory into your tool's skills location and the audit workflow works
as-is. The automatic per-edit hook is Claude Code-specific.

## Limitations, honestly

- Line-based scanning: a hex value split across lines or built by string
  concatenation won't be caught. This catches drift, not adversaries.
- `.ts`/`.js` files aren't scanned by default (too many non-color hex strings —
  hashes, IDs). Opt in via `extensions` if your styles live there.
- Suggestions are exact-value matches. `#18181c` won't suggest the token for
  `#18181b` — nearest-color matching guesses at design intent, and a wrong
  confident suggestion is worse than none.

Part of the [dibble](../../README.md) catalog. MIT.
