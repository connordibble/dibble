# Plan: systemkit (Tier B, own repo — THE FLAGSHIP)

> Read [00-CONVENTIONS.md](../00-CONVENTIONS.md) first. Tier B. This is the
> flagship; it deserves the most care and the strongest launch.

## One-line pitch

Point it at a codebase and it **generates a project-specific design-system
skill**: the components to reuse, the token vocabulary, the composition rules,
the accessibility conventions — the `SKILL.md` a project should have so agents
build in *its* system instead of the average of their training data.

## Why it stands out / why Connor

Anthropic's Frontend Design plugin (829k installs) proves the demand and its
weakness: it generates *generically pretty* UI, not *your system's* UI.
"Turn your design system into a Claude Skill" is already a hot article genre
and Storybook has an open RFC on exactly this — but nobody shipped the
generator. This is `DesignRail` + `sfds` (Connor's design-to-code and
enterprise-design-system work) productized. It launches with essay
`work/essay-drafts/04` ("Agentic Software Needs a Design System"). If dibble is
the catalog, systemkit is the piece that makes Connor "the design-systems-for-
agents person."

## The clever differentiator

**It reads what already exists and writes the rules the code already follows —
a generated skill grounded in the repo's real conventions, not a template.** It
inspects: the token file(s), the component library (exports, prop shapes,
variant patterns), Storybook stories if present, lint/format config, and usage
frequency (which components are actually used, and how). From that it emits a
`SKILL.md` that says "use `<Button variant>` not raw `<button>`, tokens live in
X, compose via Y, these 12 components cover 90% of the UI." A human reviews and
edits before it ships — the DesignRail human-in-the-loop thesis, applied to
skill generation. **The output is itself a portable Agent Skill**, so the tool
is a skill that writes skills.

## Repo scaffolding

Repo: `connordibble/systemkit`. npm `systemkit` (verify; fallback
`system-kit`). Because it *analyzes TS/React/Vue/WC source*, it may use a real
parser — but prefer staying zero-runtime-dep by using regex/heuristic
extraction like `design-verify`/`zod-first-tools` where possible; only reach for
a parser (e.g. the TS compiler API as a dev-time capability) if heuristics prove
too weak. Decide in the design step; record the decision.

```
systemkit/
├── .github/workflows/ci.yml        # matrix + release (copy dibble)
├── .releaserc.json                 # dibble chain
├── package.json                    # bin: systemkit -> bin/cli.mjs
├── bin/cli.mjs                     # subcommands: analyze, generate, update
├── src/
│   ├── detect.mjs                  # find token files, component dir, storybook, lint config
│   ├── extract-tokens.mjs          # reuse token-drift's parsers (copy in)
│   ├── extract-components.mjs      # component names, exported props, variant enums, usage counts
│   ├── extract-conventions.mjs     # import patterns, "always import from @/ui" rules, a11y patterns
│   ├── generate-skill.mjs          # compose the SKILL.md from the extracted facts
│   └── templates/skill.md.tmpl     # the generated-skill scaffold (every rule cites repo evidence)
├── test/*.test.mjs                 # fixtures = small mock repos under test/fixtures/
├── examples/                       # a mock component-library repo + the skill systemkit generates from it
└── README.md CONTRIBUTING.md SECURITY.md LICENSE .gitignore
```

## Pipeline (the three subcommands)

- **`systemkit analyze <repo>`** → prints/`--json` the extracted facts:
  detected token files, component inventory (name, props, variants, usage
  count), convention signals. Read-only, no output file. This is the
  inspectable middle layer (DesignRail's "show the proposal" step).
- **`systemkit generate <repo> [--out .claude/skills/design-system/SKILL.md]`**
  → runs analyze, then composes a `SKILL.md` from `templates/skill.md.tmpl`.
  **Every rule in the output cites repo evidence** (file paths, usage counts),
  never invents a convention — the anti-horoscope rule from `no-slop`'s voice
  extractor, applied here. Prints the result for human review; only writes with
  `--out` (and warns before overwriting).
- **`systemkit update <repo>`** → re-runs against an existing generated skill
  and shows a diff (conventions drift as the codebase evolves).

## Extraction specs (the hard part — each independently tested)
- **detect.mjs**: locate token files (globals/tokens/theme.css, `*.tokens.json`),
  the component directory (heuristic: dir with many single-component files
  exporting a PascalCase symbol), Storybook (`.storybook/`, `*.stories.*`),
  lint config. Return a structured map. Fail soft: absence of any is fine, just
  fewer facts.
- **extract-components.mjs**: for each component file, extract the exported
  component name, its prop names + types (from a TS interface/type or PropTypes
  or Vue defineProps), and variant enums (union types / `variant` prop values).
  Count usage across the repo (import + JSX/tag occurrences). Heuristic, robust
  to partial parses.
- **extract-conventions.mjs**: detect "import UI from a central package"
  patterns, common a11y patterns present (or absent), spacing/token usage
  discipline. Emit as candidate rules with the evidence that supports each.
- **generate-skill.mjs**: fill the template. Sections: what the system is, the
  token vocabulary (from extract-tokens), the components to reuse (ranked by
  usage), composition rules, a11y conventions, and a "when generating UI"
  checklist. Cap length; put exhaustive component lists in a `references/`
  file the generated skill points to.

## Test cases (fixtures under test/fixtures/mock-repo/)
1. `detect`: a fixture repo with globals.css + `src/ui/*` + `.storybook/` →
   all three detected; a bare repo → none, no crash.
2. `extract-components`: a `Button.tsx` with a `variant: "primary" | "ghost"`
   prop → name `Button`, variants `[primary, ghost]`, props listed.
3. Usage count: `Button` imported in 5 files → count 5, ranked above a
   once-used component.
4. `extract-tokens`: reuses token-drift parser; tokens surfaced.
5. `generate-skill`: output contains the top components by usage, cites the
   token file path, and every rule has an evidence reference (assert no rule
   lacks a citation).
6. Overwrite guard: `--out` to an existing file warns/requires `--force`.
7. `analyze --json` shape is stable.
8. `update`: given a prior generated skill, produces a diff when a component
   was added.
9. Vue `defineProps` and a WC `static properties` shape both extract (at least
   one non-React fixture).
10. A repo with no design system → graceful "not enough signal" message, not a
    fabricated skill.

## README shape
Hero: `systemkit generate ./my-app` producing a real skill snippet grounded in
the app. Install: `npx systemkit analyze .`. Honest limits: heuristic
extraction, review-before-ship required, best on repos that already have *some*
system. Cross-link tokenlock (enforces the tokens systemkit documents),
token-drift, and the essay.

## Launch (flagship)
Pair with essay 04. The demo is the whole thing: run it on a well-known OSS
design system's repo, show the generated skill, then show an agent building a
component correctly with it vs generically without it. This is the reputation
launch — do it after the catalog has an audience (Wave 3+).

## Definition of done
- [ ] Three subcommands work; `generate` output passes `no-slop` sloplint and
      reads like a real skill; every generated rule cites evidence
- [ ] Fixtures cover React + one of Vue/WC; all tests fixture-based, green on matrix
- [ ] Release pipeline, npm name, MIT, identity §0, README passes auditor
- [ ] Listed in the dibble marketplace as external-source
- [ ] Parser-vs-heuristic decision recorded in README/CONTRIBUTING

## Effort
Large — the flagship. Extraction robustness is the whole game; budget real time
for `extract-components` across frameworks. Ship React-only in v1 if needed and
say so, rather than doing all frameworks shallowly. ~2–3 sessions.
