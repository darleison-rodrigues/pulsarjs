# PulsarJS Release Orchestration — v1.0.0

**Date:** 2026-03-20 | **Status:** Approved for Phase 0 execution | **Scope:** 4-week release cycle

---

## Executive Summary

PulsarJS has feature-complete core (15 event types, capture pipeline, SFCC integration, privacy/PII handling), but **test coverage is ~5%** and **critical hardening (PUL-050) is not yet complete**. The path to v1.0.0 requires **phased, dependency-respecting work** where GitHub Actions gates enforce sequencing.

**The Problem**: CI is enabled for tests that don't exist, and code hasn't been hardened yet. Tests fail not because code is broken, but because defenders haven't been written.

**The Solution**: Four phases with explicit CI gates. Each phase blocks on the previous one.

- **Phase 0 (Weeks 1-2)**: Harden SDK (PUL-050) — H1-H3 security + M5-M6 code health fixes
- **Phase 1 (Weeks 2-3)**: Write integration tests (PUL-051) — 70%+ coverage
- **Phase 2 (Weeks 3-4)**: Write E2E tests (PUL-052) — real browser validation
- **Phase 3 (Week 4)**: Release v1.0.0 — version injection, TypeScript defs, ship

---

## Phase 0: Stabilize (Weeks 1-2) — SDK Hardening

**Goal**: Wrap every public method, collector, and callback in try/catch so the SDK **never crashes the host page**.

**Blocking Issues** (from CLAUDE.md + BACKLOG.md):
- **H1**: `scope.js` → `setUser()` raw email, no sanitization
- **H2**: `sanitizers.js` → module-level `_extraPatterns` bleeds across instances
- **H3**: `sanitizers.js` → `registerPiiPatterns()` accepts unvalidated RegExp (ReDoS risk)
- **M5**: `collectors/{rum,navigation}.js` → History API patched twice, tangled teardown
- **M6**: `core/capture.js` → `pulsar_version` hardcoded in 2 places
- **L6**: `src/index.js` → `window.Pulsar` assigned unconditionally (no SSR guard)

**Agent Work**:

| Agent | Task | Deliverable |
|-------|------|-------------|
| **Jules Sentinel** | Fix H1-H3 security issues | Pull request: `security/h1-h2-h3-fixes` |
| **Jules Medic** | Fix M5-M6 code health issues | Pull request: `refactor/m5-m6-consolidation` |

**Manual Work**:
- Code review of hardening changes (security + behavioral coverage)
- Local testing: manually throw errors in collectors, verify SDK captures events instead of crashing
- Defensive scenario validation (missing globals, timing errors, etc.)

**CI Gates (Phase 0)**:
```
✅ Lint:         All PRs (required)
✅ Build:        All PRs (required, <25KB gzip)
⚠️  Unit tests:  OPTIONAL — will expand in Phase 1
❌ Integration:  DISABLED (not yet written)
❌ E2E:          DISABLED (if: false in workflow)
```

**Success Criteria**:
- [ ] H1-H3 + M5-M6 issues resolved in code (verified by code review)
- [ ] `tests/unit/hardening.test.js` passes (defensive scenarios)
- [ ] Local manual testing: SDK continues capturing when collectors throw
- [ ] Build <25KB, no lint errors
- [ ] Security audit sign-off from team

**Timeline**: 3-4 days (Jules agents) + 2-3 days (manual review).

---

## Phase 1: Validate (Weeks 2-3) — Integration Tests

**Goal**: Test the full `init() → collectors → capture() → queue → flush() → disable()` lifecycle in jsdom. Achieve **70%+ coverage, 80%+ on core modules**.

**What to Test** (from BACKLOG.md PUL-051):
- Config validation (valid/invalid configs, type checking)
- Scope/tags/user context mutations
- Each collector setup + event firing (errors, network, rum, navigation, interactions)
- `beforeSend` hooks + timeout circuit breaker
- Queue overflow behavior (QUEUE_OVERFLOW event emitted)
- Flush retries + concurrency guards (no double-send)
- Disable/enable lifecycle + listener cleanup
- SFCC provider resolution + PII pattern application
- Edge cases: concurrent calls, duplicate init, network errors

**Estimated Tests**: ~60 integration tests covering the above.

**Agent Work**: None (this requires domain knowledge of what "passing the pipeline" means — only human engineers know).

**Manual Work** (critical path):
- Design test fixtures (mock data, test harnesses, network stubs)
- Implement ~60 integration tests in new `tests/integration/` directory
- Achieve 70%+ coverage overall, 80%+ on `core/` and `collectors/`
- Iterate on coverage gaps

**CI Gates (Phase 1)**:
```
✅ Lint:         All PRs (required)
✅ Build:        All PRs (required, <25KB gzip)
✅ Unit tests:   All PRs (required, must pass — changed from optional)
✅ Integration:  New job, required (must pass before merge)
❌ E2E:          DISABLED (if: false still)
```

**Workflow Changes**:
```yaml
# Add new job in .github/workflows/ci.yml
test-integration:
  needs: build
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm build
    - run: |
        pnpm --filter @pulsarjs/sdk test:integration \
          -- --reporter=verbose --coverage \
          --coverage.lines=70 --coverage.functions=70 --coverage.branches=70
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: coverage-integration
        path: packages/sdk/coverage/

# Modify test-unit: remove any allow-failure, make required
```

**Success Criteria**:
- [ ] `tests/integration/` directory with ~60 passing tests
- [ ] Coverage report: 70%+ overall, 80%+ on `core/` and `collectors/`
- [ ] All tests pass in CI (fresh Ubuntu environment)
- [ ] Test fixtures properly mock network, timers, DOM
- [ ] SFCC provider tests validate context extraction + PII patterns
- [ ] `vitest.config.js` updated with coverage thresholds

**Timeline**: 5-7 days (test writing) + 2-3 days (coverage remediation).

---

## Phase 2: Real-world (Weeks 3-4) — E2E Tests

**Goal**: Validate the SDK works in a **real browser** (Chromium). ~30 E2E tests covering navigation, DOM events, network interception, real payloads.

**What to Test** (from BACKLOG.md PUL-052):
- Page load → PAGE_VIEW event with correct URL, page_type
- SPA navigation (History API) → second PAGE_VIEW with causal link
- Click link → CAMPAIGN_ENTRY if attribution params present
- DOM interactions (scroll, click) → SCROLL_DEPTH, RAGE_CLICK with correct selectors
- Fetch/XHR to monitored endpoint returning 500 → API_FAILURE captured
- Fetch to monitored endpoint success + pattern match → COMMERCE_ACTION
- RUM metrics (LCP, INP, CLS, TTFB, FCP) collected via PerformanceObserver
- Tab hide → `sendBeacon` fires with correct envelope shape
- `beforeSend` hook modifies event → modified version in payload
- `beforeSend` hook returns null → event dropped
- Disable/enable lifecycle → subsequent events dropped/captured

**Estimated Tests**: ~30 E2E tests covering the above.

**Agent Work**:
- **Jules Sentinel**: Refactor `playwright.config.js` to embed test server (remove external `serve` dependency)

**Manual Work** (critical path):
- Design E2E scenarios (navigation, errors, success paths)
- Write E2E fixtures (HTML test pages with realistic DOM)
- Validate beacon payloads against expected schema
- Network interception setup (mock API responses, simulate failures)
- Implement ~30 tests in `tests/e2e/`

**CI Gates (Phase 2)**:
```
✅ Lint:         All PRs (required)
✅ Build:        All PRs (required, <25KB gzip)
✅ Unit tests:   All PRs (required)
✅ Integration:  All PRs (required)
✅ E2E:          All PRs (required, if: false removed)
```

**Workflow Changes**:
```yaml
# In .github/workflows/ci.yml, remove if: false from test-e2e
test-e2e:
  needs: build
  # if: false  <--- DELETE THIS LINE
  runs-on: ubuntu-latest
  strategy:
    matrix:
      node: ['20']
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node }}
    - run: pnpm install --frozen-lockfile
    - run: pnpm build
    - run: pnpm --filter @pulsarjs/sdk test:e2e -- --workers=1
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report
        path: packages/sdk/playwright-report/
        retention-days: 30
```

**Success Criteria**:
- [ ] `tests/e2e/` has 30+ passing tests covering navigation, events, RUM, lifecycle
- [ ] Playwright report (HTML) generated and uploadable on failure
- [ ] Network interception correctly mocks API responses + captures beacon payloads
- [ ] All tests pass in CI (Ubuntu Chrome headless)
- [ ] E2E tests re-enabled in CI workflow (no `if: false`)

**Timeline**: 5-7 days (E2E writing) + 2-3 days (Playwright config hardening).

---

## Phase 3: Release (Week 4) — v1.0.0

**Goal**: Apply remaining P1 items, version the SDK, ship.

**Remaining P1 Items** (from RELEASE_READINESS.md):
- Version injection: `pulsar_version` currently hardcoded in `capture.js:164`
  - Should be injected by esbuild `define` from `package.json`
- TypeScript declarations: No `.d.ts` for public API
  - NPM consumers importing pulsarjs get no type hints

**CI/CD — Bundle Delivery Pipeline** (PUL-053-CD):

The release workflow must deliver the built SDK bundle to a CDN so customers can load it via `<script src>`. Decision needed on hosting:

| Option | Pros | Cons | Effort |
|--------|------|------|--------|
| **Cloudflare R2 + Workers** | Low cost, edge-cached globally, already in CF ecosystem (pulsar-infra) | Need R2 bucket + Worker for routing | Medium |
| **GitHub Releases only** | Already works (`release.yml`), zero setup | Not a CDN, no edge caching, no versioned URL scheme | Done |
| **npm + unpkg/jsdelivr** | Auto-CDN via npm publish, SRI hashes, versioned URLs for free | Depends on third-party CDN availability | Low |

Regardless of hosting choice, the delivery pipeline must:
1. **Version-pin**: `https://cdn.example.com/pulsar/v1.0.0/p.js`
2. **Latest alias**: `https://cdn.example.com/pulsar/latest/p.js` (updated on each release)
3. **Sourcemap**: Deploy `p.js.map` alongside the bundle
4. **Integrity hash**: Generate SRI hash (`sha384-...`) for `<script integrity>` consumers
5. **Smoke test**: `curl` the deployed URL, verify 200 + correct `Content-Type`

**If R2**: Extend `release.yml` with:
```yaml
- name: Upload to R2
  uses: cloudflare/wrangler-action@v3
  with:
    command: r2 object put pulsar-sdk/v${{ github.ref_name }}/p.js --file=packages/sdk/dist/pulsar.js
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
- name: Update latest alias
  uses: cloudflare/wrangler-action@v3
  with:
    command: r2 object put pulsar-sdk/latest/p.js --file=packages/sdk/dist/pulsar.js
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
```

**If npm + unpkg**: No workflow changes beyond `npm publish` — unpkg/jsdelivr auto-mirror from npm.

**Agent Work**:
- **Jules Medic**: Implement esbuild `define` to inject `__VERSION__` from package.json; generate `.d.ts` for public API
- **Jules Weaver** (or Manual): Implement CI/CD deploy step in `release.yml` based on chosen hosting strategy

**Manual Work**:
- **Decide hosting strategy** (R2 vs npm+unpkg vs both) — this blocks PUL-053-CD
- Execute release: `git tag v1.0.0`, push, npm publish (if applicable)
- Generate release notes

**CI Gates (Phase 3)**:
```
✅ All previous gates (lint, build, unit, integration, E2E)
✅ Version injection verified (bundle contains correct version string)
✅ TypeScript declarations present and valid
✅ CDN deploy: bundle uploaded to versioned + latest paths
✅ CDN smoke: deployed URL returns 200 with correct content
```

**Success Criteria**:
- [ ] Version string injected at build time from package.json
- [ ] `.d.ts` file generated and exported in `package.json` `types` field
- [ ] All tests passing with new version
- [ ] Bundle still <25KB
- [ ] CDN hosting strategy decided (R2 / npm+unpkg / both)
- [ ] `release.yml` extended with deploy + smoke steps
- [ ] Versioned URL reachable: `https://<cdn>/pulsar/v1.0.0/p.js`
- [ ] SRI hash generated and documented for script-tag consumers
- [ ] Git tag `v1.0.0` created and pushed
- [ ] Release notes published

**Timeline**: 1-2 days (version/TypeScript work) + release execution.

---

## Dependency DAG

```
Phase 0: PUL-050 (Hardening)
  ├─ H1: scope.js email sanitization
  ├─ H2: sanitizers module isolation
  ├─ H3: RegExp ReDoS validation
  ├─ M5: History API consolidation
  └─ M6: Version injection setup
       ↓
Phase 1: PUL-051 (Integration Tests)
  ├─ ~60 integration tests
  └─ 70%+ coverage
       ↓
Phase 2: PUL-052 (E2E Tests)
  ├─ ~30 E2E tests (Playwright)
  └─ Real browser validation
       ↓
Phase 3: v1.0.0 Release
  ├─ Version injection + .d.ts
  ├─ CI/CD: Deploy to CDN (R2 or npm+unpkg)
  ├─ Post-deploy smoke test
  └─ Ship to production
```

**Critical constraint**: Each phase blocks on the previous one. CI gates enforce this.

---

## Work Breakdown Structure (WBS)

```
PulsarJS v1.0.0 Release Orchestration
│
├─ Phase 0: Stabilize (Weeks 1-2)
│  ├─ [Jules Sentinel] H1-H3 security fixes → PR #???
│  ├─ [Jules Medic] M5-M6 code health fixes → PR #???
│  ├─ [Manual] Code review + security audit
│  ├─ [Manual] Local defensive testing
│  └─ [CI] Lint + Build required; Unit optional
│
├─ Phase 1: Validate (Weeks 2-3) [blocks on Phase 0]
│  ├─ [Manual] Write 60 integration tests
│  │  ├─ Config validation, scope, collectors
│  │  ├─ beforeSend, queue overflow, flush retries
│  │  ├─ Disable/enable, provider resolution
│  │  └─ SFCC context + PII patterns
│  ├─ [Manual] Achieve 70%+ coverage, 80%+ core
│  ├─ [CI workflow] Add test-integration job (required)
│  └─ [CI] Lint + Build + Unit + Integration required
│
├─ Phase 2: Real-world (Weeks 3-4) [blocks on Phase 1]
│  ├─ [Manual] Write 30+ E2E tests (Playwright)
│  │  ├─ Page load, SPA navigation, interactions
│  │  ├─ Network, RUM metrics, tab hide
│  │  └─ beforeSend hook, disable/enable
│  ├─ [Jules Sentinel] Playwright config hardening
│  ├─ [CI workflow] Enable test-e2e job (remove if: false)
│  └─ [CI] Lint + Build + Unit + Integration + E2E required
│
└─ Phase 3: Release (Week 4) [blocks on Phase 2]
   ├─ [Jules Medic] Version injection (esbuild define)
   ├─ [Jules Medic] TypeScript declarations (.d.ts)
   ├─ [Manual] Decide CDN hosting (R2 vs npm+unpkg vs both)
   ├─ [Jules Weaver / Manual] Extend release.yml with deploy + smoke
   ├─ [Manual] Git tag v1.0.0, npm publish
   └─ [All tests green + CDN smoke] Ready to ship
```

---

## Agent Dispatch Strategy

| Agent | Specialization | Phase 0 Task | Phase 2 Task | Phase 3 Task |
|-------|----------------|-------------|-------------|-------------|
| **Sentinel** | Security, hardening, defensive coding | H1-H3 security fixes | Playwright config hardening | — |
| **Medic** | Code health, refactoring, build config | M5-M6 code health fixes | — | Version injection + .d.ts |
| **Aegis** | Testing, coverage analysis | — | Test templates (optional) | — |
| **Manual** | Domain knowledge, test writing | Code review, local testing | Integration tests (~60), E2E tests (~30) | Release execution |

---

## CI Gate Evolution

| Workflow Job | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| **lint** | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| **build** | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| **unit-tests** | ⚠️ Optional | ✅ Required | ✅ Required | ✅ Required |
| **integration-tests** | ❌ N/A | ✅ Required | ✅ Required | ✅ Required |
| **e2e-tests** | ❌ if: false | ❌ if: false | ✅ Required | ✅ Required |

**Implementation**:
- **Phase 0**: Keep `.github/workflows/ci.yml` as-is (E2E disabled, unit optional)
- **Phase 1 (transition)**: Add `test-integration` job; change `test-unit` to required
- **Phase 2 (transition)**: Remove `if: false` from `test-e2e` job
- **Phase 3**: No changes, all gates enforced

---

## Success Metrics

| Phase | Metric | Target | Owner | Evidence |
|-------|--------|--------|-------|----------|
| **0** | Security issues fixed (H1-H3, M5-M6) | 6/6 | Jules + Manual | Code review approval |
| **0** | SDK defensive coverage | No crashes on collector errors | Manual | Local testing |
| **0** | Build size | <25KB gzip | CI | GitHub Actions workflow |
| **1** | Integration test coverage | 70%+ overall, 80%+ core | Manual | vitest coverage report |
| **1** | Integration tests passing | 60+ tests | Manual | CI workflow status |
| **2** | E2E test coverage | ~30 tests in real browser | Manual | Playwright report |
| **2** | E2E tests passing | All tests green in CI | CI | GitHub Actions workflow |
| **3** | Version injection | Correct version in bundle | Jules Medic | Bundle inspection |
| **3** | TypeScript declarations | `.d.ts` present, valid | Jules Medic | `npm info` / package.json |
| **3** | Release ready | All gates green | Manual | CI workflow all green |

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Phase 1 test writing slips | Medium | High | Start writing tests in parallel with Phase 0 review (2-3 day overlap) |
| E2E tests flaky in CI | Medium | Medium | Playwright configured with retries (2x); use trace artifacts for debugging |
| Coverage hard to reach first try | High | Medium | Iterative remediation in Phase 1; allocate 2-3 days for coverage gaps |
| Version injection breaks size | Low | Low | Version string is short (<5 bytes); verify with `ls -lh` in Phase 3 |
| Manual code review bottleneck | Medium | High | Assign reviewers upfront; schedule reviews at phase start, not at merge |
| Agent work overruns | Medium | Medium | Start Phase 1 integration test writing while Phase 0 review completes (overlap) |

---

## Critical Files to Update

1. **`.github/workflows/ci.yml`** — CI gate orchestration
   - Phase 0: No changes (keep E2E disabled, unit optional)
   - Phase 1: Add `test-integration` job, make `test-unit` required
   - Phase 2: Remove `if: false` from `test-e2e`

2. **`packages/sdk/vitest.config.js`** — Coverage thresholds
   - Add coverage config with 70% overall, 80% core minimums

3. **`packages/sdk/src/index.js`** — SDK entry point (Phase 0 hardening)
   - Wrap all collector setup in try/catch

4. **`packages/sdk/src/core/capture.js`** — Capture pipeline
   - Replace hardcoded version; implement esbuild define integration

5. **`packages/sdk/playwright.config.js`** — E2E setup (Phase 2 hardening)
   - Embed test server; remove external `serve` dependency

---

## Timeline Gantt

```
Week 1
  Mon ├─ Phase 0: Jules agents (Sentinel H1-H3, Medic M5-M6)
  Tue │
  Wed ├─ Phase 0: Jules work continues
  Thu ├─ Phase 0: Manual code review checkpoint
  Fri └─ Phase 0: Final CI validation

Week 2
  Mon ├─ Phase 0 → Phase 1 transition
  Tue ├─ CI workflow: Add integration test job, make unit required
  Wed ├─ Phase 1: Manual engineer starts integration test writing
  Thu │
  Fri └─ (Phase 1 continues)

Week 3
  Mon ├─ Phase 1: Integration tests + coverage remediation
  Tue ├─ Phase 1: Coverage reaches 70%+ target
  Wed ├─ Phase 1 → Phase 2 transition
  Thu ├─ Phase 2: Manual engineer starts E2E test writing
  Fri └─ Jules Sentinel: Playwright config hardening

Week 4
  Mon ├─ Phase 2: E2E tests + CI validation
  Tue ├─ Phase 2 → Phase 3 transition
  Wed ├─ Phase 3: Jules Medic version injection + .d.ts
  Thu ├─ Phase 3: CI/CD deploy pipeline + CDN smoke test
  Fri ├─ Phase 3: All tests green, release validation
  Fri └─ Release: git tag v1.0.0, npm publish, CDN deploy
```

---

## How to Execute This Plan

### Week 1 (Phase 0)
1. Present `RELEASE_ORCHESTRATION.md` to team
2. Create Jules dispatch sessions:
   - Session 1: Sentinel fixes H1-H3 security issues
   - Session 2: Medic fixes M5-M6 code health issues
3. Schedule manual code review at mid-week checkpoint
4. Monitor Jules agent progress via `/jules-sync`

### Phase 0 → Phase 1 Transition
1. Confirm Phase 0 tests passing, security review complete
2. Update `.github/workflows/ci.yml`:
   - Add `test-integration` job
   - Change `test-unit` to required
3. Manual engineer begins integration test writing

### Phase 1 → Phase 2 Transition
1. Confirm Phase 1 coverage ≥70%
2. Update `.github/workflows/ci.yml`: remove `if: false` from E2E job
3. Manual engineer begins E2E test writing
4. Create Jules session for Sentinel (Playwright hardening)

### Phase 2 → Phase 3 Transition
1. Confirm Phase 2 E2E tests passing in CI
2. Create Jules session for Medic (version injection + .d.ts)
3. Prepare release checklist

### Week 4 (Phase 3)
1. All tests passing, all CI gates green
2. Execute release: `git tag v1.0.0`, npm publish
3. Generate release notes
4. Announce v1.0.0 ship

---

## Alignment with Project Standards

This plan aligns with:
- **BACKLOG.md**: Respects PUL-050 → PUL-051 → PUL-052 dependency chain
- **RELEASE_READINESS.md**: Prioritizes P0 (test coverage) → P1 (version injection) → P2 (polish)
- **CLAUDE.md**: Addresses all 6 known security issues (H1-M6)
- **AGENTS.md**: Follows "Do What You Say, Say What You Do, Record What You Did" protocol
- **Project Philosophy**: Honest engineering over marketing; transparent about what can vs. cannot be automated

---

**Status**: Ready for Phase 0 execution | **Next Action**: Dispatch Jules sessions for Sentinel + Medic
