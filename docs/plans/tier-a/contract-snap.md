# Plan: contract-snap (Tier A, dibble monorepo)

> Read [00-CONVENTIONS.md](../00-CONVENTIONS.md) first.

## One-line pitch

Golden/snapshot regression tests for **structured LLM output**: capture the
shape of a model's tool-call arguments / JSON responses against a schema, and
fail when a model or prompt change silently alters that shape.

## Why it stands out / why Connor

The failure everyone hits and nobody tests: you upgrade the model (or tweak the
prompt) and your tool-call arguments quietly change shape — a field goes
missing, an enum gains a value, a number becomes a string. Nothing catches it
until production. Natural sibling to `zod-first-tools` (shipped) and a direct
funnel to Connor's `zod-ai-tool` npm package. This is the "did the contract
hold across model versions" tool.

## The clever differentiator

**Schema-aware snapshots, not string snapshots.** A plain snapshot test breaks
on any change (a different city name in the example) and so gets ignored. This
snapshots the **structural contract**: which keys exist, their types, enum
membership, optionality, nesting — derived from a Zod schema (or inferred) —
not the literal values. So it only fails on shape drift, the thing that
actually breaks integrations. It answers "is the response still schema-valid
AND structurally the same as the approved baseline."

## The one exception to zero-dep

This plugin's checker is TypeScript and may depend on `zod` (peer) because its
whole job is comparing against Zod schemas, matching `zod-ai-tool`'s build
setup (`tsup`, `vitest`). It is the documented TS exception in conventions §3.
Keep the runtime dependency surface to `zod` only. If a fully zero-dep JS
version is feasible (operate on JSON Schema instead of Zod directly), prefer
that and keep it in the monorepo's `.mjs` style — decide during the design
step and record the decision in the README.

## Deliverables (file tree)

```
plugins/contract-snap/
├── .claude-plugin/plugin.json
├── skills/contract-snap/
│   ├── SKILL.md
│   ├── scripts/
│   │   ├── snapshot.mjs      # capture a structural snapshot from sample outputs
│   │   └── check.mjs         # compare current outputs to the saved snapshot
│   └── references/shape-rules.md   # what counts as a breaking vs compatible change
├── tests/contract-snap.test.mjs
└── README.md
examples/contract-snap/
├── schema.json               # a JSON-Schema (or Zod-derived) contract
├── baseline.snap.json        # approved structural snapshot
├── responses-ok.json         # sample outputs that still conform
├── responses-drifted.json    # sample outputs with a shape change
└── README.md
```

Skill + CLI. No hook. This is a CI tool first.

## Script spec

### `snapshot.mjs` (capture)
```
node snapshot.mjs <responses.json> [--schema schema.json] [--out baseline.snap.json]
```
- Input: an array of structured outputs (tool-call argument objects or JSON
  responses).
- Derive a **structural fingerprint** per response and merge into a schema-like
  summary: for each key path, the observed set of types, whether it's ever
  absent (⇒ optional), enum value sets for string fields with low cardinality,
  array element shape. If `--schema` given, validate each response against it
  first and record conformance.
- Write the merged fingerprint to the snapshot file (stable key ordering, so
  it diffs cleanly in git).

### `check.mjs` (regress)
```
node check.mjs <responses.json> --baseline baseline.snap.json [--schema schema.json] [--json]
```
Classify differences between the current responses' fingerprint and the
baseline:
- **BREAKING**: a required key disappeared; a type changed
  (string→number etc.); an enum lost a member that the baseline had; an array
  became a scalar. These fail (exit 1).
- **COMPATIBLE**: a new optional key appeared; an enum gained a member; a field
  that was always-present became sometimes-absent in a backward-compatible
  spot. Reported as info, exit 0 (with `--strict`, these fail too).
- **SCHEMA_INVALID**: a response no longer validates against `--schema`. Fail.
- See `references/shape-rules.md` for the full breaking/compatible taxonomy
  (write this carefully — it's the tool's spec).

### Output / exit
- Human report: BREAKING first, then SCHEMA_INVALID, then COMPATIBLE.
- `--json`: `{ breaking: [...], compatible: [...], schemaInvalid: [...] }`.
- Exit 1 on any BREAKING/SCHEMA_INVALID; `--strict` also on COMPATIBLE.
- To update an approved baseline, re-run `snapshot.mjs` (like `jest -u`).

## Test cases
1. Responses matching baseline exactly → clean, exit 0.
2. A required field removed → BREAKING, exit 1.
3. A field's type changed string→number → BREAKING.
4. A new optional field added → COMPATIBLE, exit 0; `--strict` → exit 1.
5. Enum gained a value → COMPATIBLE; enum lost a baseline value → BREAKING.
6. Array became scalar → BREAKING.
7. With `--schema`, a response failing validation → SCHEMA_INVALID.
8. Snapshot round-trip: `snapshot.mjs` output fed to `check.mjs` against the
   same data → clean (fingerprint is stable/deterministic).
9. Key ordering in the snapshot file is stable across runs (git-friendly).
10. `--json` shape; nested-object drift detected at the right key path.

## SKILL.md description (draft)
> Regression-test the shape of structured LLM output across model and prompt
> changes. Use when building tool-use or structured-output pipelines, before or
> after upgrading a model, when tool-call arguments or JSON responses might have
> changed shape, or when setting up CI for an LLM integration. Snapshots the
> structural contract (keys, types, enums, optionality), not literal values, so
> it fails only on shape drift. Pairs with zod-first-tools.

## examples/contract-snap
Baseline captured from `responses-ok.json`; `responses-drifted.json` removes a
required field and changes a type.
```
npx dibble contract-snap-check examples/contract-snap/responses-drifted.json \
  --baseline examples/contract-snap/baseline.snap.json
```
Expect: 2 BREAKING findings, exit 1.
(Two bins: `dibble-contract-snapshot` and `dibble-contract-snap-check`, or one
bin with `snapshot`/`check` subcommands — decide during build, prefer
subcommands for a cleaner dispatcher surface.)

## Integration checklist
marketplace.json; bin(s); dispatcher case(s); compatibility row (Skill ✅,
CLI ✅, hook n/a, command n/a, CI ✅ — this one is *primarily* a CI tool, say so).

## Effort
Medium-large (the fingerprint/diff taxonomy is the hard part). ~1–2 sessions.
Decide the zod-vs-JSON-Schema dependency question first thing.
