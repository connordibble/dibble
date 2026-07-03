# Plan: shadow-a11y (Tier A, dibble monorepo)

> Read [00-CONVENTIONS.md](../00-CONVENTIONS.md) first.

## One-line pitch

Accessibility auditing focused on **Web Components and Shadow DOM** — the
blind spot of the crowded a11y-tooling field, which is almost all React/JSX
and where axe-core famously struggles across shadow boundaries.

## Why it stands out / why Connor

At least six credible a11y skills already exist, and they're all light-DOM /
JSX-centric. None targets Shadow DOM: slotted content, ARIA references that
can't cross shadow roots, form-associated custom elements, focus delegation.
Connor shipped `sf-ui`, a 70+ primitive Lit/Web-Components library (see `sfds`
project), so this is a domain he owns and the competition doesn't touch.

## The clever differentiator

**A static analyzer that understands the shadow boundary as a real
constraint.** The key insight the plan must encode: several ARIA patterns that
are valid in light DOM are *broken* inside Shadow DOM because IDREF
associations (`aria-labelledby`, `aria-describedby`, `for`) cannot reference
across shadow roots. A tool that knows this catches a class of bug axe-core
misses by design. v1 is static (parses component source); note that a runtime
axe-in-browser pass is a future enhancement.

## Deliverables (file tree)

```
plugins/shadow-a11y/
├── .claude-plugin/plugin.json
├── skills/shadow-a11y/
│   ├── SKILL.md
│   ├── scripts/scan-components.mjs   # static analyzer over Web Component source
│   └── references/
│       ├── shadow-dom-aria.md        # the cross-boundary IDREF rules, focus, form-association
│       └── patterns.md               # correct patterns for each flagged issue
├── tests/scan-components.test.mjs
└── README.md
examples/shadow-a11y/
├── my-button.js                       # a Lit/vanilla WC with seeded issues
└── README.md
```

Skill + CLI (+ optional `/shadow-a11y:audit` command). No hook — a11y audits
are on-demand/CI, not per-edit.

## Script spec: `scan-components.mjs`

### Invocation
```
node scan-components.mjs <files-or-dirs...> [--json] [--strict]
```
Scans `.js`/`.ts`/`.jsx`/`.tsx` files that define custom elements
(`customElements.define`, `class extends HTMLElement`, `class extends
LitElement`, or a `static styles`/`render()` shape). Skip files with none of
these signals.

### Checks (each maps to a documented WCAG-relevant rule in references/)
Detect via source-pattern matching (this is a heuristic static linter like
`design-verify`, not a full parser). Findings, with severity:

- **CROSS_ROOT_IDREF** (error) — `aria-labelledby`/`aria-describedby`/`for`
  whose target id is not defined inside the same template string / render
  output. In Shadow DOM this reference silently fails. This is the flagship check.
- **MISSING_SHADOW_LABEL** (error) — an interactive element (`<button>`,
  `<input>`, custom control with `role`) in the shadow template with no
  accessible name (no text content, `aria-label`, or in-shadow `aria-labelledby`).
- **FOCUS_TRAP_RISK** (warn) — `tabindex` > 0, or a custom control with a
  click handler but no `tabindex`/keyboard handler (`keydown`/`keyup`).
- **DELEGATES_FOCUS_MISSING** (warn) — `attachShadow({ mode })` without
  `delegatesFocus: true` on an element that renders a focusable control, which
  commonly breaks label-click focus and `:focus` styling.
- **FORM_ASSOCIATION_MISSING** (warn) — a custom form control (name attr, value
  property, resembles input) without `static formAssociated = true` +
  `attachInternals()`. It won't participate in forms or validation.
- **ROLE_WITHOUT_STATE** (warn) — `role="checkbox|switch|tab|..."` without the
  matching `aria-checked`/`aria-selected` state binding.
- **POSITIVE_TABINDEX**, **REDUNDANT_ROLE** (info).

### Output / exit
- Report groups by file then severity; each finding cites the line and points
  at the fix pattern name in `references/patterns.md`.
- `--json`: `{ results: [{file, line, rule, severity, message}] }`.
- Exit `1` if any `error`; `--strict` also fails on `warn`.
- Ignore marker: `// shadow-a11y-ignore` on the line.

## Test cases
1. `aria-labelledby="foo"` with no `id="foo"` in the same template → CROSS_ROOT_IDREF.
2. Same, but `id="foo"` present in template → clean.
3. Shadow `<button>` with no accessible name → MISSING_SHADOW_LABEL; with
   `aria-label` → clean.
4. `attachShadow({ mode: "open" })` rendering a focusable input, no
   `delegatesFocus` → DELEGATES_FOCUS_MISSING; with it → clean.
5. Custom control with click handler, no keydown/tabindex → FOCUS_TRAP_RISK.
6. `role="checkbox"` without `aria-checked` → ROLE_WITHOUT_STATE.
7. Form-like custom element without `formAssociated` → FORM_ASSOCIATION_MISSING.
8. Non-component file (plain module) → skipped, clean.
9. `--strict` flips a warn-only file to exit 1.
10. `--json` shape; ignore marker suppresses a line.

## SKILL.md description (draft)
> Accessibility auditing for Web Components and Shadow DOM specifically —
> slotted content, ARIA references across shadow roots, focus delegation,
> form-associated custom elements. Use when building or reviewing custom
> elements / Lit components, when an a11y audit needs to cover Shadow DOM
> (where axe-core and JSX-focused tools fall short), or when a shadow-a11y
> report appears. For plain React/HTML a11y, a light-DOM tool is a better fit;
> this one is for the shadow boundary.

## examples/shadow-a11y
`my-button.js`: a custom element with a cross-root `aria-labelledby`, a
shadow button with no label, and open shadow root without `delegatesFocus`.
```
npx dibble shadow-a11y examples/shadow-a11y/my-button.js
```
Expect: 2 errors (CROSS_ROOT_IDREF, MISSING_SHADOW_LABEL) + 1 warn
(DELEGATES_FOCUS_MISSING), exit 1.

## Integration checklist
marketplace.json; bin `dibble-shadow-a11y`; dispatcher `shadow-a11y`;
compatibility row (Skill ✅, CLI ✅, hook n/a, command optional, CI ✅).

## Effort
Medium. The `references/shadow-dom-aria.md` content (the actual rules) is as
important as the code — get those right and precise, they are the skill's real
value. ~1 focused session.
