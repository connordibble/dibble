# Plan: skill-ci (Tier B, own repo — GitHub Action)

> Read [00-CONVENTIONS.md](../00-CONVENTIONS.md) first. Tier B. This one is a
> **GitHub Action** and therefore *must* live at its own repo root (Actions are
> published from the repo root `action.yml`).

## One-line pitch

Regression testing for Agent Skills. Treats `SKILL.md` files like code: runs
eval prompts with and without the skill, checks deterministic traces (command
counts, token budgets, output schemas), and gates PRs on a pass rate — "CI for
skills."

## Why it stands out / why Connor

Skills are now real repo artifacts (adopted across 32+ tools), but almost
nobody tests them; the one OSS eval tool is early. OpenAI published an
eval-skills blog; the academic benchmarks just appeared. The "CI for skills"
framing is unclaimed, and it serves skill *authors* — the exact people who
publish and talk, so it compounds reputation. Connor already runs every dibble
plugin through a make→test→validate→gate loop; this productizes that discipline
for skills generally.

## The clever differentiator

**Separates capability evals from regression evals** (the insight from OpenAI's
methodology): capability evals have a low pass rate and are an improvement
target; regression evals sit near 100% and are a protection target. Mixing them
produces wrong prioritization. skill-ci enforces the split and gates only on
regressions, so a green check means "you didn't break what worked," which is
what CI is actually for. Plus **deterministic-first grading**: trace checks
(command count, token budget, files touched, output schema) before any
model-graded rubric, so most of the signal is cheap and flake-free.

## Repo scaffolding

Repo: `connordibble/skill-ci`. Dual distribution: a **GitHub Action** (repo
root `action.yml`) and an **npm CLI** (`skill-ci` — verify free) so it runs
locally too.

```
skill-ci/
├── action.yml                      # composite action: inputs (skill-path, eval-file, threshold), runs the CLI
├── .github/workflows/ci.yml        # test matrix + release (release publishes npm AND tags for the Action)
├── .releaserc.json                 # dibble chain; the Action is consumed by git tag, so tagging matters
├── package.json                    # bin: skill-ci -> bin/cli.mjs ; zero runtime deps beyond what running an agent needs
├── bin/cli.mjs                     # subcommands: run, report
├── src/
│   ├── run-evals.mjs               # execute each eval prompt with/without skill (invokes `claude -p` or a configurable runner)
│   ├── grade.mjs                   # deterministic trace checks + optional rubric hook
│   ├── traces.mjs                  # parse a run trace: command_execution count, usage tokens, files touched
│   └── report.mjs                  # human + --json + PR-comment markdown
├── evals.schema.json               # the eval-file format
├── test/*.test.mjs
└── examples/                       # a sample skill + evals.json + a recorded trace fixture (so tests don't need a live model)
```

**Runner abstraction is critical:** the tool must not hard-depend on a live
model in its own tests. Define a `--runner` interface (default: `claude -p`
with `--output-format json`; overridable to a fixture/stub). All unit tests run
against *recorded trace fixtures*, never a live model. Live-model execution is
integration-only and behind a flag.

## Eval file format (`evals.schema.json`)
```jsonc
{
  "skill": "my-skill",
  "capability": [   // low pass rate OK; improvement target; does NOT gate
    { "id": "cap-1", "prompt": "...", "assert": { /* trace assertions */ } }
  ],
  "regression": [   // near-100%; protection target; GATES the build
    { "id": "reg-1", "prompt": "...", "assert": {
        "maxCommands": 20, "maxTokens": 50000,
        "outputMatches": "regex", "outputSchema": "path/to/schema.json",
        "filesTouched": ["src/**"], "exitZero": true } }
  ],
  "threshold": { "regression": 1.0, "capability": 0.0 }
}
```

## Core specs
- **run-evals.mjs**: for each eval, run the prompt through the runner twice
  (with-skill, baseline) unless `--with-skill-only`. Capture the trace
  (JSON/JSONL) to a workspace dir. Deterministic, resumable.
- **traces.mjs**: parse a trace → `{ commandCount, tokens: {in,out}, filesTouched,
  finalOutput, exitCode }`. This is the pure, fully-unit-tested core.
- **grade.mjs**: evaluate a trace against an eval's `assert` block. Deterministic
  checks first; only fall to a model-graded rubric if the eval declares one and
  deterministic checks are insufficient. Return per-assertion pass/fail + reason.
- **report.mjs**: capability pass rate (informational), regression pass rate
  (gating). Exit `1` if regression pass rate < `threshold.regression`. `--json`
  and a `--pr-comment` markdown mode.

## action.yml (composite)
Inputs: `skill-path` (required), `eval-file` (default `evals.json`),
`regression-threshold` (default `1.0`), `runner` (default `claude`),
`anthropic-api-key` (secret, only if runner needs it). Steps: setup node,
`npx skill-ci run --skill $skill-path --evals $eval-file`, post the
`--pr-comment` output as a check. Document that authors add it as:
```yaml
- uses: connordibble/skill-ci@v1
  with: { skill-path: skills/my-skill, eval-file: evals.json }
```

## Test cases (all against fixtures, no live model)
1. `traces.mjs`: a recorded JSONL trace → correct command count, token totals,
   files touched, exit code.
2. `grade.mjs`: `maxCommands` satisfied → pass; exceeded → fail with reason.
3. `maxTokens`, `outputMatches` (regex), `exitZero`, `filesTouched` glob each
   pass/fail.
4. `outputSchema`: output validates → pass; invalid → fail.
5. Regression pass rate below threshold → exit 1; at threshold → exit 0.
6. Capability failures never affect exit code.
7. `report.mjs`: `--json` shape; `--pr-comment` markdown renders both rates.
8. Runner stub: `run-evals` with a fixture runner produces the expected
   workspace layout without any model call.
9. `--with-skill-only` skips baseline runs.
10. Missing eval file / malformed schema → clear error, non-zero, no crash.

## README shape
Hero: a PR check failing because a skill edit broke a regression eval, with the
comment table. Install: the `uses:` snippet AND `npx skill-ci`. Honest limits:
deterministic checks are reliable, rubric grading inherits model variance; live
runs cost tokens; this tests skill *behavior*, not skill *safety* (that's
skillscan). Cross-link skillscan and the dibble catalog.

## Definition of done
- [ ] `action.yml` at repo root, valid composite action
- [ ] CLI works standalone via npx; all unit tests fixture-based and green on
      the matrix
- [ ] Release pipeline tags `v1` (and a moving `v1` major tag for Action
      consumers — add a release step or a documented manual `git tag -f v1`)
- [ ] npm name confirmed; MIT; identity §0 verified; README passes the auditor
- [ ] Listed in the dibble marketplace as external-source (the CLI half is a
      skill too; optional)

## Effort
Large — the runner abstraction and fixture-based testing are the make-or-break
design. Do the trace-parsing core and fixtures first; the Action wrapper is
thin once the CLI works. ~2 sessions. Highest complexity of the Tier B set
after systemkit.
