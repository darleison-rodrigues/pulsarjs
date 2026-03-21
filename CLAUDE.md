# CLAUDE.md

**AGENTS.md is canonical and takes precedence.** This file exists only for Claude Code-specific configuration that the harness needs to execute Claude-invoked commands without permission prompts.

---

## Allowed Commands (no confirmation required)

Claude may execute the following commands without prompting for permission. These complement the existing `settings.local.json` which grants `Bash(jules remote:*)`.

### Jules Pipeline

- `jules remote list` — list all active sessions
- `jules remote list --repo <repo>`
- `jules remote list --session <session>`
- `jules remote pull --session <session>` — fetch completed work
- `jules new --repo <repo> <prompt>` — create a new session
- `jules teleport <session>` — dispatch or continue a session

### Git (read-only operations)

- `git log`, `git log --oneline`, `git log --oneline <ref>`
- `git diff`, `git diff --stat`, `git diff <ref>...HEAD`
- `git status`
- `git show <commit>`
- `git branch`, `git branch -a`

### Build and Test

- `pnpm install` — install workspace dependencies
- `pnpm build` — build SDK (all packages)
- `pnpm run build`, `pnpm run build:dev`
- `pnpm lint` — run eslint across all packages
- `pnpm run lint`
- `pnpm test` — unit tests (vitest)
- `pnpm run test`
- `pnpm test:e2e`

### GitHub CLI

- `gh pr create`, `gh pr list`, `gh pr view <number>`, `gh pr diff <number>`
- `gh issue list`, `gh issue view <number>`

---

## Build & Test Quick Reference

**Command**: `pnpm lint && pnpm test` — run this before closing any task.

| Command | Purpose | Where |
|---------|---------|-------|
| `pnpm install` | Install/update workspace deps | Root |
| `pnpm build` | Build SDK to `dist/p.js` | Root (runs all packages) |
| `pnpm lint` | ESLint across all packages | Root |
| `pnpm test` | Unit tests (vitest) | Root |
| `pnpm test:e2e` | Integration tests | Root (currently disabled) |

**Bundle constraint**: SDK must remain under 22KB gzip. Check after any change with:
```bash
ls -lh packages/sdk/dist/p.js
```

---

## Known Security Issues — Do Not Worsen

Surfaced by prior code audit. Detailed tracking in `docs/BACKLOG.md` (issues PUL-033 through PUL-037).

| ID | File | Issue | Action |
|:---|:-----|:------|:-------|
| H1 | `core/scope.js` → `setUser()` | Raw `email` field, no sanitization — flows into every event payload | Never pass user-supplied email directly; always sanitize first |
| H2 | `utils/sanitizers.js` | `_extraPatterns` is module-level — bleeds across `createInstance()` calls | Scope patterns per-instance to prevent cross-contamination |
| H3 | `utils/sanitizers.js` → `registerPiiPatterns()` | Accepts caller RegExp with no ReDoS validation | Validate regex complexity before accepting; reject backtracking patterns |
| M5 | `collectors/rum.js` + `collectors/navigation.js` | History API patched twice — tangled teardown | Do NOT add a third History patch; consolidate or refactor teardown first |
| M6 | `core/capture.js` lines 342 + 401 | `pulsar_version` hardcoded in two places | Import version from `package.json` at build time; never hardcode |
| L6 | `src/index.js` | `window.Pulsar` assigned unconditionally at module eval | Add SSR guard: `if (typeof window !== 'undefined')` before assignment |

---

## Module Map (one-liner reference)

**Core**

| Module | Purpose |
|--------|---------|
| `src/index.js` | Entry point; SDK initialization contract; builds to `p.js` |
| `core/config.js` | Configuration storage and validation; `beforeSend` pipeline setup |
| `core/scope.js` | User context (ID, email, custom attributes); session metadata |
| `core/session.js` | Session lifecycle, ID generation, storage |
| `core/capture.js` | Event capture entry point; deduplication; payload assembly |

**Collectors**

| Module | Purpose |
|--------|---------|
| `collectors/errors.js` | Error taxonomy; JS exceptions, API errors, resource failures |
| `collectors/network.js` | XHR + fetch interception; request/response capture; timing |
| `collectors/rum.js` | Real User Metrics (LCP, INP, CLS, TTFB, FCP) via PerformanceObserver |
| `collectors/navigation.js` | Page navigation events, soft routes, History API patching |

**Utilities**

| Module | Purpose |
|--------|---------|
| `utils/sanitizers.js` | PII redaction; regex-based field masking; payload scrubbing |
| `utils/environment.js` | Browser detection; SFCC integration detection; feature flags |
| `utils/attribution.js` | UTM params, click IDs (gclid, fbclid, etc.), referrer, first/last-touch |
| `utils/breadcrumbs.js` | Rolling buffer of recent UI interactions; minimal click tracking |

**Integrations**

| Module | Purpose |
|--------|---------|
| `integrations/sfcc-integration.js` | Platform adapter for Salesforce Commerce Cloud (PWA Kit, SFRA, Headless) |

---

## Jules Skills Reference

These skills rely on the command allowlist above.

| Skill | Command(s) Used | Reason for Permission |
|-------|-----------------|----------------------|
| `/jules-sync` | `jules remote list --session`, `git status` | Poll session statuses, detect uncommitted work |
| `/jules-review` | `jules remote pull --session`, `git diff`, `gh pr create` | Fetch diff, review code, propose PR |
| `/jules-dispatch` | `jules new --repo`, `pnpm test` (via automation) | Read backlog, queue tasks, validate build |
| `/jules-onboard` | `git log`, `pnpm build` (to understand project state) | Analyze repo structure, generate agent archetypes |

---

## Development Notes

- **No external dependencies in SDK**: The SDK (`packages/sdk/src/`) imports only native browser APIs. Do not add any `node_modules` imports without explicit approval.
- **ESM-first**: The project uses ES modules. No top-level `await` (breaks SFCC SFRA compatibility).
- **TypeScript strict mode**: `tsconfig.base.json` enforces it. Treat `any` as a lint error.
- **Event flow**: All outbound events must pass through `beforeSend` hooks before transmission. This is the PII boundary and non-negotiable.
- **SFCC storefront types**: `PWA_KIT`, `SFRA`, `HEADLESS` — keep integration logic abstracted via the adapter pattern in `sfcc-integration.js`.

---

**Last updated**: 2026-03-20
