---
name: design-verify
description: Verify UI changes actually look right by driving a browser and critiquing what renders, instead of assuming the code is correct. Use after implementing or editing any UI - a component, a page, a layout, a style change - and whenever asked to check responsive behavior, mobile layout, visual regressions, or "does this look okay". Especially use before calling frontend work done: generated markup compiles and still looks broken at 375px.
---

# Verify the pixels, not the code

Generated UI compiles, passes types, and still looks wrong: text overflows at
mobile width, spacing is uneven, a button sits half off-screen, contrast is too
low to read. None of that shows up in the diff. The only way to know a UI change
is right is to render it and look. This skill closes that loop: render, capture,
critique against explicit criteria, fix, re-check.

## Step 0: the cheap static pass first

Before starting a browser, run the responsive-smell linter. It catches the
mobile-overflow class of bugs statically and tells the visual pass where to
look:

```bash
node <this-skill-directory>/scripts/responsive-smells.mjs src/components/Thing.tsx
```

It flags large fixed widths, viewport-width sizing, sub-12px text, and fixed
heights on content containers, each with the reason it breaks at 375px. Fix
what it finds, then verify visually.

## The verification loop

Use the environment's browser-preview tools (in Claude Code, the `preview_*`
tools; elsewhere, a Playwright/Puppeteer screenshot). Never ask the user to
check manually; verify and show proof.

1. **Render.** Ensure the dev server is running and navigate to the changed
   view. Reload if hot-reload didn't already.
2. **Capture at two widths.** Screenshot at **375px** (mobile, the width most
   generated UI breaks at) and **1280px** (desktop). If theming is in play,
   capture light and dark.
3. **Critique against the checklist** (below), not vibes. Name each issue with
   the element and the width it happens at.
4. **Fix the source** for each issue. Do not patch the screenshot or hand-wave;
   change the code.
5. **Re-capture and compare.** Confirm the specific issue is gone and nothing
   regressed at the other width. Loop until the checklist passes.
6. **Show proof.** Share the final screenshots (or the specific before/after)
   so the user sees the result rather than taking your word.

## The critique checklist

Read each screenshot against these, at each width:

- **Overflow.** Anything clipped, cut off, or forcing horizontal scroll? The
  most common generated-UI failure, and it lives at 375px.
- **Spacing rhythm.** Is padding/margin consistent, or does one element crowd
  its neighbor while another floats in space? Uneven gaps read as broken.
- **Hierarchy.** Can you tell the primary action from the secondary at a glance?
  Is heading/body/caption sizing distinct and ordered?
- **Alignment.** Do edges line up on a grid, or does content drift a few pixels
  off from the element above it?
- **Contrast and legibility.** Is text comfortably readable on its background?
  Are tap targets big enough (roughly 44px) on mobile?
- **State completeness.** If the view has empty, loading, or error states, do
  they render, or only the happy path?
- **Alignment to the design system.** Do colors, radii, and spacing match the
  project's tokens rather than ad-hoc values? (The
  [tokenlock](../tokenlock) plugin enforces this at write time.)

## When something's wrong, describe it precisely

Vague critique produces vague fixes. "The card looks off" is useless; "at 375px
the card title wraps to three lines and overflows its fixed h-[120px], clipping
the last line" points straight at the fix. Tie every observation to an element,
a width, and the CSS responsible.

## Don't overdo it

For a one-line copy change or a non-visual refactor, this loop is overhead; skip
it. Reserve it for changes that alter layout, spacing, sizing, color, or
responsive behavior, which is where looking beats assuming.
