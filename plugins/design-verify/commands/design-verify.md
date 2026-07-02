---
description: Verify the current UI change by running the responsive-smell linter, then rendering and critiquing the affected view at mobile and desktop widths.
---

Verify the UI I just changed actually looks right.

1. Run the responsive-smell linter on the changed files:
   `node ${CLAUDE_PLUGIN_ROOT}/skills/design-verify/scripts/responsive-smells.mjs $ARGUMENTS`
   (default to the files in the current diff if no path is given). Fix any
   findings in the source first.
2. Follow the `design-verify` skill's verification loop: render the affected
   view, screenshot at 375px and 1280px (and dark mode if theming applies),
   and critique against the checklist.
3. Fix any visual issues in the source, re-capture, and confirm they're gone
   with nothing regressed at the other width.
4. Show me the final screenshots as proof. Don't ask me to check manually.
