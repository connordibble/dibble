# receipts example

`postmortem.md` cites three footnotes against `sources/incident-log.txt`:
one quote is exact, one has been quietly reworded, one is fabricated.

```bash
npx dibble receipts examples/receipts/postmortem.md --base examples/receipts
```

Expect: `[^e1] ALTERED` (with the real source text shown), `[^e2] VERBATIM`,
`[^e3] UNSUPPORTED`, exit code 1. The ALTERED case is the interesting one —
it's the failure a human skim reviewer usually misses.
