# PulsarJS v1.0.0 Release — Task Tracking

**Status**: Ready for Phase 0 | **Updated**: 2026-03-20 | **Timeline**: 4 weeks

---

## Phase 0: Stabilize (Weeks 1-2)

| Task ID | Title | Owner | Type | Status | Due | PR | Notes |
|---------|-------|-------|------|--------|-----|----|----|
| **PUL-050-H1** | Scope.js: Sanitize raw email in setUser() | Jules Sentinel | Security | 🔴 Open | 2026-03-24 | — | H1 issue from CLAUDE.md; email must pass through sanitizers.js |
| **PUL-050-H2** | Sanitizers.js: Scope _extraPatterns per-instance | Jules Sentinel | Security | 🔴 Open | 2026-03-24 | — | H2 issue; module-level patterns bleed across createInstance() |
| **PUL-050-H3** | Sanitizers.js: ReDoS validation in registerPiiPatterns() | Jules Sentinel | Security | 🔴 Open | 2026-03-24 | — | H3 issue; validate regex complexity before accepting |
| **PUL-050-M5** | Collectors: Consolidate History API patches | Jules Medic | Refactor | 🔴 Open | 2026-03-25 | — | M5 issue; rum.js + navigation.js patch twice, tangled teardown |
| **PUL-050-M6** | Capture.js: Version injection from package.json | Jules Medic | Build | 🔴 Open | 2026-03-25 | — | M6 issue; hardcoded in 2 places, needs build-time define |
| **PUL-050-L6** | Index.js: Add SSR guard to window.Pulsar | Jules Medic | Hardening | 🔴 Open | 2026-03-25 | — | L6 issue; typeof window check before assignment |
| **PUL-050-REVIEW** | Code review: Security audit + hardening sign-off | Manual (Darleison) | Review | 🔴 Open | 2026-03-27 | — | Review all 6 fixes, validate defensive coverage |
| **PUL-050-TEST** | Local testing: Defensive scenarios (collectors throw) | Manual (Darleison) | Testing | 🔴 Open | 2026-03-27 | — | Manually throw errors in collectors; verify SDK captures instead of crashing |
| **PUL-050-CI** | CI validation: Build <25KB, no lint errors | CI (GitHub Actions) | Gate | 🔴 Open | 2026-03-27 | — | Lint + Build must pass; Unit tests optional |

---

## Phase 1: Validate (Weeks 2-3)

| Task ID | Title | Owner | Type | Status | Due | PR | Notes |
|---------|-------|-------|------|--------|-----|----|----|
| **PUL-051-TRANS** | CI transition: Add integration test job, make unit required | Manual (Darleison) | Build | 🔴 Open | 2026-03-31 | — | Update .github/workflows/ci.yml; add test-integration job |
| **PUL-051-CONFIG** | Integration tests: Config validation (valid/invalid) | Manual | Testing | 🔴 Open | 2026-04-04 | — | Test init() with valid config, invalid types, edge cases |
| **PUL-051-SCOPE** | Integration tests: Scope/tags/user context | Manual | Testing | 🔴 Open | 2026-04-04 | — | Test setUser(), addBreadcrumb(), scope mutations |
| **PUL-051-ERRORS** | Integration tests: Error collector setup + events | Manual | Testing | 🔴 Open | 2026-04-04 | — | Test setupErrorHandlers(), JS_CRASH, CUSTOM_EXCEPTION events |
| **PUL-051-NETWORK** | Integration tests: Network collector (fetch/XHR) | Manual | Testing | 🔴 Open | 2026-04-04 | — | Test setupFetchInterceptor(), setupXHRInterceptor(), API_FAILURE |
| **PUL-051-RUM** | Integration tests: RUM collector + PerformanceObserver | Manual | Testing | 🔴 Open | 2026-04-04 | — | Test setupRumMetrics(), RUM_METRICS events |
| **PUL-051-NAVIGATION** | Integration tests: Navigation collector + History API | Manual | Testing | 🔴 Open | 2026-04-04 | — | Test setupNavigationTracking(), PAGE_VIEW, soft routes |
| **PUL-051-INTERACTIONS** | Integration tests: Interactions collector (scroll, rage) | Manual | Testing | 🔴 Open | 2026-04-04 | — | Test setupScrollObserver(), setupRageClickDetector() |
| **PUL-051-BEFORESEND** | Integration tests: beforeSend hook + timeout circuit breaker | Manual | Testing | 🔴 Open | 2026-04-04 | — | Test hook modifications, timeouts, exceptions |
| **PUL-051-QUEUE** | Integration tests: Queue overflow + QUEUE_OVERFLOW event | Manual | Testing | 🔴 Open | 2026-04-04 | — | Test queue limits, overflow behavior, event emission |
| **PUL-051-FLUSH** | Integration tests: Flush retries + concurrency guards | Manual | Testing | 🔴 Open | 2026-04-04 | — | Test flush(), sendBeacon fallback, double-send prevention |
| **PUL-051-LIFECYCLE** | Integration tests: Disable/enable lifecycle + listener cleanup | Manual | Testing | 🔴 Open | 2026-04-04 | — | Test disable(), enable(), patch teardown, no leaks |
| **PUL-051-PROVIDER** | Integration tests: SFCC provider resolution + PII patterns | Manual | Testing | 🔴 Open | 2026-04-04 | — | Test provider detection, context extraction, PII sanitization |
| **PUL-051-COVERAGE** | Coverage remediation: 70%+ overall, 80%+ core | Manual | Testing | 🔴 Open | 2026-04-05 | — | Iterate on coverage gaps, add tests until thresholds met |
| **PUL-051-CI** | CI validation: All integration tests passing in CI | CI (GitHub Actions) | Gate | 🔴 Open | 2026-04-05 | — | test-integration job must pass before merge |

---

## Phase 2: Real-world (Weeks 3-4)

| Task ID | Title | Owner | Type | Status | Due | PR | Notes |
|---------|-------|-------|------|--------|-----|----|----|
| **PUL-052-TRANS** | CI transition: Enable E2E tests (remove if: false) | Manual (Darleison) | Build | 🔴 Open | 2026-04-07 | — | Update .github/workflows/ci.yml; re-enable test-e2e job |
| **PUL-052-PLAYWRIGHT** | Playwright: Embed test server, remove external serve | Jules Sentinel | Build | 🔴 Open | 2026-04-07 | — | Refactor playwright.config.js; self-contained server setup |
| **PUL-052-PAGELOAD** | E2E test: Page load → PAGE_VIEW with correct URL | Manual | Testing | 🔴 Open | 2026-04-09 | — | Real Chromium, verify event payload |
| **PUL-052-SPA** | E2E test: SPA navigation → PAGE_VIEW with causal link | Manual | Testing | 🔴 Open | 2026-04-09 | — | History API, second PAGE_VIEW, caused_by reference |
| **PUL-052-CLICKS** | E2E test: DOM clicks → RAGE_CLICK with selector | Manual | Testing | 🔴 Open | 2026-04-09 | — | Rapid clicks, selector verification |
| **PUL-052-SCROLL** | E2E test: Scroll → SCROLL_DEPTH at milestones | Manual | Testing | 🔴 Open | 2026-04-09 | — | 25%, 50%, 75%, 100% events |
| **PUL-052-APIERROR** | E2E test: Fetch 500 → API_FAILURE captured | Manual | Testing | 🔴 Open | 2026-04-09 | — | Network interception, error payload |
| **PUL-052-COMMERCE** | E2E test: Fetch success + pattern match → COMMERCE_ACTION | Manual | Testing | 🔴 Open | 2026-04-09 | — | Cart API, commerce action detection |
| **PUL-052-RUM** | E2E test: RUM metrics (LCP, INP, CLS, TTFB, FCP) | Manual | Testing | 🔴 Open | 2026-04-09 | — | PerformanceObserver, real metrics from Chromium |
| **PUL-052-BEACON** | E2E test: Tab hide → sendBeacon fires | Manual | Testing | 🔴 Open | 2026-04-09 | — | Visibility API, beacon envelope |
| **PUL-052-BEFORESEND** | E2E test: beforeSend hook modifies event → modified in payload | Manual | Testing | 🔴 Open | 2026-04-09 | — | Hook execution in real browser |
| **PUL-052-BEFORESEND-NULL** | E2E test: beforeSend returns null → event dropped | Manual | Testing | 🔴 Open | 2026-04-09 | — | Null handling |
| **PUL-052-DISABLE** | E2E test: Disable/enable → events dropped/captured | Manual | Testing | 🔴 Open | 2026-04-09 | — | Lifecycle in real browser |
| **PUL-052-CI** | CI validation: All E2E tests passing in Chrome headless | CI (GitHub Actions) | Gate | 🔴 Open | 2026-04-10 | — | test-e2e job must pass before merge |

---

## Phase 3: Release (Week 4)

| Task ID | Title | Owner | Type | Status | Due | PR | Notes |
|---------|-------|-------|------|--------|-----|----|----|
| **PUL-053-VERSION** | Version injection: Esbuild define from package.json | Jules Medic | Build | 🔴 Open | 2026-04-11 | — | Replace hardcoded __VERSION__ with build-time injection |
| **PUL-053-DTS** | TypeScript declarations: Generate .d.ts for public API | Jules Medic | Build | 🔴 Open | 2026-04-11 | — | Export types in package.json; npm consumers get type hints |
| **PUL-053-VALIDATION** | Release validation: All tests green, bundle <25KB | Manual (Darleison) | Gate | 🔴 Open | 2026-04-12 | — | Final CI check before release |
| **PUL-053-TAG** | Git tag: v1.0.0 | Manual (Darleison) | Release | 🔴 Open | 2026-04-12 | — | Create and push git tag |
| **PUL-053-PUBLISH** | NPM publish: v1.0.0 | Manual (Darleison) | Release | 🔴 Open | 2026-04-12 | — | Publish to npm registry (if applicable) |

---

## Task Status Legend

| Status | Icon | Meaning |
|--------|------|---------|
| Open (not started) | 🔴 | Not yet claimed or started |
| In Progress | 🟡 | Actively being worked on |
| In Review | 🟠 | Code/work submitted, awaiting review |
| Blocked | 🔵 | Waiting on dependency or external blocker |
| Done | 🟢 | Completed and merged/signed-off |

---

## Task Dependencies

```
Phase 0 (blocking)
├─ PUL-050-H1, H2, H3 (Jules Sentinel)
├─ PUL-050-M5, M6, L6 (Jules Medic)
├─ PUL-050-REVIEW (Manual)
├─ PUL-050-TEST (Manual)
└─ PUL-050-CI (GitHub Actions)
     ↓
Phase 1 (blocking on Phase 0)
├─ PUL-051-TRANS (CI workflow update)
├─ PUL-051-CONFIG through PUL-051-PROVIDER (Manual, 13 tasks)
├─ PUL-051-COVERAGE (Manual)
└─ PUL-051-CI (GitHub Actions)
     ↓
Phase 2 (blocking on Phase 1)
├─ PUL-052-TRANS (CI workflow update)
├─ PUL-052-PLAYWRIGHT (Jules Sentinel)
├─ PUL-052-PAGELOAD through PUL-052-DISABLE (Manual, 13 tasks)
└─ PUL-052-CI (GitHub Actions)
     ↓
Phase 3 (blocking on Phase 2)
├─ PUL-053-VERSION, DTS (Jules Medic)
├─ PUL-053-VALIDATION (Manual)
└─ PUL-053-TAG, PUBLISH (Manual)
```

---

## Weekly Roadmap

### Week 1 (Mar 20-27): Phase 0
- **Mon-Wed**: Jules Sentinel/Medic work on H1-H3, M5-M6
- **Thu-Fri**: Manual review, local testing, security audit sign-off
- **Deliverable**: All Phase 0 tasks green (🟢)

### Week 2 (Mar 31-Apr 4): Phase 0 → Phase 1
- **Mon-Tue**: Phase 0 CI validation complete
- **Wed-Fri**: CI workflow transition (add integration job), manual test writing begins
- **Deliverable**: Phase 1 integration tests written, coverage >70%

### Week 3 (Apr 7-11): Phase 1 → Phase 2
- **Mon-Tue**: Phase 1 coverage remediation complete
- **Wed-Thu**: CI workflow transition (enable E2E), Jules Sentinel hardens Playwright, manual E2E writing begins
- **Fri**: Phase 2 E2E tests written, Playwright hardening complete
- **Deliverable**: Phase 2 E2E tests passing in CI

### Week 4 (Apr 12-18): Phase 2 → Phase 3 → Release
- **Mon-Tue**: Phase 2 validation complete
- **Wed**: Jules Medic version injection + TypeScript defs
- **Thu**: Release validation (all tests green)
- **Fri**: Git tag v1.0.0, npm publish
- **Deliverable**: v1.0.0 released 🎉

---

## How to Update This Table

Each week, update task status:
```markdown
| **PUL-050-H1** | ... | Status | 🟡 In Progress | ... |
```

Marks to use:
- 🔴 Open (not started)
- 🟡 In Progress (actively being worked)
- 🟠 In Review (awaiting code review)
- 🔵 Blocked (waiting on dependency)
- 🟢 Done (merged/signed-off)

When a task completes, update the `Status` and `PR` columns, and move to next phase's dependent task.

---

## Quick Navigation

- **RELEASE_READINESS.md** — What's blocking GA (P0-P3 items)
- **RELEASE_ORCHESTRATION.md** — How to sequence the work (4-phase plan)
- **RELEASE_TASKS.md** — This file; which tasks to do each day

---

**Next**: Update task status as Phase 0 begins. Monitor via `/julius-sync`.
