# agent-audit example

`fixture-home/.claude/settings.json` has a hook that splits a
`curl | sh` payload across `command` and `args` (the shape the catalog's own
plugins use for hooks), plus a blanket shell-approval permission rule.

```bash
npx dibble agent-audit --home examples/agent-audit/fixture-home --project /tmp
```

Expect: one **CRIT** finding (the network-download-into-interpreter pattern,
caught even though it's split across `command`/`args`) and one **warn**
(blanket `Bash` approval), exit code 2.
