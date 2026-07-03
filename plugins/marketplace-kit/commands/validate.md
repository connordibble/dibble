---
description: Validate the current plugin marketplace repo against the invariants that break installs and community-marketplace submissions.
---

Validate this plugin marketplace repository.

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/skills/marketplace-kit/scripts/validate-marketplace.mjs ${CLAUDE_PROJECT_DIR}`
2. If there are errors, read the `marketplace-kit` skill and walk each one with
   the fix. Group by plugin. Explain why each matters (e.g. a version mismatch
   is the top submission-rejection cause).
3. If it's clean, confirm the repo is submission-ready and note the remaining
   manual steps (git tag matching plugin.json version, submitting via the
   in-app form).
