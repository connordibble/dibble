# install-gate example

No files needed — run the checker directly against sample install commands
(the same CLI mode a CI job or a pre-commit hook would use):

```bash
npx dibble install-gate "pip install reqeusts"
npx dibble install-gate "pip install requests"
npx dibble install-gate "npm add some-lib --allow-scripts"
npx dibble install-gate "npm install ai-utils-helper"
```

Expect, in order: **BLOCK** (`reqeusts` is a transposition typosquat of
`requests`), nothing flagged (popular package, exact match), **BLOCK**
(install-time lifecycle scripts), **VERIFY** (a slopsquat-shaped generic
name — the kind a model hallucinates).
