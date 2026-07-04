# token-drift example

Run from the repo root:

```bash
npx dibble token-drift examples/token-drift/figma-export.tokens.json examples/token-drift/globals.css
```

Expected result: exit 1 with one `VALUE_DRIFT`, one `MISSING_IN_CODE`, and one
`ORPHAN_IN_CODE`. The `color.action.primary` alias resolves cleanly.
