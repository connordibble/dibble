# marketplace-kit

**Half of "my plugin won't load" is a folder in the wrong place or a version
that doesn't match its pin. Neither throws an error. This finds both.**

marketplace-kit helps an agent build and maintain a Claude Code plugin
marketplace, and ships a validator that checks the structural invariants which
break installs and get community-marketplace submissions rejected.

```
$ node skills/marketplace-kit/scripts/validate-marketplace.mjs .

  FAIL  my-plugin: 'skills/' is inside .claude-plugin/ — move it to the plugin root
  FAIL  my-plugin: marketplace pins 1.2.0 but plugin.json is 1.1.0 (the top rejection cause)
  warn  other-plugin: no version — every commit becomes an update for installed users

  2 plugin(s): 2 error(s), 1 warning(s)
```

## Install

```
/plugin marketplace add connordibble/dibble
/plugin install marketplace-kit@dibble
```

Then run `/marketplace-kit:validate`, or ask to "set up a plugin marketplace."

## What the validator checks

- `marketplace.json` parses; name is kebab-case and not one of Anthropic's
  reserved names; owner is set
- every listed plugin exists, and every on-disk plugin is listed (no silent
  orphans)
- `plugin.json`: name matches its directory, kebab-case, description present,
  version is semver
- **version consistency** between the marketplace pin and `plugin.json` (the
  top submission-rejection cause)
- no `skills/`/`commands/`/`agents/`/`hooks/` misplaced inside `.claude-plugin/`
  (the silent-empty-plugin bug)
- every `SKILL.md` has frontmatter with a `description` (or it can never trigger)
- every `${CLAUDE_PLUGIN_ROOT}` hook script reference resolves to a real file

Exit 1 on errors, so it gates CI. `--json` for tooling.

## Dogfooded

This validator validates the marketplace that ships it. The
[dibble](../../README.md) catalog's CI runs
`validate-marketplace.mjs .` on every push, so the plugin that checks
marketplaces is proven against a real one on every commit. The skill also covers
the parts a script can't: the repo layout, the versioning discipline, and the
community-submission flow.

Part of the [dibble](../../README.md) catalog. MIT.
