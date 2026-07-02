# readme-that-sells

**A developer decides in fifteen seconds whether to try your tool. Most READMEs
spend those seconds on positioning instead of proof.**

readme-that-sells helps an agent write developer-tool READMEs and launch copy
around the funnel that actually converts (what is this → does it work → can I try
it now), and ships an auditor that measures whether your first screen answers
those questions.

```
$ node skills/readme/scripts/audit-readme.mjs README.md

  ok    has a title
  ok    one-line value proposition near the top
  FAIL  install instructions in the first screen
          install command is at line 72; move it into the first ~40 lines
  ok    a code example in the first screen
  warn  states its scope or limitations honestly
          add a short 'Limitations' section; naming the edges reads as senior

  1 failing, 1 warning. Fix the failures: they're the difference between
  a reader trying it and bouncing.
```

## Install

```
/plugin marketplace add connordibble/dibble
/plugin install readme-that-sells@dibble
```

## What it checks

The auditor measures structure a great README almost always has, as line-number
facts rather than opinions:

- a title and a one-sentence value proposition up top
- an install command **in the first screen** (time-to-install)
- a code example **in the first screen** (time-to-first-proof)
- an opening line free of hype words developers distrust
- an honest scope or limitations section

Failures are the load-bearing misses; warnings are the softer ones. Exit 1 on
failure, so it gates docs in CI. `--json` for tooling.

## Structure the script can't judge

The auditor checks that the pieces are present and early; the skill covers
whether they're any good: writing the one-sentence pitch that could only
describe your tool, owning the comparison to the obvious alternative, and
compressing the whole funnel into a Show HN post. It pairs with
[no-slop](../no-slop) for the prose itself.

This README passes its own auditor, and so does every other README in this
catalog; that's the CI check. Part of the [dibble](../../README.md) catalog. MIT.
