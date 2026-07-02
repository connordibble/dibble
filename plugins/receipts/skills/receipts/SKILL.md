---
name: receipts
description: Evidence-linked summaries where every claim traces to a real quote. Use when synthesizing or summarizing source material - PR descriptions from diffs, incident postmortems from logs, research digests from papers, customer-feedback themes from transcripts, literature reviews - anywhere a reader might act on the summary and needs to trust it. Also use when asked to fact-check a summary against its sources, or when a receipts report flags altered or unsupported quotes.
---

# Receipts: the summary is not the evidence

A model-written summary is genuinely useful and genuinely untrustworthy at the
same time. It reads a pile of sources and produces a clean, confident synthesis
in seconds. The problem is that "plausible" and "supported" are different
properties, and a summary quietly lets one become the other: a hedge becomes a
fact, a single complaint becomes "users report," a paraphrase drifts a few
words from what was actually said. When someone acts on the summary, that drift
is the liability.

The fix is not to distrust summaries. It is to make every load-bearing claim
carry its receipt: a verbatim quote linked to the source it came from, checkable
by anyone (and by a script). This skill produces summaries in that form and
verifies them.

## The format

Plain Markdown footnotes. A claim that carries weight ends with a citation; the
citation resolves to a verbatim quote and its source:

```markdown
On the convention floor, ECRM timeouts were the dominant complaint.[^e1] The
same agents praised the new underwriting flow.[^e2]

[^e1]: "the ECRM screen just spins for 30 seconds" — sources/agent-0423.txt
[^e2]: "underwriting was the smoothest it's been in years" — sources/agent-0511.txt
```

Rules that make it trustworthy:

- **Quotes are verbatim.** Copy the exact words, inside quotation marks. If you
  need to trim, use an ellipsis; never silently reword. A reworded quote is the
  exact failure this skill exists to prevent.
- **One quote, one source.** If a claim rests on three sources, cite three
  pieces of evidence, not one that "represents" the others.
- **Aggregate claims need aggregate evidence.** "Most agents" requires either a
  count you can point at or several quotes; a single quote supports "one agent
  said," nothing more. Scope the claim to what the receipts actually show.
- **The synthesis is yours; the evidence is theirs.** Your prose can interpret,
  connect, and prioritize. The quotes stay exactly as the source wrote them, so
  a reader can see where your reading ends and the source begins.

## Verifying

The checker at `scripts/check.mjs` in this skill's directory confirms every
quote is real:

```bash
node <this-skill-directory>/scripts/check.mjs summary.md --base sources/
```

It classifies each citation:

- **VERBATIM**: the quote is in the source, exactly. Good.
- **ALTERED**: a close-but-reworded span exists in the source. Restore the
  exact words, or if you meant to paraphrase, drop the quotation marks and stop
  presenting it as a quote. This is the highest-value finding: it catches the
  drift a human reviewer skims right past.
- **UNSUPPORTED**: no matching span. The quote is not in that source; you have
  the wrong source or the quote is invented.
- **NO SOURCE**: the cited file does not exist.

It also flags citations referenced but never defined, and evidence defined but
never cited. Exit 1 on any problem, so it runs in CI on a docs or reports
directory. Run it before delivering any synthesis a reader will act on.

## When to reach for this

Any summary whose reader can't cheaply re-derive it from the raw material:
postmortems (a claim about what failed drives the fix), PR descriptions (the
reviewer trusts your account of the diff), research and feedback synthesis (the
whole point is that nobody else read all the sources). For a quick internal
paraphrase nobody will act on, this is overhead; say so and skip it rather than
performing rigor.

The deeper habit the format teaches: write the synthesis, then ask of each
sentence a reader might act on, "what's the receipt?" If there isn't one, the
sentence is a hypothesis, and it should either get its evidence or be written as
the open question it actually is.
