# no-slop example

`draft.md` is written in the register the checker exists to catch: stock
intros, hype adjectives, unfalsifiable claims, an audience-pandering
construction, false excitement.

```bash
npx dibble sloplint --strict examples/no-slop/draft.md
```

Expect: 7 certain-tier findings, 2 suspicious, exit code 1.
