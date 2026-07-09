# Handoff / open follow-ups

State file for work that is known, scoped, and not yet done. Public repo, so
this is engineering follow-ups only; go-to-market lives in the gitignored
`LAUNCH.md`. Current release: `dibble@1.1.0` (11 plugins, Claude Code + Codex).

## Needs live verification (can't confirm from the dev box)

### 1. Codex hook enforcement, end to end
The tokenlock and install-gate hooks are wired for Codex and unit-tested
against the documented payload shapes, but have not been run inside a live
Codex install. Confirm on real Codex:
- Installing the plugin from the `dibble` Codex marketplace registers the
  bundled `hooks/hooks.json`.
- tokenlock's PostToolUse hook fires on a Codex `apply_patch` edit and the
  correction reaches the model. The matcher is `Write|Edit|apply_patch` and the
  hook reads the file path from either `tool_input.file_path` (Claude) or an
  `apply_patch` patch envelope (`*** Update/Add File:`); verify Codex's actual
  `apply_patch` `tool_input` matches one of those shapes. If Codex nests the
  patch under a different key, extend `hookFilePaths()` in
  `plugins/tokenlock/skills/tokenlock/scripts/scan.mjs`.
- install-gate's PreToolUse hook fires on a Codex `Bash` install and the
  deny/ask decision is honored.
- `${CLAUDE_PLUGIN_ROOT}` resolves in Codex (docs say it is supported for
  compatibility; if not, switch the hook commands to `${PLUGIN_ROOT}` or add a
  fallback).

### 2. Codex marketplace sidecar schema
`scripts/validate-codex-plugins.mjs` encodes an assumed schema for
`.agents/plugins/marketplace.json` and `.codex-plugin/plugin.json` (source
type `local`, `policy.authentication: ON_INSTALL`, the `interface` field set,
etc.). This validates green against itself but was not checked against OpenAI's
current build-plugins spec. Verify field names, required values, and the
sidecar path against the live Codex docs, then reconcile the validator. If the
schema differs, the Codex layer will validate locally but fail to load in
Codex.

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

- **Codex validator not in the readme/prose gates.** `pnpm validate` runs it,
  but consider whether the Codex sidecar deserves its own smoke test the way
  the Claude marketplace is dogfooded by `marketplace-kit`.
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
pnpm test          # all plugin test suites (99+ tests)
```
