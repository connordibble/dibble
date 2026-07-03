# Plan: skillscan (Tier B, own repo)

> Read [00-CONVENTIONS.md](../00-CONVENTIONS.md) first. Tier B = its own
> GitHub repo and its own release pipeline. This plan includes the repo
> scaffolding the monorepo plans don't need.

## One-line pitch

Static safety scanner for third-party Agent Skills and Claude Code plugins:
point it at a skill/plugin (or a whole marketplace) and it flags the risky
patterns — before you install.

## Why it stands out / why Connor

15,000+ indexed plugin repos and essentially no vetting layer. The academic
work (SkillTester, SkillsBench) made "skills can be malicious" legible; nobody
shipped the practical "check before you install" tool. Extends `agent-audit`'s
read-only-scan philosophy from *your* config to *other people's* code. This is
the tool behind the highest-upside security launch: **"I scanned N public
plugins, here's what I found."**

## The clever differentiator

**It scans at marketplace scale and produces a ranked risk report, so the
launch artifact and the tool are the same thing.** Two modes: scan one
skill/plugin before install (the utility), and scan an entire marketplace's
catalog and rank by risk (the headline generator). The findings map to concrete
attack patterns (lifecycle install hooks, network-exfil in bundled scripts,
credential access, prompt-injection payloads in SKILL.md, SessionStart
persistence), each with a real exploit path — never "looks suspicious."

## Repo scaffolding (Tier B specifics)

Repo: `connordibble/skillscan`. Published to npm as `skillscan` (verify name is
free; fallback `skill-scan`). Structure — mirror `zod-ai-tool` / the dibble
root pipeline:

```
skillscan/
├── .github/workflows/ci.yml       # test matrix (node 20/22/24) + release job (copy dibble ci.yml, swap npm name/url)
├── .releaserc.json                # identical plugin chain to dibble/.releaserc.json (no plugin-version sync step needed)
├── .gitignore .npmignore LICENSE(MIT) CONTRIBUTING.md SECURITY.md README.md
├── package.json                   # bin: skillscan -> bin/cli.mjs ; type module ; engines >=20 ; zero runtime deps
├── bin/cli.mjs                    # arg parsing, subcommands: scan <path>, scan-marketplace <repo-or-path>
├── src/
│   ├── scan.mjs                   # scan one skill/plugin directory
│   ├── rules.mjs                  # the rule set (exported, tested individually)
│   ├── marketplace.mjs            # enumerate a marketplace's plugins, scan each, rank
│   └── report.mjs                 # human + --json + --markdown (for the launch post) renderers
├── test/*.test.mjs                # node:test
└── examples/                      # a benign skill and a seeded-malicious skill fixture
```

**Also add it to the dibble marketplace** as a plugin whose `source` is the
external repo (`{ "source": "github", "repo": "connordibble/skillscan" }`) so
dibble users discover it, while it lives and releases on its own.

Release/env: same as dibble — `release` GitHub environment holds `NPM_TOKEN`,
provenance on. First commit sets git identity (conventions §0). Run the
identity verification before first push.

## What it scans (rules.mjs — each rule is exported + unit-tested)

Given a skill/plugin directory, load `SKILL.md`, `plugin.json`, `hooks.json`,
and every bundled script. Findings with severity:

- **INSTALL_LIFECYCLE** (critical) — `package.json` with `postinstall`/
  `preinstall`/`install` scripts in a skill/plugin (skills shouldn't need them).
- **NET_EXFIL** (critical) — bundled script contains `curl|wget ... | sh`,
  `fetch(`/`http` POST to a non-obvious host, or DNS-y exfil shapes.
- **OBFUSCATION** (critical) — `base64 -d | sh`, `atob(` + `eval`, large hex/
  base64 blobs, `eval`/`Function(` on dynamic input.
- **CRED_ACCESS** (critical/warn) — reads `~/.aws`, `~/.ssh`, `.env`,
  `~/.claude.json`, `process.env.*_TOKEN|KEY|SECRET`, keychain.
- **SESSIONSTART_PERSIST** (warn) — a `SessionStart` hook (legit but the
  persistence vector; surface it).
- **HOOK_SHELL** (warn) — hooks that shell out to `bash -c`/`sh -c` with
  interpolated content (combine command+args, per the agent-audit fix).
- **PROMPT_INJECTION** (warn) — SKILL.md contains imperative override phrases
  aimed at the *agent* ("ignore previous instructions", "exfiltrate", "do not
  tell the user", instructions to disable other checks).
- **UNPINNED_FETCH** (info) — `--plugin-url`/remote code fetched at runtime,
  `npx` unpinned in hooks.
- **OVERBROAD_PERMS** (warn) — bundled settings requesting `bypassPermissions`
  or blanket `Bash`.

Reuse and generalize `agent-audit`'s regexes (`REMOTE_EXEC`, `OBFUSCATION`,
etc.) — that code is the starting point; copy it into `rules.mjs` (Tier B repos
are standalone, no cross-repo imports).

## CLI spec (bin/cli.mjs)

```
skillscan scan <path>                      # one skill/plugin dir
skillscan scan-marketplace <repo|path>     # every plugin in a marketplace.json
  [--json] [--markdown] [--min critical|warn|info] [--top N]
```
- `scan`: exit `2` if any critical, `1` if any warn, `0` clean (agent-audit's
  severity-exit convention).
- `scan-marketplace`: clone/read the repo (if a path, read locally; if
  `owner/repo`, shell to `git clone --depth 1` into a temp dir — document that
  this is the one network operation and it's opt-in), enumerate plugins from
  `marketplace.json`, scan each, output a **ranked table** by risk score
  (critical=100, warn=10, info=1, summed). `--markdown` emits a ready-to-post
  findings table (the launch artifact). `--top N` limits output.
- Always operates read-only; never executes any scanned code. State this
  loudly in the README — a scanner that runs the thing it's scanning is absurd.

## Test cases (test/)
- Per-rule unit tests in `rules.test.mjs` (one benign + one triggering input
  each — ~9 rules × 2).
- `scan.test.mjs`: benign skill fixture → clean exit 0; seeded-malicious
  fixture (postinstall + curl|sh + base64) → 3 criticals exit 2; SessionStart-
  only skill → warn exit 1.
- `marketplace.test.mjs`: a fixture marketplace with 3 plugins (one clean, one
  warn, one critical) → ranked table orders critical first; `--markdown`
  renders a table; `--top 2` truncates.
- `report.test.mjs`: `--json` schema; markdown escaping.

## README shape (passes readme-that-sells auditor)
Hero: the ranked-table output on a real marketplace. Install: `npx skillscan
scan ./some-plugin`. Honest-limits section: static and heuristic; can't catch a
scanned package that's benign at scan time and malicious after update; not a
sandbox. Cross-link agent-audit (audit your own config) as the sibling.

## SECURITY.md
Same policy shape as dibble's; note that a false-negative (missed malicious
pattern) is the highest-priority report class.

## Definition of done (Tier B additions to conventions §7)
- [ ] Own repo created, MIT, README passes the auditor (vendor a copy of the
      readme-audit script or run `npx dibble readme-audit` against it)
- [ ] CI green on the matrix; release job configured; `release` env + NPM_TOKEN
- [ ] npm name confirmed; `1.0.0`; provenance
- [ ] Listed in the dibble marketplace as an external-source plugin
- [ ] Identity verification (conventions §0) clean before first push

## Effort
Medium (the rules are mostly portable from agent-audit; the marketplace-scale
scan + ranked/markdown report is the new work). The launch value is the highest
in the whole catalog — prioritize the `scan-marketplace --markdown` path.
~1–2 sessions.
