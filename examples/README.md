# Examples

Runnable fixtures for every plugin with a checker. Each command below is
copy-paste-able from the repo root and takes a few seconds.
`tailwind-v4-tokens` has no example here — it's a knowledge-only skill with no
checker script to run.

```bash
# tokenlock — hardcoded colors and raw Tailwind palette utilities
npx dibble tokenlock examples/tokenlock/src

# token-drift — Figma/DTCG tokens and CSS custom properties disagree
npx dibble token-drift examples/token-drift/figma-export.tokens.json examples/token-drift/globals.css

# no-slop — machine-prose tells in a draft
npx dibble sloplint --strict examples/no-slop/draft.md

# receipts — a verbatim quote, a reworded one, and a fabricated one
npx dibble receipts examples/receipts/postmortem.md --base examples/receipts

# install-gate — typosquat, lifecycle-script flag, hallucinated package name
npx dibble install-gate "pip install reqeusts"
npx dibble install-gate "npm add some-lib --allow-scripts"

# agent-audit — a hook payload split across command+args to evade naive scanning
npx dibble agent-audit --home examples/agent-audit/fixture-home --project /tmp

# design-verify — fixed width, fixed height, and sub-12px text
npx dibble responsive-smells examples/design-verify

# zod-first-tools — a hand-written schema drifting from its Zod source of truth
npx dibble zod-lint examples/zod-first-tools

# readme-that-sells — a README with no install command or example up top
npx dibble readme-audit examples/readme-that-sells/bad-README.md

# marketplace-kit — a misplaced skills/ directory and a version mismatch
npx dibble validate-marketplace examples/marketplace-kit/broken-marketplace
```

Every command above runs against a real fixture in this directory; nothing
here is illustrative-only output. See each plugin's own README for what the
findings mean and how to fix them.
