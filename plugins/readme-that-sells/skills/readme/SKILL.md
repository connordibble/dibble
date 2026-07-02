---
name: readme
description: Write and audit READMEs and launch copy for developer tools that convert a skimmer into a user. Use when writing or rewriting a README, a project landing page, a package description, a Show HN or Product Hunt post, or launch-day copy for a library, CLI, plugin, or dev tool. Also use when asked why a project isn't getting traction, stars, or installs, or when a readme audit flags missing structure.
---

# A README is a conversion funnel

A developer landing on your README decides in about fifteen seconds whether to
keep reading or close the tab. They are asking three questions in order: what is
this, does it work, and can I try it right now. A README that answers those fast,
in that order, converts. One that opens with a paragraph of positioning loses
the reader before the good part.

This skill is about structure and honesty, not polish. Run the auditor for the
structural checks; use the judgment below for the rest.

## The first screen carries the whole thing

Everything that decides adoption happens above the fold. In the first ~40 lines,
a reader should hit all four:

1. **What it is, in one sentence.** Directly under the title. Name the thing and
   who it's for: "Turns your logs into flamegraphs in one command, for Node
   services." Not "A powerful observability solution." The concrete sentence
   could only describe your tool; the abstract one describes a thousand.
2. **Proof it works.** A code block showing real usage or real output, early.
   Developers trust a visible example over any amount of description. Show the
   command and what it prints, not a feature list.
3. **How to install.** The actual command, copy-pasteable, in the first screen.
   If a reader has to scroll to find `npm install`, you have added friction at
   the exact moment they were ready to try it.
4. **Honest scope.** Not on the first screen, but present: a short "Limitations"
   or "What it does not do" section. Naming the edges reads as senior, preempts
   the top issue, and builds more trust than any feature can.

Run the structural audit:

```bash
node <this-skill-directory>/scripts/audit-readme.mjs README.md
```

It fails on the load-bearing misses (no early install, no early example) and
warns on the softer ones (hype opener, missing scope section). Exit 1 on
failures, so it runs in CI.

## The opening line is the whole pitch

Spend real effort on the sentence under the title; it does more work than the
rest of the README combined. Test it against one question: could this sentence
describe a competitor? If yes, it's too vague. Replace adjectives with what the
tool does and, where you have one, a number ("catches ~40 classes of bug",
"cold start under 40ms"). The [no-slop](../no-slop) writing skill covers this
evidence-over-adjectives habit in depth, and it applies hardest here.

Ban the hype words that make developers distrust you on sight: `revolutionary`,
`powerful`, `blazing fast`, `seamless`, `cutting-edge`, `game-changer`. They
signal marketing, and marketing signals the substance can't stand on its own.

## Structure that holds attention

- **Hero example before feature list.** Show one real, complete use before you
  enumerate capabilities. The example teaches faster than the list and proves
  the tool is real.
- **Comparison, when you have a rival.** If people will ask "why not use X,"
  answer it in a sentence or a small table. Don't dodge the comparison; owning
  it is more credible than pretending the alternative doesn't exist.
- **Scope section near the end.** State what it doesn't do, its known limits,
  and where it's the wrong tool. This is the highest-trust paragraph in the
  document precisely because most READMEs omit it.
- **One clear install path first.** List alternate install methods after the
  primary one, not interleaved. A reader wants one obvious way to start.

## For a launch post (Show HN, Product Hunt, Reddit)

The same funnel, compressed. Lead with the one-sentence what-it-is and a link to
a 20-second demo (a clip or a code block). Say plainly what problem drove you to
build it and what it does not solve yet. Developers upvote honesty and working
demos; they scroll past adjectives. Never open with "I'm excited to announce."
Open with the problem or the demo.

The through-line: respect the reader's time and skepticism. Show, scope
honestly, and make the first move theirs to take in one command.
