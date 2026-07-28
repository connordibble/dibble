# plugin-inspector example

`broken-marketplace/` describes one plugin to both Claude Code and Codex. Its
skill directory is misplaced under `.claude-plugin/`, its Codex manifest points
to a missing hook file, and its duplicate Claude version fields disagree.

```bash
npx dibble plugin-inspector examples/plugin-inspector/broken-marketplace
```

Expect two errors, plus warnings for the version drift and missing README. The
authority inventory still renders so reviewers can see what the surviving
metadata declares.
