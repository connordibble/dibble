# Build conventions (read first)

Every plan in this directory assumes these conventions. They are the same
ones the ten shipped `dibble` plugins already follow, so the existing
`plugins/*` directories are your reference implementation. When a plan says
"follow conventions," it means this file. Do not re-derive any of this.

A handoff agent (Sonnet or otherwise) should be able to open one plan file,
read this file once, and build the whole thing with no other context.

---

## 0. Identity and commits (NON-NEGOTIABLE)

- **Author and committer email is always `dibbleconnor@gmail.com`.** Before the
  first commit in any repo, run:
  ```bash
  git config user.name "Connor Dibble"
  git config user.email "dibbleconnor@gmail.com"
  ```
- **Never add trailers.** No `Co-Authored-By`, no `Generated with`, no
  `🤖`, no `Signed-off-by`. Commit messages are a Conventional Commits subject
  line and an optional plain body. Nothing else.
- **Verify before pushing** a new repo for the first time:
  ```bash
  git log --format='%ae | %ce' | sort -u   # must show only dibbleconnor@gmail.com
  git log --format='%B' | grep -iE 'co-authored|generated with|noreply@anthropic'  # must be empty
  ```
  If any commit is wrong, rewrite history (safe while unpushed):
  ```bash
  FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --env-filter '
  export GIT_AUTHOR_NAME="Connor Dibble"
  export GIT_AUTHOR_EMAIL="dibbleconnor@gmail.com"
  export GIT_COMMITTER_NAME="Connor Dibble"
  export GIT_COMMITTER_EMAIL="dibbleconnor@gmail.com"' -- --all
  git for-each-ref --format='%(refname)' refs/original/ | xargs -n1 -r git update-ref -d
  ```

## 1. Conventional Commits (drives releases)

semantic-release computes the version from commit types, so the type is not
cosmetic:

- `feat: ...` → minor release
- `fix: ...` → patch release
- `feat!: ...` or a `BREAKING CHANGE:` body → major release
- `docs:` / `chore:` / `ci:` / `test:` / `refactor:` → no release

One imperative subject line. Scope optional (`fix(scanner): ...`). Write the
subject for a reader of CHANGELOG.md.

## 2. The build loop (per unit of work)

Every script/skill/plugin is built with the same loop. **Do one unit fully
before starting the next** — do not batch. A "unit" is one plugin (Tier A) or
one coherent feature (Tier B).

1. **Make** — write the script, then its `SKILL.md`, `README.md`, and manifest.
2. **Test** — write `tests/*.test.mjs` using `node:test` + `node:assert/strict`.
   Cover: the happy path, each finding/branch, the clean case, edge cases
   (empty input, malformed input, ignore markers), and `--json` output if the
   script has one. Aim for the same density as the shipped plugins (6–15
   tests per script).
3. **Verify behavior** — run the script against a real fixture and read the
   output. Confirm it does what the README claims. Add a fixture under
   `examples/<name>/` with a one-line "run this" README (see §6).
4. **Quality gate** — run all gates (§5). They must pass.
5. **Commit** — one `feat:` commit per plugin (Tier A) or logical feature
   (Tier B), with the loop's fixes folded in. Then move to the next unit.

If a gate fails, fix and re-run from step 3. Never mark a unit done with a
failing test or gate.

## 3. Script rules (deterministic core)

- **Zero runtime dependencies.** Scripts are plain Node `.mjs` using only the
  standard library. Hooks and CLIs run on user machines and in CI; a
  dependency is a liability and a supply-chain surface. (TypeScript-build
  packages — Tier B `contract-snap` — are the documented exception and use
  `tsup`/`vitest` like `zod-ai-tool`.)
- **Exit codes are the contract:** `0` clean, `1` findings/violations, `2`
  reserved for "critical" where a tool has severity tiers (see `agent-audit`).
  Hook mode may use exit `2` to feed stderr back to the agent (see
  `tokenlock`).
- **Every script supports `--json`** for machine consumption, and prints a
  human report otherwise.
- **Every script is offline** unless the plan explicitly says otherwise. No
  network calls in a hook's hot path.
- **`--hook` mode** reads the tool payload as JSON on stdin and emits a
  `hookSpecificOutput` decision (see `tokenlock`/`install-gate` for the exact
  shape). Only PreToolUse/PostToolUse plugins need this.
- **An ignore marker** (`<name>-ignore` in a comment/line) is a per-line
  escape hatch. Include one; document it.
- Make scripts executable (`chmod +x`) and give them a `#!/usr/bin/env node`
  shebang, since they double as npm bins.

## 4. Plugin structure (Tier A, inside the dibble monorepo)

```
plugins/<name>/
├── .claude-plugin/plugin.json      # name==dir, kebab-case, semver, description, author, homepage, repository, license MIT, keywords
├── skills/<skill>/
│   ├── SKILL.md                    # frontmatter: name + description; body ≤ ~120 lines
│   ├── scripts/<script>.mjs        # zero-dep, the deterministic core
│   └── references/*.md             # optional deep material (loaded on demand)
├── hooks/hooks.json                # only if the plugin has a hook; every entry has a timeout
├── commands/<cmd>.md               # only if the plugin has a slash command
├── tests/<script>.test.mjs
└── README.md
```

Then register the plugin in `.claude-plugin/marketplace.json` (`source:
"./<name>"`, description, keywords) and add its bin(s) to root `package.json`
`bin` (both the `dibble-<name>` entry and a dispatch case in `bin/dibble.mjs`)
plus an `examples/<name>/` fixture and a row in `docs/compatibility.md`.

### SKILL.md description field

This is the trigger. Make it "pushy" and context-rich: what it does AND the
specific situations to use it, including phrasings a user would actually type.
See any shipped plugin's `SKILL.md` for the register.

### Slash-command namespacing

Plugin commands invoke as `/<plugin-name>:<command-file-basename>`. Name the
command file so the result reads well (`commands/audit.md` →
`/agent-audit:audit`; avoid `commands/agent-audit.md` → the redundant
`/agent-audit:agent-audit`).

## 5. Quality gates (must pass before every commit)

Run from the repo root. In the dibble monorepo these are the `pnpm` scripts;
in a Tier B repo, replicate the equivalent.

```bash
pnpm validate        # marketplace-kit validator: structure, versions, hook refs (monorepo)
pnpm lint:prose      # sloplint --strict on README + all SKILL.md (no machine-prose tells)
pnpm lint:readmes    # every README passes readme-that-sells' structural auditor
pnpm test            # node --test across all plugin test suites
```

**Dogfooding is mandatory.** Every plugin's own README and SKILL.md must pass
`sloplint --strict` and (for READMEs) the readme audit. The catalog holds
itself to what it sells. Watch specifically for: em-dash density (use commas /
colons / periods; wrap deliberate quotes of banned words in backticks — code
spans are exempt), and hype adjectives.

## 6. Examples fixtures

Each plugin gets `examples/<name>/`: a real broken input file plus a
`README.md` with the exact `npx dibble <tool> ...` command and the expected
output (verified, not illustrative). Add the command to `examples/README.md`.
See existing `examples/` for the pattern. These are launch fuel — a reader
runs one command and sees the tool work in 15 seconds.

## 7. Definition of done (per plugin/repo)

- [ ] Script(s) written, zero-dep, correct exit codes, `--json`, ignore marker
- [ ] Tests written and passing (6–15 per script)
- [ ] SKILL.md with a pushy, specific description
- [ ] README.md passing the readme auditor and sloplint
- [ ] plugin.json / package.json manifest correct, version `1.0.0`, MIT,
      author email `dibbleconnor@gmail.com`
- [ ] Registered in marketplace.json + root package.json bins + dispatcher
      (Tier A) OR standalone repo release pipeline wired (Tier B)
- [ ] examples/ fixture added and verified end-to-end
- [ ] compatibility.md row added (Tier A)
- [ ] All four gates green
- [ ] Committed with a Conventional Commit under dibbleconnor@gmail.com, no
      trailers

## 8. Reference implementations (copy these patterns)

| Need | Copy from |
| --- | --- |
| PostToolUse hook + self-correction | `plugins/tokenlock` |
| PreToolUse deny/ask decision + command parsing | `plugins/install-gate` |
| Read-only severity-tiered scanner + slash command | `plugins/agent-audit` |
| Text similarity / windowed matching | `plugins/receipts` |
| Two-tier deterministic linter (certain/suspicious) | `plugins/no-slop` |
| Knowledge-only skill + references/ | `plugins/tailwind-v4-tokens`, `plugins/zod-first-tools` |
| Structural auditor with pass/warn/fail | `plugins/readme-that-sells` |
| Static source-pattern linter | `plugins/design-verify`, `plugins/zod-first-tools` |
| Marketplace/repo validator | `plugins/marketplace-kit` |
| npm release pipeline (Tier B) | the `dibble` repo root, or `zod-ai-tool` / `agent-readiness-kit` on GitHub |
