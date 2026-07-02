---
name: writing
description: Senior-level technical prose without the machine-writing tells. Use whenever writing or editing anything a human will read - READMEs, documentation, blog posts, release notes, PR descriptions, launch announcements, essays, marketing copy for developer tools - and whenever the user asks to "make this sound less AI", deslop, tighten a draft, or review writing. Also use before delivering any long-form prose you generated yourself, even if the user didn't ask for a review.
---

# Writing that a skeptical engineer trusts

Readers have learned the statistical tells of machine prose, and they discount
everything after detecting one. The first `delve` or `seamlessly integrates`
costs you the reader's trust for the rest of the document, no matter how good
the content underneath is. This skill is about removing the tells and, more
importantly, the habits that produce them.

The root cause of slop is not word choice. It is writing that performs
enthusiasm instead of presenting evidence. Fix that, and the banned words
mostly disappear on their own.

## Evidence over adjectives

Every claim of quality gets a number, an example, or a mechanism, or it gets
cut. This is the single highest-leverage rule.

- `Fast` → `cold start under 40ms`
- `Robust error handling` → `retries with backoff, and dead-letters anything
  that fails three times`
- `Battle-tested` → `has run in CI on ~200 builds/day since March`

When no evidence exists, do not soften the adjective; delete the claim. A
document that only says true things reads as confident. One that decorates
reads as selling.

Scope claims exactly. A pilot is not a rollout, "backed" is not "shipped",
and "used by the team" is not "used in production". Precise scoping reads as
seniority; inflation reads as marketing and invites the one question you
can't answer.

## The bans, and why

Run the bundled checker rather than memorizing lists — `scripts/sloplint.mjs`
in this skill's directory holds the patterns, in two tiers:

```bash
node <this-skill-directory>/scripts/sloplint.mjs draft.md            # certain tells fail
node <this-skill-directory>/scripts/sloplint.mjs --strict draft.md   # suspicious ones too
```

What the tiers mean when you're rewriting:

- **Certain** (`delve`, `game-changer`, `say goodbye to`, `let's dive in`):
  these never survive. There is no context in technical writing where they're
  the right choice.
- **Suspicious** (`robust`, `leverage`, `seamless`, `deep dive`): legitimate
  words that machine prose uses at 10x human rate. Keep one if it's doing real
  work; a document with several is telling on itself.
- **Constructions** count too: `not just X, but Y` as decoration, rhetorical
  questions as transitions, triads padded to three for rhythm, em dashes at
  high density. Each is fine once, as a deliberate choice. As a default
  rhythm, they read as generated.

When rewriting a flagged line, don't synonym-swap (`leverage` → `utilize`
fixes nothing). Ask what the sentence is claiming, find its evidence, and
write that instead.

Code blocks and inline code spans are exempt: they're verbatim material, not
your claims. So when quoting a banned phrase on purpose, put it in backticks.
For a whole line of plain prose that must keep one, append
`<!-- sloplint-ignore -->` and the checker skips that line.

## Cadence and structure

- **Lead with the finding.** The first paragraph answers "what happened" or
  "what is this"; background comes after, for readers who want it. If the
  reader stops after one paragraph, they should leave with the point.
- **Headings are claims, not categories.** "Retries made it worse" beats
  "Error handling". A reader skimming only headings should get the argument.
- **Vary sentence length, and mean it.** Machine prose settles into a metronome
  of medium sentences. A short sentence after a long run lands hard; use that,
  but rarely, or it becomes its own metronome.
- **Bullets are for enumerable facts** (options, steps, fields), not for
  prose that lost confidence. If the items are full paragraphs with narrative
  between them, they wanted to be paragraphs.
- **One idea per paragraph**, and the paragraph's first sentence is that idea.

## The revision procedure

Draft first, without self-censoring. Then three passes, in this order:

1. **Strip pass.** Remove every adjective and adverb that isn't load-bearing.
   Read what's left; most of it improved.
2. **Evidence pass.** For each remaining claim, attach the number, example, or
   mechanism. What can't be evidenced gets cut or explicitly scoped ("we
   haven't measured this").
3. **Lint pass.** Run sloplint. Fix certain findings by rewriting the claim,
   not by thesaurus. Read suspicious findings in context and keep only the
   ones that earn their place.

Then read it aloud once. Anything that sounds like a keynote, cut.

## Calibration

Before:

```text
This powerful tool seamlessly integrates with your existing workflow,
revolutionizing how teams leverage AI. It's not just a linter — it's a
paradigm shift in code quality.
```

After:

```text
It runs as a pre-commit hook and needs no configuration. In three months on
our main repo it caught 41 real bugs and flagged 9 false positives, all nine
from generated fixtures.
```

The first paragraph could describe any tool ever made, which is exactly why it
describes none. The second could only describe this one.
