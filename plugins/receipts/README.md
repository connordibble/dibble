# receipts

**An AI summary is fast, confident, and quietly unfalsifiable. `receipts` makes
it prove itself.**

A model reads your sources and writes a clean synthesis in seconds. Somewhere in
that synthesis, a hedge became a fact, one complaint became "users report," or a
quote drifted a few words from what was actually said. The reader who acts on it
inherits the drift. receipts fixes this by making every load-bearing claim carry
a verbatim quote linked to its source, then verifying the quotes are real.

```
$ node skills/receipts/scripts/check.mjs postmortem.md --base logs/

  ok    [^e1] VERBATIM
  FAIL  [^e2] ALTERED — closest text in source: "connection pool exhausted after 4m"
  FAIL  [^e3] UNSUPPORTED — no matching span in the cited source

  3 evidence item(s): 1 verbatim, 2 problem(s), 0 orphan(s), 0 unused.
  ALTERED means the quote was reworded from the source. Restore the exact words.
```

## Install

```
/plugin marketplace add connordibble/dibble
/plugin install receipts@dibble
```

Exit 1 on any unresolved citation, so it runs in CI on a reports or docs
directory. `--json` for tooling.

## The idea

Plain Markdown footnotes, nothing to learn:

```markdown
ECRM timeouts were the dominant complaint on the floor.[^e1]

[^e1]: "the ECRM screen just spins for 30 seconds" — sources/agent-0423.txt
```

The skill teaches the discipline (verbatim quotes, one quote per source,
aggregate claims need aggregate evidence). The checker enforces the part a
machine can: that the words in quotation marks actually appear in the file
cited.

## The clever bit: catching drift, not just fabrication

Anyone can grep for a missing quote. The failure that slips past human review is
the quote that got *reworded*: close enough to look right, different enough to
mean something else. receipts does a windowed similarity pass: if the exact
quote isn't found but a very similar span is, it reports **ALTERED** and shows
you the real text. That is the summary-drift failure made visible.

## Where it earns its place

Summaries whose reader can't cheaply re-derive them from the raw material:
incident postmortems, PR descriptions, research digests, customer-feedback
themes. For a throwaway paraphrase nobody will act on, it's overhead, and the
skill says so rather than performing rigor. This is the "summary is not the
evidence" principle from
[an essay on the topic](https://connordibble.dev/writing), turned into a tool.

Part of the [dibble](../../README.md) catalog. MIT.
