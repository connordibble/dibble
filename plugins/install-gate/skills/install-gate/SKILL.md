---
name: install-gate
description: Supply-chain safety for package installs. Use when installing dependencies (npm/pnpm/yarn/bun, pip, cargo), when an install-gate report flags a package, when adding a dependency an AI or a snippet suggested, or when reviewing a package's safety before adding it. Especially relevant when the package name is unfamiliar, generic-sounding, or came from a model that might have hallucinated it.
---

# Installing packages without inheriting someone else's supply chain

Package installs are the most direct code-execution path into a machine: the
name resolves to code, and lifecycle scripts can run it before you've imported
anything. A PreToolUse hook checks install commands against offline heuristics
and blocks or questions the risky ones. This skill explains the categories so
you resolve a flag correctly instead of reflexively overriding it.

## The failure modes it catches

- **Typosquats.** A name one character off a popular package (`chalt` for
  `chalk`, `reqeusts` for `requests`). Blocked. There is no benign reason to
  install these; it's a fat-finger or a copy from a poisoned source.
- **Slopsquats.** Plausible-but-nonexistent names that models invent
  (`ai-utils-helper`, `openai-sdk-client`). An attacker registers the name a
  model is likely to hallucinate, then waits. Flagged for verification because
  the hook can't check existence offline; you can, in one lookup.
- **Install-time execution.** `--allow-scripts`, `--unsafe-perm`, `sudo pip`.
  Blocked. These hand every dependency a chance to run code at install.
- **Non-registry sources.** Git URLs, tarballs, `file:` specs. Questioned, not
  blocked: sometimes legitimate, but they skip the registry's takedown and
  scanning, so they deserve a conscious yes.

## Resolving a flag

**BLOCK findings** mean don't proceed as written. For a typosquat, the fix is
almost always the correctly-spelled popular package the report names, so
install that instead. For lifecycle-script flags, drop the flag; if a specific
trusted dependency genuinely needs its build script, allow that one package
explicitly rather than enabling scripts globally.

**VERIFY findings** mean confirm one fact before continuing. For a
slopsquat-shaped name, actually check the registry
(`npm view <name>`, `pip index versions <name>`, or the package page) and
confirm it exists, is not brand-new with zero downloads, and is the package
you meant. If a model suggested the dependency, this step is where you catch a
hallucinated import before it becomes an install. For a non-registry source,
confirm you trust the origin and, ideally, pin to a commit rather than a
moving branch.

Do not blanket-override the gate. When a flag is a false positive (a real,
correctly-spelled package that happens to look generic), install it and move
on. The gate exists to convert a silent install into a two-second decision,
not to be argued with.

## Checking a command without installing

```bash
node <this-skill-directory>/scripts/gate.mjs "pnpm add some-package"
```

Exits 1 if anything would be blocked, 0 otherwise, so it doubles as a CI
lint on install commands in scripts or Dockerfiles.

## What it does not do

It is offline and heuristic. It does not query the registry, so it can't see
download counts, package age, or a known-CVE advisory, and it won't catch a
compromised version of a legitimately-named popular package. Treat it as the
name-and-shape layer. Pair it with a lockfile, `npm audit`/`pip-audit` in CI,
and reading the source of anything unfamiliar before you depend on it. The
bundled popularity lists are a typosquat magnet set, not the whole registry;
an exotic-but-real package may draw a VERIFY, which is working as intended.
