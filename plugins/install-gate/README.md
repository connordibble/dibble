# install-gate

**Your agent installs packages all day. One hallucinated name is all it
takes.**

install-gate is a PreToolUse hook that inspects every package-install command
before it runs (npm, pnpm, yarn, bun, pip, and cargo) and turns the risky
ones into a decision instead of a silent execution.

```
$ pnpm add chalt

install-gate flagged: pnpm add chalt
  [BLOCK] "chalt" is one character from the popular package "chalk" — classic typosquat
```

## What it catches

| Category | Example | Decision |
| --- | --- | --- |
| Typosquats | `chalt`, `reqeusts`, `lodahs` | **deny** |
| Scope impersonation | `@type/node` vs `@types/node` | **deny** |
| Explicit script approval | pnpm `--allow-scripts` | **deny** |
| Root Python install | `sudo pip install` | **deny** |
| Slopsquat-shaped names | `ai-utils-helper` (the names models invent) | **verify** it exists first |
| Non-registry sources | git URLs, tarballs | **verify** the origin consciously |

BLOCK is a deny on both hosts. Claude Code represents VERIFY as an `ask`
permission decision. Codex hooks do not currently support `ask`, so the hook
injects the same finding as additional context and leaves the normal Codex
approval flow intact. Chained commands are parsed too, so
`cd /tmp && npm i chalt` is still seen.

## Why offline

The gate makes no network calls. An install should never wait on a third
party, and a security hook that phones home is its own supply-chain surface.
Instead it ships a deliberately bounded typosquat magnet set: 123 npm names,
83 Python names, and 59 Cargo names. It tells the agent exactly what to verify
against the registry when a name is merely suspicious. The verification step
is one `npm view` away and the skill teaches it.

## Install

```
/plugin marketplace add connordibble/dibble
/plugin install install-gate@dibble
```

CLI mode doubles as a CI lint for install commands in scripts and Dockerfiles:

```bash
node skills/install-gate/scripts/gate.mjs "npm install foo" && echo ok
```

## Honest limits

Heuristic and offline by design. It cannot see download counts, package age,
advisories, or registry metadata such as lifecycle scripts. npm and pnpm may
run lifecycle scripts by default even without a special flag. Use
`--ignore-scripts` when evaluating an unfamiliar package, then inspect and
allow only the scripts you trust. The gate also cannot catch a compromised
version of a correctly named popular package; that is where lockfiles and
`npm audit`/`pip-audit` in CI apply. An exotic but real package may draw a
VERIFY prompt. See [agent-audit](../agent-audit) for the config-integrity layer
of the same story.

Part of the [dibble](../../README.md) catalog. MIT.
