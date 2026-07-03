# Plan: gitlab-pack (Tier A, dibble monorepo)

> Read [00-CONVENTIONS.md](../00-CONVENTIONS.md) first.

## One-line pitch

A GitLab-native plugin for coding agents: merge-request review prep, CI
pipeline log triage, and release/tag workflows — for the large enterprise
GitLab audience the entire plugin ecosystem ignores in favor of GitHub.

## Why it stands out / why Connor

Every plugin and skill assumes GitHub (`gh` CLI, GitHub Actions, PR language).
Enterprise GitLab shops are numerous, underserved, and loyal once served.
Connor shipped design systems through GitLab CI/CD at State Farm (see `sfds`
stack: "GitLab CI/CD"), so the workflow is lived, not guessed. Low glamour,
real adoption, little competition.

## The clever differentiator

**Works offline against `glab` CLI output and CI log files — no GitLab API
token required for the core value.** Most integrations demand API auth up
front. gitlab-pack's checkers operate on: the diff the agent already has, a
pasted/exported CI job log, and local git state. The `glab` CLI (GitLab's
official tool) is used when present for richer context, but the failing-job
triage and MR-description generation work on plain text a user can paste. This
keeps it installable and demoable with zero setup.

## Deliverables (file tree)

```
plugins/gitlab-pack/
├── .claude-plugin/plugin.json
├── skills/
│   ├── mr-review/SKILL.md                 # prep an MR: description, checklist, risk notes
│   ├── ci-triage/
│   │   ├── SKILL.md
│   │   └── scripts/triage-log.mjs         # parse a failed GitLab CI job log → root-cause summary
│   └── gitlab-release/SKILL.md            # tag + release notes workflow, semantic-release-aware
├── commands/
│   ├── mr.md                              # /gitlab-pack:mr  — prepare a merge request
│   └── ci.md                              # /gitlab-pack:ci  — triage the last failed pipeline
├── tests/triage-log.test.mjs
└── README.md
examples/gitlab-pack/
├── failed-job.log                         # a realistic failing GitLab CI job log
└── README.md
```

Three skills (this is a *pack* — mirrors gstack's multi-skill shape), one
deterministic script (`triage-log.mjs`), and two commands. `mr-review` and
`gitlab-release` are knowledge-only skills (like `tailwind-v4-tokens`); the CI
triage carries the script.

## Script spec: `triage-log.mjs`

### Invocation
```
node triage-log.mjs <job-log.txt> [--json]
# or: glab ci trace | node triage-log.mjs -   (read stdin with "-")
```
Parse a GitLab CI job log and extract the actionable failure signal from the
noise. GitLab logs have recognizable structure: `section_start`/`section_end`
markers, `$ command` echoes, and an exit-code line. Steps:
- Identify the **failing command**: the last `$ ...` echo before the error /
  non-zero exit. GitLab prints `ERROR: Job failed: exit code N`.
- Extract the **error window**: the lines between the failing command and the
  job-failed line, trimmed of ANSI color codes.
- Classify common failure shapes (each a labeled finding):
  `TEST_FAILURE` (test runner summary lines), `DEPENDENCY` (npm/pip/apt install
  error, lockfile mismatch), `LINT` (eslint/prettier/rubocop nonzero),
  `TIMEOUT` (job exceeded), `OOM` (killed / out of memory), `SCRIPT_ERROR`
  (generic nonzero from a `script:` step), `AUTH` (registry/credentials).
- Output: the failing stage/job name if present, the failing command, the
  trimmed error window, the classification, and a one-line "likely next step."

### Output / exit
- Human summary (not the raw log — that's the point).
- `--json`: `{ stage, job, failingCommand, classification, errorWindow, suggestion }`.
- Exit `1` if a failure was found and classified, `0` if the log shows success
  (nothing to triage).
- Strips ANSI escapes and GitLab `section_*` control sequences before matching.

## Test cases (`tests/triage-log.test.mjs`)
1. A test-failure log → `TEST_FAILURE`, correct failing command extracted.
2. An npm install failure → `DEPENDENCY`.
3. An eslint nonzero exit → `LINT`.
4. OOM-killed job → `OOM`.
5. Log with ANSI colors + `section_start` markers → stripped cleanly, still classified.
6. A successful job log → exit 0, "no failure."
7. stdin via `-` works.
8. `--json` shape correct.
9. Multi-stage log picks the *failing* stage, not an earlier passing one.
10. Unknown failure shape → `SCRIPT_ERROR` fallback with the error window still shown.

## SKILL.md descriptions (drafts)
- **ci-triage:** > Triage a failed GitLab CI pipeline: parse the job log, find
  the failing command, classify the failure, and suggest the fix. Use when a
  GitLab pipeline fails, when reviewing CI logs, or when asked why a `.gitlab-ci.yml`
  job broke. Reads a log file or `glab ci trace` output; no API token needed.
- **mr-review:** > Prepare a GitLab merge request: generate a clear
  description from the diff, a review checklist, and risk notes. Use when
  opening or reviewing an MR, writing an MR description, or when working in a
  GitLab repo. (GitLab's equivalent of a PR; use this, not GitHub PR phrasing.)
- **gitlab-release:** > GitLab tag and release workflow, semantic-release aware.
  Use when cutting a release, tagging, or writing release notes in a GitLab
  project.

## examples/gitlab-pack
`failed-job.log`: a realistic failing job (a test failure with ANSI codes and
section markers).
```
npx dibble gitlab-triage examples/gitlab-pack/failed-job.log
```
Expect: TEST_FAILURE classification, the failing command and error window, exit 1.

## Integration checklist
marketplace.json (one entry for the pack); bin `dibble-gitlab-triage` →
`triage-log.mjs`; dispatcher `gitlab-triage`; compatibility row (Skills ✅,
CLI ✅ for triage only, hook n/a, commands ✅, CI ✅). Note in the row that
mr-review/gitlab-release are knowledge-only.

## Effort
Medium. `triage-log.mjs` is the deliverable with teeth; the two knowledge
skills are fast. Real GitLab CI log samples matter — base the parser and the
example on the actual `section_start:TIMESTAMP:section_name` format and the
`ERROR: Job failed: exit code N` line. ~1 session.
