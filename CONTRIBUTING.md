# Contributing

## Commit messages

This repo releases with [semantic-release](https://github.com/semantic-release/semantic-release),
so commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
and directly determine the published version:

- `fix: ...` → patch release
- `feat: ...` → minor release
- `feat!: ...` or a `BREAKING CHANGE:` footer → major release
- `docs:`, `chore:`, `ci:`, `test:`, `refactor:` → no release

One-line subjects, imperative mood. The changelog is generated from these
messages, so write the subject for a reader of CHANGELOG.md, not for yourself.

## Releases

Merging to `main` runs CI (marketplace validation, strict prose lint, README
audits, tests on Node 20/22/24). When CI passes, the `release` job runs
semantic-release, which:

1. computes the next version from the commits since the last tag
2. writes CHANGELOG.md and bumps `package.json`
3. syncs the version into every `plugins/*/.claude-plugin/plugin.json`
   (`scripts/sync-versions.mjs`), so the marketplace catalog and the npm
   package always carry the same version
4. publishes `dibble` to npm with provenance
5. tags, creates the GitHub release, and commits the changelog back

Never edit versions by hand; the pipeline owns them.

## Adding or changing a plugin

Each plugin is self-contained under `plugins/<name>/`: manifest in
`.claude-plugin/plugin.json`, skills in `skills/<skill>/SKILL.md`, deterministic
logic as zero-dependency Node scripts inside the skill directory, tests in
`tests/*.test.mjs`, and a README. Before pushing, run the same gate CI runs:

```bash
pnpm validate       # marketplace + plugin structure
pnpm lint:prose     # sloplint --strict on all READMEs and SKILL.md files
pnpm lint:readmes   # every README passes the readme-that-sells auditor
pnpm test           # all plugin test suites
```

House rules the tooling enforces: scripts stay dependency-free (hooks run on
user machines), every hook has a timeout, every skill frontmatter has a
description, and the repo's own prose passes its own linters.
