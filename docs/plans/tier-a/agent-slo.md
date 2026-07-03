# Plan: agent-slo (Tier A, dibble monorepo)

> Read [00-CONVENTIONS.md](../00-CONVENTIONS.md) first.

## One-line pitch

Reliability budgets for agent workflows: define SLOs for scheduled/CI agent
jobs (token spend, tool-error rate, retry-loop count, wall-clock), collect the
metrics from a run, and flag budget burn.

## Why it stands out / why Connor

Agent observability is nascent (Sentry is roughly alone). As teams run *more*
agents (the dominant 2026 trend), "is this agent job healthy" becomes a real
operational question with almost no tooling. Connor has a whole unpublished
essay on exactly this ("Agent Workflows Need SLOs", `work/essay-drafts/03`), so
the tool ships with its own thesis piece — the essay+tool launch pattern.

## The clever differentiator

**A budget file plus a transcript/metrics parser that turns an agent run into a
pass/fail SLO report — the same shape as an error-budget report from SRE.** It
reframes agent runs as services with reliability budgets, which is a genuinely
fresh framing, not another "log viewer." The metrics come from a structured run
summary (token usage, tool calls, errors, retries, duration) that the user's
harness emits or that a SessionEnd/Stop hook collects, so it works for
scheduled/headless agents where nobody is watching.

## Deliverables (file tree)

```
plugins/agent-slo/
├── .claude-plugin/plugin.json
├── skills/agent-slo/
│   ├── SKILL.md
│   ├── scripts/
│   │   ├── check-budget.mjs     # compare a run's metrics to the SLO budget
│   │   └── collect-metrics.mjs  # derive metrics from a run summary / transcript JSON
│   └── references/slo-design.md # how to choose budgets; capability vs regression framing
├── hooks/hooks.json             # optional: a Stop/SessionEnd hook that runs collect+check
├── tests/
│   ├── check-budget.test.mjs
│   └── collect-metrics.test.mjs
└── README.md
examples/agent-slo/
├── .agent-slo.json              # a budget definition
├── run-metrics.json             # a run that burns part of the budget
└── README.md
```

Skill + CLI, with an **optional** hook that fires on Stop/SessionEnd to write a
report. Confirm the exact hook event name against current Claude Code docs at
build time (Stop / SessionEnd); if neither fits a headless job, ship CLI-only
and document invoking `check-budget.mjs` at the end of the job script.

## Budget file: `.agent-slo.json`
```jsonc
{
  "budgets": {
    "totalTokens": 200000,        // hard ceiling for the run
    "toolErrorRate": 0.1,          // fraction of tool calls that may fail
    "maxRetries": 5,               // repeated identical tool calls (loop signal)
    "durationSeconds": 900,
    "toolCalls": 300
  },
  "onBurn": "warn"                 // warn | fail  (fail => exit 1)
}
```

## Script spec

### `collect-metrics.mjs`
```
node collect-metrics.mjs <run-summary.json | transcript.jsonl> [--json]
```
- Accepts either a harness-emitted run summary (preferred) or a JSONL
  transcript. From a transcript, derive: `totalTokens` (sum usage), `toolCalls`
  (count tool_use), `toolErrors` (tool_result with error), `retries` (identical
  consecutive tool_use inputs — the loop tell), `durationSeconds` (first→last
  timestamp).
- Emit a normalized metrics object (the same shape `check-budget.mjs` consumes),
  so the two compose: `collect | check`.

### `check-budget.mjs`
```
node check-budget.mjs <run-metrics.json> [--budget .agent-slo.json] [--json]
```
- Load the budget (default `.agent-slo.json` at cwd). For each metric, compute
  usage vs budget and the **remaining budget** (SRE error-budget framing).
- Findings: `OVER_BUDGET` (metric exceeded its ceiling) and `BURN_WARNING`
  (over a configurable fraction, default 0.8, of a budget — "you're about to
  blow it"). A metric with no budget defined is skipped, not assumed.
- Report reads like an error-budget table: metric | used | budget | remaining |
  status.

### Output / exit
- `--json`: `{ status, metrics: [{name, used, budget, remaining, status}] }`.
- Exit `1` if any `OVER_BUDGET` and `onBurn: "fail"` (or `--strict`); else `0`.
  `BURN_WARNING` alone never fails unless `--strict`.

## Test cases
- `check-budget`: (1) all under budget → clean; (2) tokens over ceiling →
  OVER_BUDGET exit 1 when fail-mode; (3) 85% of a budget → BURN_WARNING, exit 0;
  (4) `onBurn: warn` keeps exit 0 even when over; `--strict` overrides to 1;
  (5) metric with no budget defined is skipped; (6) `--json` shape.
- `collect-metrics`: (7) transcript JSONL → correct token/toolCall/error counts;
  (8) identical consecutive tool_use → retry count increments; (9) run summary
  passthrough; (10) `collect | check` compose end-to-end.

## SKILL.md description (draft)
> Define and check reliability budgets (SLOs) for agent workflows — token spend,
> tool-error rate, retry loops, duration. Use when running scheduled, headless,
> or CI agent jobs, when an agent run is burning too many tokens or looping,
> when setting up agent observability, or when asked whether an agent job is
> healthy. Treats an agent run as a service with an error budget.

## examples/agent-slo
`.agent-slo.json` sets a 200k token ceiling; `run-metrics.json` used 240k and
looped 7 times.
```
npx dibble agent-slo examples/agent-slo/run-metrics.json --budget examples/agent-slo/.agent-slo.json
```
Expect: OVER_BUDGET (tokens), OVER_BUDGET (retries), exit 1.

## Integration checklist
marketplace.json; bins `dibble-agent-slo` (→ check-budget) and
`dibble-agent-metrics` (→ collect-metrics); dispatcher cases; compatibility row
(Skill ✅, CLI ✅, hook optional, command n/a, CI ✅). Launch paired with essay 03.

## Effort
Medium-large. The transcript parsing needs care (match the real Claude Code
transcript JSONL shape — inspect a real one at build time). ~1–2 sessions.
