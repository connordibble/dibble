# dibble build plans — the remaining 10

Comprehensive, handoff-ready implementation plans for the ten catalog items not
built in the first pass. Each plan is written so a fresh agent (Sonnet or
otherwise) can build the whole thing from that one file plus
[00-CONVENTIONS.md](00-CONVENTIONS.md), with no other context.

## How to use these

1. Read [00-CONVENTIONS.md](00-CONVENTIONS.md) once. It holds the git identity
   rules, the build loop, the quality gates, the script rules, and the
   reference-implementation table. Every plan assumes it.
2. Pick one plan. Build it end to end following its plan + the conventions.
   **Do one unit fully before starting the next** — make, test, verify against
   a fixture, pass all gates, commit, then move on.
3. Never mark a unit done with a failing test or gate.

## Identity (already done for the dibble repo)

The existing `dibble` repo history was reworked so **all commits are authored
and committed by `Connor Dibble <dibbleconnor@gmail.com>`** with zero
co-author/tool trailers, and all package/plugin metadata now uses that email.
Verified: `git log --format='%ae|%ce' | sort -u` shows only that address. For
each NEW Tier B repo, set the same identity before the first commit and verify
before the first push (conventions §0).

## Tier A — monorepo-shaped (build inside this repo)

Same repo, same skill+script+hook pattern, same `pnpm` gates. No new repo, no
new release pipeline. Slot each into `plugins/`, register in
`marketplace.json`, add bins + dispatcher case + examples + compatibility row.

| # | Plan | What it is | Teeth | Effort |
| --- | --- | --- | --- | --- |
| A1 | [token-drift](tier-a/token-drift.md) | Figma/DTCG ↔ code token-drift auditor | bidirectional schema diff | Medium |
| A2 | [shadow-a11y](tier-a/shadow-a11y.md) | a11y auditing for Shadow DOM / Web Components | cross-root IDREF static check | Medium |
| A3 | [contract-snap](tier-a/contract-snap.md) | structural snapshots of LLM output across model versions | shape-drift (not value) diff | Med-Large |
| A4 | [gitlab-pack](tier-a/gitlab-pack.md) | GitLab MR/CI/release pack | CI-log triage classifier | Medium |
| A5 | [agent-slo](tier-a/agent-slo.md) | reliability budgets for agent jobs | error-budget report from run metrics | Med-Large |

## Tier B — flagships (each its own repo + release pipeline)

Bigger products. Each plan includes repo scaffolding and a release-pipeline
section (copy the `dibble` root pipeline / `zod-ai-tool`). Each is also listed
in the dibble marketplace as an external-source plugin so catalog users
discover it.

| # | Plan | What it is | Why own repo | Effort |
| --- | --- | --- | --- | --- |
| B1 | [skillscan](tier-b/skillscan.md) | vet third-party skills/plugins before install | CLI + npm package; the "I scanned N plugins" launch | Medium |
| B2 | [skill-ci](tier-b/skill-ci.md) | regression testing for skills | must be a GitHub Action at repo root | Large |
| B3 | [systemkit](tier-b/systemkit.md) | generate a project's design-system skill | THE FLAGSHIP; own product | Large |
| B4 | [signoff](tier-b/signoff.md) | human review queue for agent output | has a UI; own app | Large |
| B5 | [media-timeline](tier-b/media-timeline.md) | long-form video → structured timeline | FFmpeg/transcription deps; the range flex | Large |

## Suggested build order

Grounded in the launch waves (see the gitignored `LAUNCH.md`) and in
"foundation before flex":

1. **A1 token-drift, A2 shadow-a11y** — extend the design-systems strength
   that's already the catalog's spine; both Medium, both reuse shipped code
   (token-drift ← tokenlock parsers; shadow-a11y ← agent-audit pattern style).
2. **B1 skillscan** — reuses agent-audit's rules; unlocks the highest-upside
   security launch. Build before Wave 2 if that launch is a priority.
3. **A4 gitlab-pack, A3 contract-snap, A5 agent-slo** — round out the Tier A
   catalog; contract-snap/agent-slo pair with existing siblings (zod-first-tools,
   the SLO essay).
4. **B3 systemkit** — the flagship; build once the catalog has an audience.
   Pairs with essay 04.
5. **B2 skill-ci, B4 signoff** — the meta/HITL layer; skill-ci compounds with
   the skill-author audience, signoff carries the "proposal before output"
   thesis (essay 01).
6. **B5 media-timeline** — last; the range demo, most external-dependency risk.

Do not build all ten at once; each is a launch beat, and the audience absorbs
one at a time. Tier A can go into the existing repo immediately with no new
decisions; each Tier B needs a quick scoping confirmation first (npm name free?
parser vs heuristic? UI now or later?) — the plans call these out.

## Reference implementations

The ten shipped plugins under `../../plugins/` are the living reference. When a
plan says "follow the X pattern," open that plugin and copy it. The conventions
doc §8 maps needs → which plugin to copy.
