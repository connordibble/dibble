# design-verify example

`Card.tsx` has a wide fixed width, a fixed height on a text container, and
sub-12px text — the three static smells the linter catches before you even
open a browser.

```bash
npx dibble responsive-smells examples/design-verify
npx dibble responsive-smells examples/design-verify --strict   # nonzero exit for CI
```

Expect: three findings (`fixed-width`, `tiny-text`, `fixed-height`), each
naming why it breaks at a 375px viewport. Default mode exits 0 (advisory);
`--strict` exits 1, for gating CI.
