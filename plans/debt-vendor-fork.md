# Technical Debt: Vendor Fork Management

## Problem

The AI vendor at `apps/server/src/ai/vendor/` is a fork of pi's `packages/agent`
and `packages/ai`. The fork has:

1. **33 broken imports** in `all.ts` (never imported, but dangerous)
2. **8 dead type imports** in `types.ts` (hidden by `@ts-nocheck`)
3. **Missing auth/oauth dependency** in `auth/types.ts` and `auth/resolve.ts`
4. **Broken export** in `node.ts`
5. **Zero version tracking** — no pinned version, no sync process
6. **Structural divergence** — files moved, imports rewritten, new modules added
7. **Dead code files** that exist but are never used
8. **No changelog** of changes relative to upstream

## Scope of Work

### Phase 1: Sanitize the fork (immediate, 1 day)

Delete dead code and fix broken imports. This is safe because the deleted files
have zero consumers.

**Files to delete (unreferenced dead code):**
```
ai/src/providers/all.ts              # 33 broken imports, never imported
agent/src/node.ts                     # broken export, never imported
```

**Files to fix (broken imports):**
```
ai/src/types.ts                       # remove 8 dead import types, remove @ts-nocheck
ai/src/auth/types.ts                  # fix or remove oauth import, remove @ts-nocheck
ai/src/auth/resolve.ts                # fix or remove oauth import, remove @ts-nocheck
```

**Files to audit for @ts-nocheck:**
- `ai/src/api/openai-completions.ts` — verify the nocheck is actually needed
- `agent/src/index.ts` — has nocheck on wildcard re-exports

---

### Phase 2: Establish version tracking (medium-term, 0.5 day)

Create a manifest file that tracks the fork's upstream version:

```bash
# Create a manifest at vendor/VERSION
cat > apps/server/src/ai/vendor/VERSION << 'EOF'
# Vendor fork manifest
# Last sync: 2026-07-10
# Upstream: https://github.com/earen/pi
# Upstream ref: abc123def...
# Sync method: manual (diff + selective port)
#
# Files modified from upstream:
# - ai/src/api/openai-completions.ts   (added CrewFactory auth integration)
# - ai/src/compat.ts                   (stripped providers, added registerFauxProvider)
# - agent/src/agent.ts                 (added prepareNextTurnWithContext hook)
# - ai/src/types.ts                    (added auth-related types)
# - ai/src/providers/openrouter-images.ts  (CrewFactory addition)
#
# Files added (not in pi):
# - ai/src/auth/                       (credential store, auth resolution)
# - ai/src/utils/retry.ts
# - ai/src/utils/error-body.ts
# - ai/src/utils/estimate.ts
#
# Files removed from pi:
# - ai/src/providers/anthropic.ts
# - ai/src/providers/google.ts
# - ai/src/providers/amazon-bedrock.ts
# - ai/src/providers/mistral.ts
# - ai/src/providers/openai-responses.ts
# - ai/src/providers/openai-codex-responses.ts
# - ai/src/providers/azure-openai-responses.ts
# - ai/src/providers/cloudflare.ts
# - ai/src/providers/github-copilot-headers.ts
# - ai/src/providers/google-shared.ts
# - ai/src/providers/google-vertex.ts
# - ai/src/providers/simple-options.ts
# - ai/src/providers/transform-messages.ts
# - ai/src/providers/openai-prompt-cache.ts
# - ai/src/providers/openai-responses-shared.ts
# - ai/src/providers/register-builtins.ts
# - ai/src/utils/oauth/              (entire directory)
# - ai/src/utils/node-http-proxy.ts
# - ai/src/stream.ts
# - ai/src/oauth.ts
# - ai/src/api-registry.ts
# - ai/src/models.generated.ts
# - agent/src/harness/env/nodejs.ts
# - agent/src/node.ts
EOF
```

This manifest should be updated every time a change is ported from pi.

---

### Phase 3: Migration strategy (long-term decision)

Three options for forward direction:

#### Option A: Keep the fork, but clean it (recommended for now)

- Sanitize (Phase 1)
- Document changes (Phase 2)
- When pi updates, manually diff the files we actually use and port relevant changes
- Files in scope for syncing: `agent-loop.ts`, `agent.ts`, `types.ts`,
  `harness/` (session, compaction, skills, types), `utils/` (event-stream,
  validation, hash, headers, overflow)

**Time per sync:** 2-4 hours (diff + test + fix conflicts)

**Risk:** Low — most files are identical to pi's

#### Option B: Consume pi as an npm dependency

If pi is published as an npm package, consume it directly:
```json
{
  "dependencies": {
    "@earendil-works/pi-agent": "^x.y.z",
    "@earendil-works/pi-ai": "^x.y.z"
  }
}
```

Then import `Agent` and utilities directly, and only keep our custom
`auth/`, `compat.ts`, and provider wrappers.

**Time:** 2-3 days to refactor imports and adapt to any API changes

**Risk:** Medium — pi's API may differ from what our fork expects

#### Option C: Eliminate the fork entirely, vendor only what we need

Instead of vendoring entire packages, cherry-pick only the files CrewFactory
actually uses. Use a script to copy them from pi with automatic import rewriting.

```bash
scripts/vendor-sync.sh
# Copies only:
# - agent-loop.ts, agent.ts, types.ts
# - harness/session/, harness/compaction/, harness/types.ts
# - ai/src/compat.ts (our custom version)
# - ai/src/utils/event-stream.ts, validation.ts, etc.
```

**Time:** 1 day to create the sync script

**Risk:** Low — we already know exactly which files we use

---

### Phase 4: Testing infrastructure

Add a smoke test that verifies the vendor is in a valid state:

```typescript
// apps/server/src/__tests__/vendor-smoke.test.ts
import { describe, it, expect } from "bun:test";

describe("Vendor integrity", () => {
  it("compat.ts can register openai-completions", () => {
    const { registerBuiltInApiProviders, getApiProvider } = require("../ai/vendor/ai/src/compat.ts");
    registerBuiltInApiProviders();
    expect(getApiProvider("openai-completions")).toBeDefined();
  });

  it("agent-loop exports runAgentLoop", () => {
    const { runAgentLoop } = require("../ai/vendor/agent/src/agent-loop.ts");
    expect(typeof runAgentLoop).toBe("function");
  });

  it("types.ts has no broken imports", () => {
    // Just importing the module should not throw
    const types = require("../ai/vendor/agent/src/types.ts");
    expect(types).toBeDefined();
  });

  it("auth module resolves credentials", () => {
    const { resolveCredentials } = require("../ai/vendor/ai/src/auth/resolve.ts");
    expect(typeof resolveCredentials).toBe("function");
  });
});
```

---

## Implementation Order

| Phase | Effort | Priority | Why |
|-------|--------|----------|-----|
| 1 — Sanitize | 1 day | **IMMEDIATE** | Dead code is a ticking time bomb |
| 4 — Smoke tests | 0.5 day | HIGH | Prevents regressions |
| 2 — Version manifest | 0.5 day | MEDIUM | Enables future sync |
| 3 — Migration strategy | Decision | MEDIUM | Long-term maintainability |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| A new import triggers all.ts | Low | Critical (33 broken imports) | Delete all.ts NOW |
| @ts-nocheck hides real type errors | Medium | Medium | Remove nochecks, fix errors |
| pi upstream makes breaking changes | Low | High | Version manifest tracks what we sync'd from |
| We need a new provider (e.g. Anthropic) | Medium | High | Port provider from pi (exists, just not vendored) |
