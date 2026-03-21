# PulsarJS Product Backlog

> **Scope**: Core Deterministic Pipeline (Phase 1 MVP)
> **Prefix**: `PUL-XXX`
> **Branch Convention**: `feature/pul-XXX-short-description`

---

### [PUL-002] Local PWAKit Integration Testing
**Status**: 🔴 Open
**Branch**: `feature/pul-002-pwakit-integration`
**Severity**: High — Required for system validation.

**The Goal**: Integrate `pulsar.js` into a local PWAKit storefront. Simulate SFCC basket errors, SCAPI timeouts, and JS crashes. Verify: Ingestion API catches errors → Rule Engine classifies → alert fires.

---

### [PUL-040] Shopify Platform Provider
**Status**: 🔴 Open
**Severity**: Medium — expands addressable market beyond SFCC.
**Depends on**: PUL-031

**The Goal**: Implement a Shopify platform provider (`providers/shopify.js`) that extracts Shopify-specific context (Storefront API, Checkout Extensions), defines Shopify commerce action patterns, and registers Shopify PII patterns.

---

### [PUL-041] Agentforce Commerce Provider
**Status**: 🔴 Open
**Severity**: Medium — enables Agent Ops telemetry for AI agent orchestration.
**Depends on**: PUL-031

**The Goal**: Implement an Agentforce Commerce provider for AI agent orchestration telemetry — tool-call tracing, agent step tracking, and commerce intent resolution.

---

### [PUL-042] Commerce Intent Edge Hints
**Status**: 🔴 Open
**Severity**: Medium — extends causal stream from failure/frustration coverage to success/intent coverage.
**Depends on**: PUL-028

**The Goal**: Expand the SDK's edge hint vocabulary beyond failure signals to capture purchase intent, search behavior, and checkout micro-journey causality. The current 8 edge hints cover the incident story; this adds the revenue optimization story.

**New Edge Hints (SDK-observable)**:

| edge_hint | From → To | Detection |
|---|---|---|
| `compared_with` | PAGE_VIEW(PDP) → PAGE_VIEW(PDP) | Sequential PDP views, different products |
| `refined_search` | PAGE_VIEW(Search) → PAGE_VIEW(Search) | Sequential search pages (query refinement) |
| `search_converted` | PAGE_VIEW(Search) → COMMERCE_ACTION | Search → PDP → cart_add chain |

**Future Edge Hints (need provider hooks or `beforeSend`)**:

| edge_hint | Signal | Why deferred |
|---|---|---|
| `coupon_applied` | Promo code entry → checkout | Needs DOM inspection or merchant hook |
| `payment_failed` | Payment rejection vs server error | Needs response body parsing or merchant hook |
| `out_of_stock_hit` | PDP with disabled cart button | Needs DOM inspection |
| `address_abandoned` | Form interaction → tab hide at checkout | Needs form field instrumentation |

**Design**: SDK-observable hints ship first. Merchant-dependent hints expose via a `commerceHooks` provider API where the merchant tells the SDK what happened (e.g. `Pulsar.hint('payment_failed', { reason: 'card_declined' })`).

**Academic Foundation**:

| Area | Key Reference | Relevance |
|---|---|---|
| Process Mining | van der Aalst, "Process Mining: Data Science in Action" (Springer, 2016) | Event log → process model discovery. Our edge inference is process discovery. |
| Customer Journey Mining | Bernard & Andritsos, "A Process Mining Based Model for Customer Journey Mapping" (CAiSE Workshop, 2017) | Sequential touchpoints → journey process models. Direct analog to our funnel edges. |
| Complex Event Processing | Luckham, "The Power of Events" (Addison-Wesley, 2002) | Event patterns, causal vectors, event hierarchies. Our `edge_hint` is a simplified CEP pattern language. |
| Causal Attribution | Bottou et al., "Counterfactual Reasoning and Learning Systems" (JMLR, 2013) | Causal inference in ad click → conversion. Formalizes our campaign → checkout chain. |
| Session-based Rec | Hidasi et al., "Session-based Recommendations with RNNs" (ICLR, 2016) | Sequential session events for intent prediction. Our PDP sequences are input features. |
| Multi-Touch Attribution | Shao & Li, "Data-Driven Multi-Touch Attribution Models" (KDD, 2011) | Beyond last-click to causal multi-touch. Our campaign → commerce is this problem. |
| Data Provenance | Buneman et al., "Why and Where: A Characterization of Data Provenance" (ICDT, 2001) | Why-provenance — tracing outputs to inputs. Our `caused_by` is literal why-provenance. |
| Click Models | Chuklin et al., "Click Models for Web Search" (Springer, 2015) | User click sequences as probabilistic models. Formalizes `refined_search` and `search_to_purchase`. |

**Acceptance Criteria**:
- `compared_with`, `refined_search`, `search_converted` emitted with correct `caused_by` references
- No false positives: `compared_with` only fires for PDP → PDP with different `product_ref`
- Existing edge hints unchanged
- `commerceHooks` provider API spec written (implementation in separate ticket)

---

### [PUL-050] SDK Hardening — Error Boundaries & Defensive Coding
**Status**: 🔴 Open
**Severity**: Critical — the SDK must never crash the host page.
**Depends on**: None

**The Goal**: Wrap every public method, collector, callback, and interceptor in try/catch safety boundaries. The SDK is a guest on the merchant's page — if `extractContext()` throws or `sanitizeMessage` fails, it must fail silently with a debug log, not break checkout.

**Changes**:
1. Every collector setup (`setupErrorHandlers`, `setupFetchInterceptor`, `setupXHRInterceptor`, `setupNavigationTracking`, `setupScrollObserver`, `setupRageClickDetector`) wrapped in try/catch at the call site in `init()`.
2. Every public API method (`init`, `captureException`, `enable`, `disable`, `getContext`, `setTag`, `setUser`, `addBreadcrumb`, `flush`) wrapped in try/catch.
3. `state.extractPlatformContext()` wrapped — provider `extractContext()` can throw (bad cookies, missing globals).
4. Fetch/XHR interceptors must call the original even if Pulsar's logic throws.
5. `beforeSend` timeout + try/catch — user-supplied async function can hang or throw.

**Tests** (~80):
- Mock `document.cookie` getter throwing
- Mock `performance.now()` returning `undefined`
- Mock `navigator.sendBeacon` not existing
- Mock `window.fetch` already patched by another library
- `extractContext()` throwing → event still captured without metadata
- `beforeSend` throwing → event still sent
- `beforeSend` hanging past timeout → event still sent
- SDK loaded twice on same page → no double-patching
- CSP blocking beacon → graceful degradation

---

### [PUL-051] Integration Tests — Full Pipeline Lifecycle
**Status**: 🔴 Open
**Severity**: High — proves the capture → queue → flush pipeline works end-to-end.
**Depends on**: PUL-050

**The Goal**: Test the full `init() → collectors fire → capture() → queue → flush() → disable()` lifecycle in jsdom. These are not unit tests — they exercise the real pipeline with mocked network.

**Tests** (~60):
- `init()` with valid config → collectors attached, state populated
- `init()` with invalid config → SDK disabled, no collectors
- `init()` twice → second call ignored
- Full session: PAGE_VIEW → COMMERCE_ACTION → API_FAILURE → flush → verify payload shape
- `disable()` → all listeners removed, fetch/XHR restored, no leaks
- `enable()` after `disable()` with sampling
- Queue overflow at limit → QUEUE_OVERFLOW event emitted
- `flushOnHide()` during active `flush()` → no double-send
- Two rapid `flush()` calls → concurrency guard works
- `sendBeacon` returns `false` → fallback behavior
- `beforeSend` returns `null` → event dropped
- `beforeSend` modifies event → modified version sent
- Provider resolution: `platform: 'sfcc'` → SFCC patterns in config
- Provider resolution: custom object → merged with generic defaults
- Provider PII patterns registered and applied in sanitizer

---

### [PUL-052] E2E Tests — Real Browser Validation (Playwright)
**Status**: 🔴 Open
**Severity**: High — proves the SDK works in a real browser, not just jsdom.
**Depends on**: PUL-051

**The Goal**: Playwright tests against a minimal HTML page with Pulsar. Intercept `sendBeacon` / `fetch` at the network level. Assert on real payloads from real DOM events.

**Tests** (~30):
- Page load → PAGE_VIEW captured with correct URL and page_type
- Click link → SPA navigation → second PAGE_VIEW with `from_page_type`
- Scroll to bottom → SCROLL_DEPTH events at milestones
- Rapid clicks → RAGE_CLICK with correct selector and count
- Fetch to monitored endpoint returns 500 → API_FAILURE captured
- Fetch to monitored endpoint succeeds → COMMERCE_ACTION if pattern matches
- Tab hide → `sendBeacon` fires with correct envelope shape
- `Pulsar.disable()` → subsequent errors not captured
- `Pulsar.captureException()` → CUSTOM_EXCEPTION in payload
- Campaign URL params → CAMPAIGN_ENTRY event once per session
- RUM metrics captured on page hide (LCP, CLS present)

---

### [PUL-053] Platform Validation — PWA Kit Integration
**Status**: 🔴 Open
**Severity**: High — first real-world validation of the SDK.
**Depends on**: PUL-050, PUL-051

**The Goal**: Install Pulsar in the open-source PWA Kit Retail React App. Run automated Playwright tests against the local storefront simulating real shopper journeys with SFCC API mocks.

**Approach**:
- Clone `pwa-kit` Retail React App, add `@pulsarjs/sdk` to `_app-config`
- Mock SFCC SCAPI responses (MSW or Playwright route interception)
- Set `document.cookie` with synthetic `dwsid` and `dwac_*` values via Playwright `context.addCookies()`
- Set `window.dw = { ac: { _category: 'electronics' } }` via `page.addInitScript()`
- Simulate: browse PLP → PDP → add to cart → checkout → 500 error → rage click → close tab
- Intercept beacon, verify full envelope including SFCC context (`dwsid`, `visitorId`, `category`)

**SFCC Cookie Simulation**: Yes, Playwright can set cookies before page load via `browserContext.addCookies([{ name: 'dwsid', value: '...', domain: 'localhost' }, { name: 'dwac_site1', value: 'visitor123|sess456|customer789', domain: 'localhost' }])`. The SDK's `getCookie()` will read them normally. No real SFCC instance needed.

**Data Extraction**: Intercept all `sendBeacon` calls via `page.route('**/v1/ingest', ...)`, collect payloads, write to JSON. This gives you real-shaped event data for server development and synthetic generator calibration.

---

### [PUL-054] Platform Validation — Shopify Store
**Status**: 🔴 Open
**Severity**: Medium — validates provider architecture on a real non-SFCC store.
**Depends on**: PUL-040, PUL-052

**The Goal**: Install Pulsar on a real Shopify development store via theme `<script>` tag. Validate the generic/Shopify provider against real Storefront API calls.

**Approach**:
- Shopify Partner account → development store (free)
- Add Pulsar via `theme.liquid` snippet
- Browse, add to cart, attempt checkout
- Verify: endpoint filter catches `/cart/add.js`, `/cart/change.js`
- Verify: page type inference works for `/products/`, `/collections/`, `/cart`, `/checkouts/`
- Extract beacon payloads via browser DevTools or Playwright against the real store URL

---