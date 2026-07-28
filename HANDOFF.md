# Handoff / open follow-ups

State file for work that is known, scoped, and not yet done. Public repo, so
this is engineering follow-ups only; go-to-market lives in the gitignored
`LAUNCH.md`. Current release: `dibble@1.1.0` (11 plugins, Claude Code + Codex).

## Needs live verification (can't confirm from the dev box)

### 1. Host behavior beyond structural validation
All 11 current plugins were installed and enabled from an isolated local
marketplace with the Codex desktop CLI on 2026-07-27, then removed. The
marketplace, manifests, skills, and bundled hook files passed the live parser
and installer. Hook payload/output behavior remains covered by fixtures because
trusting and firing a hook requires an interactive `/hooks` review in a fresh
session.

Claude Code is not installed on this machine. `plugin-inspector` validates the
current documented marketplace, manifest, component, hook, MCP, LSP, workflow,
theme, monitor, user-config, channel, dependency, and bin contracts, but a live
`claude plugin validate --strict` run remains a release-machine check.

### 2. Plugin directory UI smoke test
`plugin-inspector` now follows the current OpenAI packaging reference for
`.agents/plugins/marketplace.json`, `.codex-plugin/plugin.json`, local/Git/npm
sources, hooks, MCP servers, app mappings, and assets. The structural fixtures
do not render the ChatGPT desktop Plugins Directory. Before release, refresh
the local marketplace and confirm the renamed plugin's title, prompts, category,
and installation flow in the live UI.

## Remaining catalog (plans are in docs/plans/)

11 of 21 catalog items shipped. The other 10 have complete, handoff-ready build
plans. Build order and rationale live in `docs/plans/README.md`; conventions in
`docs/plans/00-CONVENTIONS.md`.

**Tier A** (drop into this monorepo, no new repo/pipeline):
- `shadow-a11y` — a11y auditing for Shadow DOM / Web Components
- `contract-snap` — structural snapshots of LLM output across model versions
- `gitlab-pack` — GitLab MR/CI/release pack
- `agent-slo` — reliability budgets for agent jobs
- (`token-drift` from this tier already shipped)

**Tier B** (each its own repo + release pipeline, listed in the dibble
marketplace as external-source):
- `skillscan` — vet third-party skills/plugins before install (highest-upside
  security launch; build before Wave 2 if that launch is the priority)
- `skill-ci` — regression testing for skills (GitHub Action)
- `systemkit` — generate a project's design-system skill (the flagship)
- `signoff` — human review queue for agent output (CLI first, UI in v1.1)
- `media-timeline` — long-form video to structured timeline (FFmpeg/transcript
  deps; build last)

Design-first note for `contract-snap` and `agent-slo`: their input contracts are
squishier than the others. Write and freeze the fixture format (the run-summary
/ snapshot JSON shape) before writing implementation code.

## Smaller follow-ups

- **Plugin specs keep moving.** `plugin-inspector` warns on unknown fields
  instead of rejecting them. Re-check the official Claude and OpenAI plugin
  references when either host adds a new component or marketplace source.
- **`design-verify` screenshot loop** is inherently host-dependent (needs a
  browser-preview tool). It is documented as a partial exception in
  `docs/compatibility.md`; no code change needed, just don't promise it on
  headless CI.
- **Release commits are authored by `semantic-release-bot`**, not
  `dibbleconnor@gmail.com`. This matches the accepted pattern in `zod-ai-tool`
  and `agent-readiness-kit`, so it is intentional; noted here only so it is not
  re-flagged as a regression.

## How to verify the repo is healthy

```bash
pnpm validate      # Claude + Codex marketplace/plugin structure
pnpm lint:prose    # sloplint --strict on root/plugin READMEs + SKILL.md
pnpm lint:readmes  # root/plugin READMEs pass the readme auditor
pnpm test          # all plugin test suites (116 tests)
```
