# PulsarJS SDK — Release Readiness & Repo Audit

**Date:** 2026-03-13
**Benchmark:** Production-grade OSS SDKs (claude-code, gemini-cli, sentry-javascript)

---

## Release Readiness: SDK v1.0.0

### Ready (ship-blocking items resolved)

| Area | Status | Notes |
|---|---|---|
| Core capture pipeline | **PASS** | event_id, deduplication, queue overflow, debounced flush |
| 15 event types | **PASS** | All collectors wired: errors, network, rum, navigation, interactions |
| Campaign attribution (16 click IDs) | **PASS** | Expanded in navigation.js |
| SFCC integration (PWA Kit + SiteGenesis) | **PASS** | Context extraction, SCAPI commerce action mapping |
| Privacy (PII redaction, URL sanitization) | **PASS** | Sanitizers applied at capture time, no cookies |
| beforeSend hook + timeout circuit breaker | **PASS** | Async with configurable timeout |
| Clean teardown on disable() | **PASS** | All listeners and patches removed |
| Zero dependencies | **PASS** | Single IIFE bundle, esbuild |
| Bundle size (~22KB gzip) | **PASS** | CI gate added at 25KB |
| Origin-based auth (no HMAC) | **PASS** | Client-side HMAC removed |
| License (BSL 1.1) | **PASS** | In repo |

### Not Ready (must fix before GA)

| # | Area | Severity | Issue |
|---|---|---|---|
| 1 | **Test coverage** | **P0** | 1 unit test file (hash only), 1 E2E file. Production SDKs have 80%+ coverage. Need tests for: config validation, scope/tags, each collector, beforeSend, queue overflow, flush retry, disable/enable, SFCC context extraction. |
| 2 | **E2E test environment** | **P1** | E2E relies on external `serve` + hardcoded `localhost:3000`. Needs a self-contained test server in playwright config. |
| 3 | **Version injection** | **P1** | `pulsar_version: '1.0.0'` is hardcoded in capture.js:164. Should be injected by esbuild `define` from package.json. |
| 4 | **No coverage thresholds** | **P1** | vitest.config not enforcing minimum coverage. Add `--coverage` with thresholds. |
| 5 | **TypeScript declarations** | **P2** | No `.d.ts` for public API. Consumers importing via npm get no type hints. |
| 6 | **Source map upload CLI** | **P2** | packages/cli/ placeholder — deferred. |

---

## Repo Configuration Audit

### What's fixed in this session

| Item | Before | After |
|---|---|---|
| CI workflow | Single serial job, all steps chained | 4 parallel jobs: lint, build+size, unit, E2E |
| Bundle size gate | None | Fails CI if >25KB gzip |
| Bundle artifact | Not saved | Uploaded to GitHub Actions artifacts |
| E2E failure report | Lost | Playwright report uploaded on failure |
| Husky hooks | v8 format in `.husky/_/` (dead with husky 9) | v9 format `.husky/pre-commit` → lint-staged |
| .nvmrc | Missing | Pinned to Node 20 |
| .editorconfig | Missing | Added (4-space indent, LF, UTF-8) |
| Unit test | Tested removed `generateSignature` (HMAC) — **would crash** | Fixed: tests `hash()` only |
| E2E test schema | Asserted `error_type` (old schema) | Fixed: asserts `event_type` |

### Gaps vs. production-grade repos

| Area | claude-code / gemini-cli standard | PulsarJS current | Priority |
|---|---|---|---|
| **Test coverage** | 80%+ with coverage gates | ~5% (2 test files) | **P0** |
| **Coverage reporting** | Codecov/Coveralls in CI | None | P1 |
| **Commit convention** | commitlint + conventional commits | None enforced | P2 |
| **Prettier / formatting** | Enforced in CI | ESLint only (no formatting rules) | P2 |
| **CODEOWNERS** | Present for review routing | Missing | P2 |
| **Branch protection** | Required reviews, status checks | Not configured | P2 |
| **Changelog automation** | changesets / release-please | Manual CHANGELOG.md | P3 |
| **Renovate / Dependabot** | Automated dependency updates | None | P3 |
| **Security scanning** | CodeQL / Snyk in CI | None | P3 |
| **Contributing guide** | CONTRIBUTING.md | Missing | P3 |
| **NPM publish workflow** | CI-gated release to npm | No publish pipeline | P3 (SDK is CDN-distributed) |

### Husky + lint-staged status

- **Before:** Husky 9 installed, but hooks lived in `.husky/_/` (v8 internal directory). The pre-commit hook was a shell shim that sourced `h` — **lint-staged never ran**.
- **After:** `.husky/pre-commit` now calls `pnpm exec lint-staged`. ESLint auto-fix runs on staged `.js/.ts/.tsx` files before every commit.

---

## Recommended Next Steps (priority order)

### P0 — Before investor demo
1. **Write unit tests** for core modules: `config.js`, `scope.js`, `session.js`, each collector, `capture.js` (full pipeline), `sanitizers.js`
2. **Add vitest coverage** with `--coverage` flag and 70% threshold minimum
3. **Fix version injection** — esbuild `define: { __VERSION__: JSON.stringify(pkg.version) }`

### P1 — Before public beta
4. Add coverage badge to README (via Codecov or shields.io)
5. Self-contained Playwright test server (remove `serve` dependency)
6. Add `.d.ts` type declarations for public API

### P2 — Professional polish
7. Add commitlint + `@commitlint/config-conventional`
8. Add CODEOWNERS file
9. Set up branch protection rules on GitHub
10. Add Dependabot config for automated dependency PRs

### P3 — Nice to have
11. Add release-please for automated changelogs
12. Add CodeQL workflow for security scanning
13. Add CONTRIBUTING.md
