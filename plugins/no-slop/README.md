# no-slop

**Readers now recognize machine prose on sight. One `delve` and they discount
everything after it.**

no-slop is a writing plugin with three parts:

1. **`no-slop:writing`**: a technical-writing skill built around one rule,
   evidence over adjectives. Every quality claim gets a number, an example, or
   a mechanism, or it gets cut. Covers cadence, structure, and the revision
   procedure that removes the tells instead of synonym-swapping them.
2. **`sloplint`**: a deterministic checker for the phrases and constructions
   that mark generated text, in two tiers: *certain* (zero false positives in
   technical writing) and *suspicious* (fine once, a tell in bulk). Runs on
   drafts, runs in CI.
3. **`no-slop:voice`**: extracts a personal voice skill from samples of your
   real writing, with a hard guard against horoscope rules. Every rule in the
   generated skill must quote your samples as evidence.

## Install

```
/plugin marketplace add connordibble/dibble
/plugin install no-slop@dibble
```

## The checker

```
$ node skills/writing/scripts/sloplint.mjs draft.md

  SLOP  draft.md:3   "delve" — the canonical LLM tell
  SLOP  draft.md:12  "seamlessly integrates" — the claim every broken integration makes
  susp  draft.md:15  "robust" — fine once; a tell in bulk

  2 certain, 1 suspicious. Rewrite before publishing.
```

The list is deliberately conservative. A linter that cries wolf gets
disabled; a short list people trust gets run. Exit 1 on certain findings, so
the same command works as a CI gate on your docs:

```yaml
- run: node skills/writing/scripts/sloplint.mjs --strict docs/*.md README.md
```

`--json` for tooling. Code blocks and inline code are exempt (they're
verbatim material, not your claims), so quoting a banned phrase in backticks
is the natural escape hatch. This repo's own READMEs pass in `--strict` mode,
and that is enforced in its CI.

## Why a skill and a script

Word lists catch the symptoms. The skill treats the cause: writing that
performs enthusiasm instead of presenting evidence. The revision procedure it
teaches (strip pass, evidence pass, lint pass) removes slop that no list can
name, and its calibration examples show the difference between a paragraph
that could describe any tool and one that could only describe yours.

## The voice extractor

Generic instructions produce generic prose. A voice is concrete: how you
open, what you ban, where sentences land. `no-slop:voice` reads 3+ samples of
your writing, analyzes seven dimensions with quoted evidence, generates a
`<you>-voice` SKILL.md from a template, then calibrates it against you before
handing it over. The output is a portable Agent Skill that works in every
tool reading SKILL.md.

## Scope, honestly

sloplint is a tripwire, not a judge. Its list stays short on purpose, and
passing it does not make writing good; the skill's evidence rules are where
the real work happens. Style rules in the skill body are prescriptive
defaults for technical writing. If your voice legitimately uses em dashes or
long triads, the voice extractor is the tool that captures that, and it wins
over the defaults.

Part of the [dibble](../../README.md) catalog. MIT.
