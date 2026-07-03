# Plan: signoff (Tier B, own repo — has a UI)

> Read [00-CONVENTIONS.md](../00-CONVENTIONS.md) first. Tier B, and the only
> one with a real UI. This plan is deliberately staged: ship a thin, trustworthy
> v1, not the whole vision at once.

## One-line pitch

A human review queue for agent output. Agent-proposed changes land as
structured **proposals** — what changed, why, risk notes, the diff — and a
human approves, rejects, or edits before anything is applied. Every decision is
recorded to a review ledger the agent can learn from.

## Why it stands out / why Connor

Human-in-the-loop tooling is nearly empty in the ecosystem, while "how do I
trust fleets of agents" is *the* question of 2026 (orca and parallel-agent
runtimes are trending). This is `DesignRail`'s core thesis — a governed review
step between proposal and application — generalized beyond design. Connor built
exactly this: DesignRail's recorded accept/reject/edit decisions, and the State
Farm feedback platform's "reviewable evidence" surface. Nobody owns the
"review surface for agent output" category. It pairs with essay
`work/essay-drafts/01` ("Proposal Before Output").

## The clever differentiator

**A proposal is a first-class, reviewable artifact with a durable decision
ledger — not a yes/no permission prompt.** The agent doesn't ask "run this?";
it submits a proposal (diff + rationale + risk + affected files) to a queue. A
human reviews asynchronously, edits if needed, and the decision (with reason)
is appended to a JSONL ledger. The ledger is the moat: it's an auditable record
of what automation proposed and what humans decided, which is exactly the layer
that turns model output into something a team can trust and improve. Reuse
`receipts`' evidence discipline — a proposal's rationale should cite the
diff/sources it's based on.

## Architecture decision (make this first)

signoff is a local tool, not a SaaS (dibble's ethos: no auth, no dashboards-as-
product). v1 = a **CLI that manages a proposal queue on disk + a minimal local
web UI** to review it, exactly like the pattern the conventions reference for
`design-verify`'s browser use. Concretely:

- Proposals are files in `.signoff/queue/*.json` (a proposal = id, title,
  rationale, riskNotes, affected files, and a unified diff or patch).
- The CLI (`signoff submit`, `signoff list`, `signoff apply <id>`,
  `signoff reject <id>`) manages them.
- `signoff review` starts a tiny local server rendering the queue with
  approve/reject/edit buttons; decisions write back to the ledger and, on
  approve, apply the patch.
- Ledger: `.signoff/ledger.jsonl`, append-only, one decision per line.

This keeps v1 shippable and dependency-light. The web UI is the one place a
small dependency footprint is acceptable (a minimal server); keep it to the
standard library + a single static HTML/JS file if feasible (follow the
skill-creator eval-viewer pattern: a self-contained HTML file, no framework).

## Repo scaffolding

Repo: `connordibble/signoff`. npm `signoff` (verify; likely taken — fallbacks
`agent-signoff`, `@connordibble/signoff` scoped). 

```
signoff/
├── .github/workflows/ci.yml   .releaserc.json   package.json
├── bin/cli.mjs                # submit | list | review | apply | reject | ledger
├── src/
│   ├── queue.mjs              # read/write proposals in .signoff/queue
│   ├── proposal.mjs           # proposal schema + validation
│   ├── ledger.mjs             # append-only decision log
│   ├── patch.mjs              # apply/revert a unified diff safely
│   └── server.mjs             # minimal local review UI (stdlib http + static file)
├── ui/review.html            # self-contained review page (no framework)
├── skills/signoff/SKILL.md   # teaches an agent to SUBMIT proposals instead of applying directly
├── test/*.test.mjs
├── examples/                 # a sample queue with 2 proposals + README
└── README.md CONTRIBUTING.md SECURITY.md LICENSE
```

The `skills/signoff/SKILL.md` is important: it's how an agent learns to route
its changes through signoff ("when about to apply a multi-file change, submit a
proposal via `signoff submit` instead"). That skill is listed in the dibble
marketplace; the app is the repo.

## Specs
- **proposal.mjs**: schema `{ id, title, rationale, riskNotes, files[], diff,
  createdAt, status }`. `status` ∈ submitted|approved|rejected|edited. Validate
  on submit; reject malformed.
- **queue.mjs**: CRUD over `.signoff/queue/*.json`. Deterministic ids
  (timestamp + short hash).
- **patch.mjs**: apply a unified diff to the working tree; must be reversible;
  refuse to apply if the target files changed since the proposal was created
  (hash check) — a stale patch is a real corruption risk (echoes the "job
  clobbers a decision it never saw" essay).
- **ledger.mjs**: append `{ id, decision, reason, editedDiff?, decidedAt }`.
  Never rewrite; the append-only property is the audit guarantee.
- **server.mjs**: serve `ui/review.html` + a tiny JSON API (`GET /queue`,
  `POST /decision`). Local only, no auth (bind 127.0.0.1). Decisions go through
  ledger + patch.

## Test cases (no browser needed for core)
1. `submit` writes a valid proposal; malformed input rejected.
2. `list` shows queued proposals; filters by status.
3. `apply` on a clean tree applies the diff and appends an `approved` ledger entry.
4. `apply` on a tree where target files changed since submit → refused (stale
   patch), no partial write.
5. `reject` appends a `rejected` entry with reason, leaves files untouched.
6. Edit flow: an edited diff is applied and recorded as `edited` with the new diff.
7. Ledger is append-only (a second decision doesn't overwrite the first).
8. `patch.mjs` round-trip: apply then revert restores the original file bytes.
9. Server API: `GET /queue` returns the queue JSON; `POST /decision` updates
   ledger (test via direct function calls / supertest-style over stdlib http).
10. Ids are unique and stable-sortable.

## README shape
Hero: the review UI screenshot + the ledger.jsonl it produces. Install:
`npx signoff review`. Honest limits: v1 is local/single-user, patches must be
fresh, not a merge-conflict resolver. Cross-link the essay and receipts.

## Staging (do NOT build it all at once)
- v1: CLI queue + ledger + apply/reject + the SKILL.md. **No UI.** Ships the
  thesis (proposals + durable decisions) with the least surface.
- v1.1: the minimal local review UI.
- Later: learning loop (feed ledger decisions back to the agent), multi-user.
Record this staging in the README roadmap so contributors don't over-build.

## Definition of done (v1)
- [ ] CLI submit/list/apply/reject + append-only ledger + stale-patch guard
- [ ] `skills/signoff/SKILL.md` teaches proposal submission; listed in dibble marketplace
- [ ] All core tests pass without a browser; release pipeline, npm name, MIT,
      identity §0, README passes auditor
- [ ] UI deferred to v1.1 and labeled as such

## Effort
Large (patch application safety + the async review model are subtle). The
stale-patch guard and append-only ledger are the trust-critical pieces — test
them hardest. ~2 sessions for v1 (CLI only), +1 for the UI. Best built after
systemkit so the "proposal before output" story has a design-system anchor.
