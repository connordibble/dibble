# Skill evaluation corpus

`skill-evals.json` is the catalog's host-neutral behavioral contract. Every
skill has five representative cases recommended by OpenAI's skill guidance:
direct activation, indirect activation, an incomplete request, a request that
should not activate the skill, and an edge case that must not invent evidence
or perform an unsupported action.

`plugin-inspector` validates coverage and fails when a skill is missing a case.
The corpus is intentionally model- and host-neutral: run the prompts in fresh
Codex, ChatGPT, or Claude Code conversations when qualifying a host release,
then judge both whether the skill activated and whether the observable
criterion in `expected` was met. Static coverage is not presented as a model
quality score.
