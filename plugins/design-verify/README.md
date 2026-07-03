# design-verify

**Generated UI compiles, passes types, and still looks broken at 375px. The diff
never shows it. A screenshot does.**

design-verify closes the loop between "the code changed" and "the UI is right":
a static linter for the mobile-overflow bugs, then a render-critique-fix-recheck
workflow that ends in screenshots, not assurances.

```
$ node skills/design-verify/scripts/responsive-smells.mjs src/components/Card.tsx

  src/components/Card.tsx:14  [fixed-width] w-[640px] — exceeds a 375px viewport; use max-w-* or a responsive width
  src/components/Card.tsx:22  [tiny-text] text-[10px] — below comfortable mobile legibility (~12px floor)
  src/components/Card.tsx:31  [fixed-height] h-[120px] — clips content when text wraps at narrow widths; prefer min-h-*

  3 responsive smell(s) across 1 file(s). Verify these at 375px in the browser.
```

## Install

```
/plugin marketplace add connordibble/dibble
/plugin install design-verify@dibble
```

Then run `/design-verify:verify` after a UI change, or just ask to "check how
this looks."

## Two layers

- **The linter** (`responsive-smells.mjs`) is the cheap static pass: large fixed
  widths without `max-width`, `w-screen`/`100vw` overflow, sub-12px text, fixed
  pixel heights on content containers. Each finding names why it breaks at
  375px. Exit 1 under `--strict`, so it gates CI. It runs before you start a
  browser and points the visual pass at the risky lines.
- **The skill** is the loop a script can't do: render the view, capture at 375px
  and 1280px (and dark mode), critique against an explicit checklist (overflow,
  spacing rhythm, hierarchy, alignment, contrast, tap targets, state
  completeness), fix the source, re-capture, and show proof.

## Why a checklist, not vibes

"The card looks off" produces a vague fix. The skill forces precise critique:
"at 375px the title wraps to three lines and overflows its fixed `h-[120px]`,
clipping the last line" points straight at the change. Every observation ties to
an element, a width, and the CSS responsible.

## Scope

This verifies visual and responsive quality, not accessibility conformance or
correctness — pair it with an a11y audit and tests. For non-visual changes it's
overhead, and the skill says to skip it there. It complements
[tokenlock](../tokenlock): tokenlock keeps the colors on-system at write time,
design-verify confirms the whole thing renders right.

Part of the [dibble](../../README.md) catalog. MIT.
