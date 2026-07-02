---
name: marketplace-kit
description: Build, validate, and maintain a Claude Code plugin marketplace repo. Use when creating a marketplace to distribute plugins, adding a plugin to an existing marketplace, preparing a plugin for submission to the community marketplace, debugging why a marketplace or plugin won't load or install, or setting up CI to validate a marketplace. Also use when a validate-marketplace report flags a structural problem.
---

# Shipping a plugin marketplace that installs cleanly

A plugin marketplace is a git repo with a `marketplace.json` catalog and one
directory per plugin. Most of what goes wrong is structural and silent: a
component folder in the wrong place, a version that doesn't match its pin, a
skill with no description. This skill covers the layout and validates it with a
script so the failures surface before a user (or the community review pipeline)
hits them.

## The layout

```
your-marketplace/
├── .claude-plugin/
│   └── marketplace.json         # the catalog; lists every plugin
├── plugins/
│   ├── my-plugin/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json       # ONLY plugin.json goes in here
│   │   ├── skills/<name>/SKILL.md
│   │   ├── hooks/hooks.json      # optional
│   │   ├── commands/<name>.md    # optional
│   │   └── README.md
│   └── ...
└── README.md                     # catalog landing page
```

The single most common mistake: putting `skills/`, `commands/`, `agents/`, or
`hooks/` **inside** `.claude-plugin/`. The loader only reads those at the plugin
root; nested under `.claude-plugin/` they are silently ignored, and the plugin
looks empty with no error. Only `plugin.json` lives in `.claude-plugin/`.

## marketplace.json essentials

- **`name`** is public and permanent: users type it in every install
  (`/plugin install foo@your-name`). Kebab-case, and not one of Anthropic's
  reserved names (the validator has the list). Each user can register only one
  marketplace per name.
- **`metadata.pluginRoot`** (e.g. `"./plugins"`) lets each entry use a short
  `"source": "my-plugin"` instead of `"./plugins/my-plugin"`.
- A plugin `source` may be a **local path** or an **external repo**
  (`{ "source": "github", "repo": "you/other" }`), so one marketplace can front
  plugins that live in their own repositories.

## Versioning is where installs break

Set an explicit `version` (semver) in each `plugin.json`. Users receive an
update only when it changes; omit it and every commit counts as a new version.
If you also pin a `version` in the marketplace entry, it **must** match the
plugin's own `plugin.json` — a mismatch is the top reason the community
marketplace rejects a submission. Keep the manifest version, the marketplace
pin (if any), and your git tag in lockstep.

## Validate before every push

```bash
node <this-skill-directory>/scripts/validate-marketplace.mjs .
```

It checks the whole repo: marketplace.json validity and a non-reserved
kebab-case name, that every listed plugin exists and every on-disk plugin is
listed, plugin.json name/description/semver, version consistency, no misplaced
component directories, SKILL.md frontmatter with a description, and that hook
script references resolve. Exit 1 on errors. Wire it into CI so a broken
catalog never reaches `main`:

```yaml
- run: node plugins/marketplace-kit/skills/marketplace-kit/scripts/validate-marketplace.mjs .
```

## Submitting to the community marketplace

Before submitting, run the validator clean, confirm `plugin.json` version
matches your latest git tag, and make sure each plugin has a README (its landing
page). Anthropic's review runs its own structural check and automated safety
screening, then pins your plugin to a commit SHA. The public catalog syncs
periodically, so allow a delay between approval and the plugin appearing. Submit
through the in-app form (claude.ai directory settings or the Console), not by PR.

## Adding a plugin to an existing marketplace

Create the plugin directory under `pluginRoot`, add its `.claude-plugin/plugin.json`,
add one entry to `marketplace.json`, and validate. Because users already added
your marketplace, the new plugin shows up in their `/plugin` browser on the next
`/plugin marketplace update` with no new install step on their side. That is the
compounding advantage of one marketplace over many scattered repos: every plugin
you add inherits the audience of the ones before it.
