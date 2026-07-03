# Security Policy

This catalog includes security-adjacent tools ([agent-audit](plugins/agent-audit),
[install-gate](plugins/install-gate)) that make claims about what's safe. Those
claims need to be trustworthy, and a vulnerability report against them is a
higher priority than a normal bug.

## Reporting a vulnerability

Email **cdibb44@gmail.com** with a subject line starting `[dibble security]`.
Please include:

- which plugin and version (or commit SHA)
- the specific input or configuration that triggers the issue
- what you expected the tool to detect or block, and what it did instead

Do not open a public GitHub issue for a vulnerability until a fix has shipped.
For a detection gap in agent-audit or install-gate specifically (a pattern
that should be flagged but isn't), a private report gives time to ship the
fix before the gap is public knowledge.

## Response

Acknowledgment within 5 business days. If confirmed, a fix targets the next
patch release; `install-gate` and `agent-audit` detection gaps are treated as
`fix:` commits (patch release) regardless of how the change is implemented
internally, so semantic-release ships them promptly. Credit in the release
notes if you'd like it; anonymous reporting is fine too.

## Scope

In scope: the checkers themselves (false negatives especially — a check that
should catch something and doesn't), the hooks and their permission
decisions, the marketplace/plugin manifests, and the release pipeline
(supply-chain integrity of what gets published to npm and the Claude Code
marketplace).

Out of scope: vulnerabilities in Claude Code itself, in third-party packages
this repo doesn't control, or in a project that installed these plugins but
misconfigured them contrary to the documented usage.

## What these tools do not guarantee

Both agent-audit and install-gate are documented as heuristic and honest
about their limits (see each plugin's README, "Honest limits" /
"What this audit cannot see"). A missed detection in a documented blind spot
is expected behavior, not a vulnerability, unless you believe the blind spot
itself should be closed, in which case a report is still welcome; a lot of
the fixes here started exactly that way.
