# readme-that-sells example

`bad-README.md` is a realistic first draft: hype opener, background section
before any proof, no install command, no code example, no scope section.

```bash
npx dibble readme-audit examples/readme-that-sells/bad-README.md
```

Expect: 2 failing checks (no install / no code example in the first screen)
and 2 warnings (hype opener, no scope section), exit code 1.
