# marketplace-kit example

`broken-marketplace/` has two of the classic marketplace bugs: its `greeter`
plugin's `skills/` directory is nested inside `.claude-plugin/` (where the
loader ignores it, so the plugin looks empty with no error), and the
marketplace pins `2.0.0` while `plugin.json` says `1.0.0`.

```bash
npx dibble validate-marketplace examples/marketplace-kit/broken-marketplace
```

Expect: 2 errors (the misplaced `skills/` directory, the version mismatch)
and 2 warnings (missing description, missing README), exit code 1. This
catalog's own `dibble` repo runs the same command against itself in CI —
see [../../README.md](../../README.md).
