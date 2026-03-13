PulsarJS SDK — Enterprise Readiness Audit
Date: 2026-03-04
Scope: packages/sdk/src/ — 10 source files, ~900 LOC
Posture: Honest, right-sized. Not overengineered, not hand-wavey.

### Value Acknowledgment — What's Already Good
Before the issues: this SDK is architecturally sound. The domain module split (`core/`, `collectors/`, `integrations/`, `utils/`) is clean and matches the `GEMINI.md` manifesto exactly. Specific wins:

| Area | What's Right |
| :--- | :--- |
| **Module structure** | Clean separation — no circular deps, each module has a clear job |
| **State object pattern** | `state` passed to all modules via `createClient()` — composable, testable |
| **sendBeacon + fetch fallback** | Correct dual-path delivery (though logic is inverted — see below) |
| **PerformanceObserver** | `buffered: true`, INP with FID fallback, CLS accumulation — all correct |
| **HMAC signing** | `crypto.subtle` with proper import/sign flow — enterprise-grade auth |
| **beforeSend with timeout** | `Promise.race` circuit breaker — consent/CMP integration is real |
| **MutationObserver debounce** | 100ms batch prevents DOM mutation floods — correct pattern |
| **Session ID** | `crypto.randomUUID()` → `getRandomValues` fallback → deterministic zero — right cascade |
| **createInstance()** | Multi-tenant factory exists — enterprise feature, not just planned |
| **Queue overflow tracking** | `droppedEventsCount` + synthetic `QUEUE_OVERFLOW` event — observability done right |
Bottom line: ~70% of the SDK is ship-ready. The remaining 30% is bugs and gaps that matter under enterprise load, not architecture rewrites.

Per-File Assessment
### capture.js
*Grade: C+*  
The most critical file, and the one with the most issues. It works in happy-path demos but fails under real conditions.

| # | Issue | Severity | Impact |
| :--- | :--- | :--- | :--- |
| 1 | Module-level `let state = null` — `generateSignature` references `state.config.debug` (L36) before init | 🔴 Ship-blocker | Throws TypeError if HMAC fails before init |
| 2 | Queue cleared before delivery confirmed — `state.queue = []` (L171), then network retries fail | 🔴 Ship-blocker | Silent data loss on every network hiccup |
| 3 | `capture(FLUSH_FAILED)` on failure (L218) — calls `capture()` → queues event → calls `flush()` → fails... | 🔴 Ship-blocker | Infinite recursion, browser tab freezes |
| 4 | `sendBeacon` only fires without signature (L190) — inverted logic. Beacon should be primary. | 🟡 Hardening | Payloads lost on tab close |
| 5 | `flush()` called on every `capture()` (L130) — no batching. | 🟡 Hardening | Request storm, rate-limited by CF, wasted bandwidth |
| 6 | `_fingerprintCache` never expires — Map grows for entire session | 🟢 V2 | Memory leak in long sessions (kiosk, POS) |
| 7 | `extractSFCCContext()` called per capture (L84) — reads cookies + DOM every event | 🟢 V2 | Unnecessary perf tax, ~0.5ms per call |
### errors.js
*Grade: B-*  
Good foundation, but fragile in multi-script environments (every SFCC storefront).

| # | Issue | Severity | Impact |
| :--- | :--- | :--- | :--- |
| 1 | `window.onerror = assignment` (L16) — overwritten by GTM, Bazaarvoice, Einstein | 🔴 Ship-blocker | Pulsar stops catching errors silently — worst failure mode |
| 2 | Click breadcrumb captures full `className` (L84) — produces `input#email.active` | 🟡 Hardening | GDPR risk: field identity in crash reports |
| 3 | `MutationObserver` not stored for teardown — observer is a local variable | 🟡 Hardening | Observer keeps running after `Pulsar.disable()` |
| 4 | No error context enrichment — errors don't carry `pageType`, `checkoutStep`, `userType` | 🟡 Hardening | "Did checkout break?" is unanswerable |
### rum.js
*Grade: B*  
Mostly solid. Two real issues, one cosmetic.

| # | Issue | Severity | Impact |
| :--- | :--- | :--- | :--- |
| 1 | `webVitals` is a module-level singleton — CLS accumulates across SPA navigations | 🔴 Ship-blocker | Every metric after the first navigation is wrong in PWA Kit |
| 2 | `performance.timing` is deprecated — `PerformanceNavigationTiming` is the replacement | 🟡 Hardening | Will break in future Chrome |
| 3 | LCP only stores timing value — loses element context (tagName, url for images) | 🟢 V2 | "Why was it slow?" requires the element |
### sanitizers.js
*Grade: B*  
Correct PII patterns, but gaps that would show up in production stack traces.

| # | Issue | Severity | Impact |
| :--- | :--- | :--- | :--- |
| 1 | Token regex is over-aggressive — matches webpack chunk hashes, UUIDs | 🟡 Hardening | Stack traces become unreadable: `chunk.[TOKEN_REDACTED].js` |
| 2 | `sanitizeUrl` uses `http://example.com` as base (L63) — relative URLs get wrong origin | 🟡 Hardening | `/checkout` → `http://example.com/checkout` in payload |
| 3 | Windows path regex is broken — character class doesn't escape correctly | 🟢 V2 | Won't matter until source maps land |
| 4 | No sanitization on breadcrumbs or scope data — only messages go through redactPII | 🟡 Hardening | Click breadcrumbs with form field IDs bypass PII filters |
### sfcc.js
*Grade: C*  
Works on one SFCC demo. Will fail on real merchant sites with edge cases.

| # | Issue | Severity | Impact |
| :--- | :--- | :--- | :--- |
| 1 | Not platform-agnostic — hardcoded to SFCC. | 🟡 Hardening | Limits addressable market from day 1 |
| 2 | Cookie parsing breaks on values containing `=` — base64, JWT cookies | 🟡 Hardening | `dwac_*` values with `=` produce wrong visitor IDs |
| 3 | Page type inference order is wrong — `/checkout/cart` matches checkout first | 🟡 Hardening | Wrong pageType on composite URLs |
| 4 | `window.dw.ac._category` can throw — `_category` not yet defined in some versions | 🟢 V2 | Intermittent crash on some SFCC builds |
| 5 | `extractCampaigns` as function parameter — inverted API shape | 🟢 V2 | Design smell, not a bug |
### scope.js
*Grade: B+*  
Cleanest file. Issues are subtle but matter at scale.

| # | Issue | Severity | Impact |
| :--- | :--- | :--- | :--- |
| 1 | `getScopeData()` returns live references (L31-36) | 🟡 Hardening | Accidental mutation of `_breadcrumbs` array |
| 2 | `clone()` is shallow — nested `_user` objects share references | 🟡 Hardening | Mutating cloned user mutates original |
| 3 | 100 breadcrumbs default — oversized payloads | 🟢 V2 | 30 is sufficient for debugging context |
### network.js
*Grade: B+*  
Solid monkey-patching. Two issues.

| # | Issue | Severity | Impact |
| :--- | :--- | :--- | :--- |
| 1 | Full request URLs in metadata — no `sanitizeApiEndpoint` applied | 🟡 Hardening | UUIDs, basket IDs, customer IDs leak |
| 2 | `__pulsar_processed` property on Error objects | 🟢 V2 | Minor, but could surprise other SDKs |
### config.js
*Grade: A-*  
Clean, correct. One default value issue.

| # | Issue | Severity | Impact |
| :--- | :--- | :--- | :--- |
| 1 | `maxBreadcrumbs: 100` — too high for payload size | 🟢 V2 | Addressed when `scope.js` is fixed |
### session.js
*Grade: A*  
No issues. Correct cascade: `randomUUID()` → `getRandomValues()` → deterministic zero. Clean.

### environment.js
*Grade: B+*  
Simple, does its job. One minor issue.

| # | Issue | Severity | Impact |
| :--- | :--- | :--- | :--- |
| 1 | DevTools detection — `outerWidth - innerWidth > 160` is unreliable | 🟢 V2 | False positives/negatives, low priority |
## Test Coverage — Grade: D
This is the weakest area.

| What Exists | What's Missing |
| :--- | :--- |
| 1 unit test file: `hash()` + `generateSignature()` | No tests for: `capture()`, `flush()`, Scope, Sanitizers, etc. |
| 1 e2e test: payload schema validation | No e2e for: SPA navigation, tab close beacon, error capture |
| Vitest + Playwright configured | Both configs are minimal and correct |

Reality check: You have 37 lines of unit tests for ~900 lines of production code. That's **~4% coverage**. For an enterprise SDK handling customer-facing data, minimum viable is **~60% unit coverage** on `core/` and `utils/`.

Right-Sized Backlog
Three tiers. Ship-blockers must be done before any enterprise merchant goes live. Hardening should follow within 2 weeks. V2 is logged for later.

### Tier 1 — Ship-Blockers (Before Day 1)

| ID | Item | Files | Est. | Branch |
| :--- | :--- | :--- | :--- | :--- |
| **PUL-030** | Fix infinite recursion: `capture(FLUSH_FAILED)` → log-only, re-queue elements | `capture.js` | S | `feature/pul-030-fix-recursion` |
| **PUL-031** | Fix data loss: snapshot queue before send, restore on failure | `capture.js` | S | `feature/pul-031-fix-data-loss` |
| **PUL-032** | Fix `generateSignature` — remove state reference, pass debug as parameter | `capture.js` | S | `feature/pul-032-hmac-param-fix` |
| **PUL-033** | Switch `window.onerror` to `addEventListener('error')` + `unhandledrejection` | `errors.js` | S | `feature/pul-033-modern-error-listeners` |
| **PUL-034** | Add `resetWebVitals()` + call on SPA navigation (listen to popstate/pushState) | `rum.js` | M | `feature/pul-034-spa-webvitals-reset` |
### Tier 2 — Hardening (First 2 Weeks Post-Ship)

| ID | Item | Files | Est. | Branch |
| :--- | :--- | :--- | :--- | :--- |
| **PUL-035** | Invert `sendBeacon` logic: beacon primary, fetch fallback. Fix content-type. | `capture.js` | S | `feature/pul-035-beacon-primary` |
| **PUL-036** | Add flush debounce (200ms batch window) | `capture.js` | S | `feature/pul-036-flush-debouncing` |
| **PUL-037** | Sanitize breadcrumbs: strip className, use only tagName + id + data-testid | `errors.js`, `scope.js` | S | `feature/pul-037-breadcrumb-sanitization` |
| **PUL-038** | Fix `sanitizeUrl` base, token regex lookbehind, `sanitizeBreadcrumb()` method | `sanitizers.js` | M | `feature/pul-038-sanitizer-hardening` |
| **PUL-039** | Platform adapter pattern: `extractContext()` with native/SFCC/Shopify adapters | `sfcc.js` → `context.js` | M | `feature/pul-039-platform-adapters` |
| **PUL-040** | Core unit tests: `capture()`, `flush()`, `Scope`, `Sanitizers` (~60% coverage) | `test/*.test.js` | L | `feature/pul-040-core-unit-tests` |
### Tier 3 — V2 (Log, Revisit When Real)

| ID | Item | Files | Est. | Branch |
| :--- | :--- | :--- | :--- | :--- |
| **PUL-041** | Fingerprint cache TTL + periodic cleanup | `capture.js` | S | `feature/pul-041-cache-ttl` |
| **PUL-042** | `getScopeData()` defensive copies + deep clone + max breadcrumbs 30 | `scope.js` | S | `feature/pul-042-scope-hardening` |
| **PUL-043** | Replace `performance.timing` with `PerformanceNavigationTiming` | `rum.js` | S | `feature/pul-043-nav-timing-v2` |
| **PUL-044** | LCP element context (tagName, url for images) | `rum.js` | S | `feature/pul-044-lcp-context` |
| **PUL-045** | Apply `sanitizeApiEndpoint()` to network metadata + MutationObserver teardown | `network.js`, `errors.js` | S | `feature/pul-045-network-sanitization` |
Size key: S = <2 hrs, M = 2–4 hrs, L = 4–8 hrs

## Summary Scorecard

| Module | Grade | Ship-Blockers | Total Issues |
| :--- | :--- | :--- | :--- |
| **capture.js** | C+ | 3 | 7 |
| **errors.js** | B- | 1 | 4 |
| **rum.js** | B | 1 | 3 |
| **sanitizers.js** | B | 0 | 4 |
| **sfcc.js** | C | 0 | 5 |
| **scope.js** | B+ | 0 | 3 |
| **network.js** | B+ | 0 | 2 |
| **config.js** | A- | 0 | 1 |
| **session.js** | A | 0 | 0 |
| **environment.js** | B+ | 0 | 1 |
| **Tests** | D | — | Critical gap |
| **OVERALL** | **B-** | **5** | **30** |
Verdict: Architecturally correct, battle-hardened for demos. Five ship-blockers stand between this and production enterprise deployment. All are fixable without rewrites — they're surgical fixes to an already-sound design. The biggest systemic risk isn't any single bug; it's the test coverage gap. An enterprise customer's security review will ask for it, and the answer today is "4%."


Comment
⌥⌘M
