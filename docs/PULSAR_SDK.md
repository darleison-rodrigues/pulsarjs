# CLAUDE.md — PulsarJS SDK

> AI assistant instructions for building PulsarJS: a privacy-first ECKG-driven observability SDK for SFCC storefronts.

---

## Project Identity

**PulsarJS** is a client-side JavaScript SDK targeting Salesforce Commerce Cloud (SFCC) storefronts (PWA Kit and SiteGenesis). It captures behavioral events — page views, commerce actions, scroll depth, rage clicks, API failures, Core Web Vitals — and ships them to an edge server that constructs an **Event-Centric Knowledge Graph (ECKG)** per session.

The SDK emits **graph nodes**. The server infers **graph edges** (preceded, caused, blocked_by, frustrated_by, abandoned_at) from session ordering. The value is in the causal chain, not the individual event.

The product competes in the space between "too expensive" (Noibu, Quantum Metric) and "not SFCC-aware" (Sentry, Datadog). The differentiator is deep SFCC context (`dwsid`, `dwac_*` cookies, page type inference, SCAPI commerce action detection) combined with a lightweight, privacy-respecting footprint and ECKG-driven insights.

**Moat statement:**
> A zero-dependency JavaScript beacon that captures the full shopper journey across your Salesforce Commerce Cloud storefront — from campaign click to checkout — and feeds an Event-Centric Knowledge Graph that turns behavioral telemetry into revenue insights. Without touching your Lighthouse score.

---

## Legal & Compliance Position

### PulsarJS Is a Data Processor

PulsarJS operates as a **data processor** under merchant instruction. The merchant (the ecommerce operator) is the data controller — they are accountable to their customers. PulsarJS receives operational telemetry on the merchant's behalf solely to provide the monitoring service.

This is the same legal relationship as Sentry, Datadog, and Noibu. The legal basis for collection is the merchant's **legitimate interest** in monitoring and improving their own storefront. This is a well-established basis under GDPR, Quebec Law 25, and LGPD for operational monitoring, crash detection, and performance measurement. A consent banner is **not required** for this use case.

**PulsarJS must never repurpose event data** beyond providing the monitoring service to the merchant that collected it. No cross-merchant profiling, no advertising, no model training on merchant data. This is the binding constraint — every data handling decision must be consistent with it.

### Data Processing Agreement (DPA)

Every merchant integration requires a signed DPA. This is not optional — it is the legal instrument that enables the legitimate interest basis. The DPA must specify:

- What data PulsarJS receives and for what purpose (operational monitoring only)
- That PulsarJS will not repurpose data beyond service delivery
- Sub-processors (hosting providers, infrastructure)
- Deletion obligations on contract termination (30–90 day window)
- Breach notification procedures

### What PulsarJS May Collect Under Legitimate Interest

| Data Point | Status | Notes |
|---|---|---|
| Session-level event rows | Permissible | Pseudonymous — treat with care |
| Stack traces with URLs | Permissible | Sanitize before storage |
| API latency per endpoint | Permissible | Core monitoring purpose |
| Core Web Vitals per page type | Permissible | Core monitoring purpose |
| UTM params + platform click IDs | Permissible | Campaign attribution — already on the URL, no PII |
| `dwsid` (SFCC session ID) | Permissible | Pseudonymous operational identifier |
| Device cohort label | Permissible | Broad classification only — see Device Signal Strategy |
| Scroll depth milestones | Permissible | Engagement signal, not PII |
| Click selectors (rage click) | Permissible | CSS selector only, no content |
| `visitorId` / `customerId` | Sensitive | Log only when necessary for debugging; never in aggregate reports |
| IP address | Truncate only | Strip last octet (IPv4) or last 80 bits (IPv6) before storage — full IP is disproportionate |
| Full request/response bodies | Never | Sanitize PII; do not store raw bodies |
| User name, email, address | Never | Not necessary for monitoring |
| Raw GPU renderer strings | Never | Classify into cohort labels only |
| Cross-merchant behavioral profiles | Never | Violates processor role |

### IP Address Stripping

IP truncation must be enforced at the **network/load balancer layer**, not in application code. This is a technical control — it guarantees no full IP reaches the data warehouse even in the event of a payload mistake. Configure Cloudflare Workers to truncate before the request reaches application logic.

### Retention

Retention periods must be defined per data type and enforced programmatically:

- Session event rows: 90 days
- Aggregate RUM metrics: 24 months
- Error/crash records: 12 months
- Raw ingest payloads (R2 archive): permanent (immutable cold storage)

### Subject Rights

As a processor, PulsarJS fulfills deletion and access requests on merchant instruction. The SDK and ingest pipeline must support cascading deletion by `sessionId` and by `dwsid`.

---

## Device Signal Strategy

WebGL and device capability signals are useful for correlating performance issues with hardware tier. The following rules define what is and is not permitted.

**Permitted:**
- Broad cohort classification using WebGL — `high-gpu`, `mid-gpu`, `low-gpu`, `software-render`, `apple-silicon`
- Each cohort must represent a population of at least tens of thousands of users to avoid quasi-identification
- `navigator.hardwareConcurrency` and `deviceMemory` for capability hints
- `navigator.connection.effectiveType` for network tier

**Not permitted:**
- Raw GPU renderer strings (e.g., `"ANGLE (NVIDIA GeForce RTX 3090)"`) stored at event level
- Full WebGL extension lists
- Hashed combinations of GPU parameters — a hash of identifying data is still identifying data
- Any signal combination that could single out an individual device

```js
// Correct — cohort label only
function getDeviceCohort() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  if (!gl) return 'no-webgl';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  if (/Apple M[123]/i.test(renderer)) return 'apple-silicon';
  if (/RTX [34]\d{3}/i.test(renderer)) return 'high-nvidia';
  if (/SwiftShader|llvmpipe/i.test(renderer)) return 'software-render';
  if (maxTex >= 16384) return 'high-gpu';
  if (maxTex >= 8192) return 'mid-gpu';
  return 'low-gpu';
}

// Wrong — raw string stored or transmitted
const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); // never send this
```

`software-render` (SwiftShader / llvmpipe) is also a useful **bot detection signal** — log it as a risk indicator at the transaction level, not as a persistent device profile.

---

## Repository Structure (Actual)

```
pulsarjs/
├── packages/
│   ├── sdk/                         # Core browser SDK
│   │   ├── src/
│   │   │   ├── index.js             # Public API surface + IIFE wrapper + createInstance factory
│   │   │   ├── core/
│   │   │   │   ├── capture.js       # Capture pipeline: queue, dedup, debounced flush, retry, beforeSend
│   │   │   │   ├── config.js        # Config defaults + validateConfig()
│   │   │   │   ├── scope.js         # Scope class (breadcrumbs, tags, user)
│   │   │   │   └── session.js       # Session ID generation (crypto.randomUUID only)
│   │   │   ├── collectors/
│   │   │   │   ├── errors.js        # onerror, onunhandledrejection, MutationObserver (debounced)
│   │   │   │   ├── network.js       # fetch + XHR interceptors, COMMERCE_ACTION detection
│   │   │   │   ├── rum.js           # PerformanceObserver: LCP, INP, CLS, TTFB
│   │   │   │   ├── navigation.js    # PAGE_VIEW, SPA routing, CAMPAIGN_ENTRY, TAB_VISIBILITY
│   │   │   │   └── interactions.js  # SCROLL_DEPTH milestones, RAGE_CLICK detection
│   │   │   ├── integrations/
│   │   │   │   └── sfcc.js          # SFCC context extraction (dwsid, dwac_*, page type)
│   │   │   └── utils/
│   │   │       ├── sanitizers.js    # PII redaction, URL sanitization, API endpoint sanitization
│   │   │       └── environment.js   # Screen, timezone, time_since_load, campaign extraction
│   │   ├── tests/
│   │   └── package.json
│   └── agent/                       # DEPRECATED — retired, all capabilities moved to SDK collectors
├── docs/
│   ├── PULSAR_SDK.md                # This file
│   └── API.md                       # Full API reference
├── PULSAR_SERVE.md                  # Server architecture spec
├── PULSAR_INVESTOR_OVERVIEW.md      # Investor-facing scenarios + channel taxonomy
├── API.md                           # Ingest endpoint quick reference
└── README.md
```

---

## Event Types

The SDK emits these event types as ECKG graph nodes. Each event carries an `event_id` (`{session_id}:{seq}`) for monotonic ordering.

| event_type | Category | Emitted by | Description |
|---|---|---|---|
| `PAGE_VIEW` | Navigation | `navigation.js` | Page load or SPA route change (History API patch) |
| `CAMPAIGN_ENTRY` | Navigation | `navigation.js` | UTM + click ID params detected. Once per session. |
| `TAB_VISIBILITY` | Navigation | `navigation.js` | Tab hidden/visible transitions |
| `SCROLL_DEPTH` | Interaction | `interactions.js` | Milestone reached (25%, 50%, 75%, 100%) |
| `RAGE_CLICK` | Interaction | `interactions.js` | Rapid clicks on same element |
| `COMMERCE_ACTION` | Commerce | `network.js` | Successful SCAPI call: cart_add, cart_update, cart_remove, checkout, search |
| `JS_CRASH` | Error | `errors.js` | `window.onerror` or `onunhandledrejection` |
| `API_FAILURE` | Error | `network.js` | Non-2xx from monitored endpoints |
| `NETWORK_ERROR` | Error | `network.js` | Fetch/XHR network failure |
| `UI_FAILURE` | Error | `errors.js` | Critical error UI rendered (MutationObserver) |
| `API_LATENCY` | Performance | `network.js` | API call exceeding `slowApiThreshold` |
| `RUM_METRICS` | Performance | `rum.js` | Core Web Vitals snapshot (flushed on page hide) |
| `CUSTOM_EXCEPTION` | Error | `index.js` | Via `Pulsar.captureException()` |
| `QUEUE_OVERFLOW` | System | `capture.js` | Events dropped due to queue limits |
| `FLUSH_FAILED` | System | `capture.js` | Delivery failed after retries |

### Campaign Attribution (Click IDs)

Captured in `CAMPAIGN_ENTRY` metadata by `navigation.js`:

| Param | Platform |
|---|---|
| `utm_source/medium/campaign/term/content` | Any (manual) |
| `gclid`, `gbraid`, `wbraid` | Google Ads |
| `fbclid` | Meta (Facebook / Instagram) |
| `msclkid` | Microsoft / Bing |
| `ttclid` | TikTok |
| `twclid` | X (Twitter) |
| `li_fat_id` | LinkedIn |
| `pin_unauth` | Pinterest |
| `sccid` | Snapchat |
| `dclid` | Google DV360 |
| `irclickid` | Impact Radius (affiliate) |
| `aff_id`, `clickid` | Generic affiliate |

The SDK sends raw params only. The server resolves them into a structured taxonomy and ontology (see below).

---

## Channel Taxonomy & ECKG Ontology

The ECKG has two classification systems that work together: a **Channel Taxonomy** (how traffic is classified) and an **Event Ontology** (how events relate to each other). The SDK provides the raw signals; the server applies both.

### Why Both?

- **Taxonomy** answers: "What kind of thing is this?" — classification into a hierarchy.
- **Ontology** answers: "How does this thing relate to other things?" — edges, roles, and constraints.

A `CAMPAIGN_ENTRY` with `fbclid` is *classified* by the taxonomy as `paid_social / meta / instagram_ads`. But its *role* in the ontology is "session origin node that **caused** the first PAGE_VIEW." These are different questions — taxonomy is about the node's properties, ontology is about the node's relationships.

### Channel Taxonomy (Server-Side Classification)

The server maps raw SDK params to a 4-level hierarchy. This is a **taxonomy** — a tree of increasingly specific labels.

```
Channel (what budget line)
  └── Platform (which vendor)
       └── Product (which ad product)
            └── Intent (acquisition vs. retention vs. partnership)
```

**Resolution rules** (server applies in order):

| Detection | Channel | Platform | Product | Intent |
|---|---|---|---|---|
| `gclid` or `gbraid` or `wbraid` | `paid_search` | `google` | `google_ads` | `acquisition` |
| `msclkid` | `paid_search` | `microsoft` | `bing_ads` | `acquisition` |
| `fbclid` + `utm_source=facebook` | `paid_social` | `meta` | `facebook_ads` | `acquisition` |
| `fbclid` + `utm_source=instagram` | `paid_social` | `meta` | `instagram_ads` | `acquisition` |
| `fbclid` (no utm_source) | `paid_social` | `meta` | `meta_ads` | `acquisition` |
| `ttclid` | `paid_social` | `tiktok` | `tiktok_ads` | `acquisition` |
| `twclid` | `paid_social` | `x` | `x_ads` | `acquisition` |
| `li_fat_id` | `paid_social` | `linkedin` | `linkedin_ads` | `acquisition` |
| `pin_unauth` | `paid_social` | `pinterest` | `pinterest_ads` | `acquisition` |
| `sccid` | `paid_social` | `snapchat` | `snapchat_ads` | `acquisition` |
| `dclid` | `paid_display` | `google` | `dv360` | `awareness` |
| `irclickid` | `affiliate` | `impact_radius` | — | `partnership` |
| `aff_id` or `clickid` | `affiliate` | `unknown` | — | `partnership` |
| `utm_medium=email` | `email` | `utm_source` value | `email_marketing` | `retention` |
| `utm_medium=social` (no click ID) | `organic_social` | `utm_source` value | — | `organic` |
| referrer = search engine | `organic_search` | referrer hostname | — | `organic` |
| no params, no referrer | `direct` | — | — | `brand_recall` |

**Precedence**: Click IDs take priority over UTM tags. If `fbclid` is present, the channel is `paid_social` regardless of what `utm_medium` says — because click IDs are machine-generated and UTM tags are human-maintained (and often wrong).

**SDK responsibility**: Capture all raw params. Never classify.
**Server responsibility**: Apply taxonomy rules. Store resolved channel on the session. Propagate to all events in that session for aggregation.

### Event Ontology (ECKG Structure)

The ontology defines **what types of nodes exist**, **what edges connect them**, and **what constraints govern those relationships**. This is the formal structure of the knowledge graph.

#### Node Types (Event Classes)

Events are organized into an ontology of classes, not just a flat list:

```
Event (abstract root)
├── NavigationEvent
│   ├── PAGE_VIEW        — has: page_type, referrer_type, from_page_type
│   ├── CAMPAIGN_ENTRY   — has: channel taxonomy, click_ids. Constraint: max 1 per session.
│   └── TAB_VISIBILITY   — has: visibility state. Signals engagement gap.
├── InteractionEvent
│   ├── SCROLL_DEPTH     — has: depth milestone. Signals engagement depth.
│   └── RAGE_CLICK       — has: selector, click_count. Signals frustration.
├── CommerceEvent
│   └── COMMERCE_ACTION  — has: action (cart_add|checkout|search|...), duration_ms
├── ErrorEvent
│   ├── JS_CRASH         — has: stack trace. is_blocking: true
│   ├── API_FAILURE      — has: status_code, endpoint, duration_ms
│   ├── NETWORK_ERROR    — has: endpoint. Implies connectivity issue.
│   ├── UI_FAILURE       — has: selector. Detected via MutationObserver.
│   └── CUSTOM_EXCEPTION — has: user-defined metadata
├── PerformanceEvent
│   ├── API_LATENCY      — has: endpoint, duration_ms. Threshold: slowApiThreshold.
│   └── RUM_METRICS      — has: lcp, inp, cls, ttfb, loadTime
└── SystemEvent
    ├── QUEUE_OVERFLOW    — has: dropped_count. SDK health signal.
    └── FLUSH_FAILED      — SDK health signal.
```

#### Edge Types (Relationships)

Edges are inferred server-side from session ordering and event type constraints:

| Edge | From → To | Inference Rule | Semantic |
|---|---|---|---|
| `preceded` | Any → Any | Sequential `event_id` in same session | Temporal ordering |
| `caused` | CAMPAIGN_ENTRY → PAGE_VIEW | Campaign → first page view (min seq) | Attribution |
| `blocked_by` | CommerceEvent → ErrorEvent | Error within 2s after commerce action | Revenue impact |
| `frustrated_by` | ErrorEvent → RAGE_CLICK | Rage click following any error | UX impact |
| `abandoned_at` | CommerceEvent → TAB_VISIBILITY | Tab hidden after cart, no subsequent checkout | Conversion loss |

#### Ontological Constraints

These are the rules that make the graph meaningful, not just a timeline:

1. **CAMPAIGN_ENTRY is a singleton** — max 1 per session. If params change mid-session (rare), ignore the second occurrence.
2. **`caused` only connects to NavigationEvent** — a campaign causes a page view, never an error or commerce action directly.
3. **`blocked_by` requires temporal proximity** — the error must occur within 2 seconds of the commerce action. Beyond that, the causal link is too weak.
4. **`frustrated_by` requires same-session** — rage click must follow an error in the same session, not just any recent error globally.
5. **`abandoned_at` requires negative proof** — the edge only materializes if no `COMMERCE_ACTION(checkout)` appears after the tab hide. This is checked at session close (24h rolling window in TenantAgent).
6. **ErrorEvents propagate severity upward** — if any event in a session has `severity: error`, the session inherits that severity for scoring and alerting.
7. **CommerceEvents carry revenue signal** — the `action` field maps to funnel stages. The server uses this to compute funnel_stage on the session: `landing → browsing → cart → checkout → converted`.

#### How Taxonomy and Ontology Work Together

The taxonomy classifies the **entry point**. The ontology connects the **full journey**. Together, they answer questions neither could alone:

| Question | Requires |
|---|---|
| "What channels drive the most traffic?" | Taxonomy only |
| "Which sessions had checkout errors?" | Ontology only (blocked_by edges) |
| "Which *paid channels* are losing revenue to checkout errors?" | Taxonomy (channel = paid_*) + Ontology (blocked_by + abandoned_at) |
| "Is Instagram traffic more likely to abandon than Google traffic?" | Taxonomy (segment by platform) + Ontology (abandoned_at rate per segment) |
| "Do affiliate shoppers hit more API latency than email shoppers?" | Taxonomy (segment) + Ontology (API_LATENCY nodes per segment) |

The SDK's job is to emit high-fidelity nodes with raw attribution params. The server's job is to apply the taxonomy, infer the edges, and answer these cross-cutting questions.

---

## Known Issues (Priority Order)

Status reflects the actual codebase as of 2026-03-13.

### P0 — Critical

1. **~~INP missing~~ DONE**
   - INP implemented via `PerformanceObserver` type `event` with `durationThreshold: 40`.
   - FID fallback for older browsers.
   - File: `collectors/rum.js:32-48`

2. **~~Event loss on queue overflow~~ DONE**
   - `QUEUE_OVERFLOW` synthetic event emitted on flush with `dropped_count` and `first_drop_time`.
   - File: `core/capture.js:144-161`

3. **~~Turnstile dependency~~ REMOVED**
   - Session handshake removed entirely. No Turnstile, no `/v1/session` endpoint.
   - Session ID generated locally via `crypto.randomUUID()`.
   - File: `core/session.js`

### P1 — High

4. **~~`beforeSend` async support~~ DONE**
   - `beforeSend` is now async with `Promise.race` timeout (configurable `beforeSendTimeout`, default 2000ms).
   - `allowUnconfirmedConsent` config for timeout fallback behavior.
   - File: `core/capture.js:87-113`

5. **~~CSP nonce support~~ DONE**
   - `nonce` accepted in config. No dynamic scripts injected (Turnstile removed), so this is future-proofing.
   - File: `core/config.js:18`

6. **~~Global scope not isolation-safe~~ DONE**
   - `createInstance(config)` factory export added alongside default singleton.
   - File: `index.js:208-213`

7. **~~No retry logic on flush~~ DONE**
   - Exponential backoff: 3 retries (500ms, 1500ms). `sendBeacon` first, `fetch` fallback.
   - `FLUSH_FAILED` event emitted after all retries exhausted (with `bypassFlush` to prevent recursion).
   - File: `core/capture.js:187-226`

### P2 — Medium

8. **Source map upload tooling missing** — NOT STARTED
   - Without source maps, crash stack traces in production are unreadable.
   - Need: `packages/cli/` with `pulsarjs upload-sourcemaps` command.
   - Priority: After POC server is functional.

9. **~~`sendBeacon` blob type~~ CONFIRMED CORRECT**
   - Uses `text/plain` via `Blob`. Avoids CORS preflight.
   - Server parses body regardless of content-type.
   - File: `core/capture.js:192`

10. **~~MutationObserver debounce~~ DONE**
    - 100ms `setTimeout` debounce on mutation buffer.
    - File: `collectors/errors.js:42-74`

### P3 — From SOC2 audit

11. **~~HMAC signing in capture.js flush~~ DONE**
    - No HMAC code exists in the SDK. Removed during ECKG refactor.
    - Server uses origin validation + `X-Pulsar-Client-Id` header.

12. **~~SECURITY.md version numbers~~ DONE**
    - Version table correctly shows `1.0.x`. Email `security@pulsarjs.com` is intentional.

---

## Architecture Principles

When writing or reviewing code for this project, apply these rules:

**1. Truly zero runtime dependencies**
No `import` of external packages in the final browser bundle. Sanitizers, utilities, and helpers must be self-contained. Build-time devDependencies are fine.

**2. Never mutate the payload after `beforeSend`**
The `beforeSend` hook is a contract with the developer. After it runs, treat the payload as immutable.

**3. Fail silently in production, loudly in debug mode**
Every catch block must gate on `config.debug` before logging. The SDK must never throw to the host page.

**4. Restore everything on `disable()`**
Every monkey-patched global (`fetch`, `XHR`, `onerror`, `pushState`, `replaceState`) and every event listener (scroll, click, visibility, popstate) must be restored to its exact original. This is tested by the teardown in `index.js:140-168`.

**5. PII must be redacted before anything enters the queue**
`Sanitizers.redactPII()` must be called at capture time, not at flush time. Assume the queue may be inspected.

**6. Session ID must use `crypto.randomUUID()` or `crypto.getRandomValues()`**
Never fall back to `Math.random()`. If crypto is unavailable, return `null` and the SDK disables. File: `core/session.js`.

**7. IP address must never reach persistent storage**
Enforced at the Cloudflare Workers layer, not in the SDK. The SDK must not include IP addresses in any payload field. The server truncates before storage.

**8. SFCC context fields are operational identifiers — handle with proportionality**
`dwsid` is pseudonymous. `visitorId` and `customerId` are sensitive. Include them only when operationally necessary. Never include them in aggregate metrics.

**9. Device signals must be cohort labels, never raw fingerprint data**
See Device Signal Strategy above.

**10. The SDK emits nodes, the server computes edges**
The SDK's job is to emit well-ordered, well-typed events with monotonic `event_id` (`session_id:seq`). It should never try to infer relationships between events — that's the server's ECKG responsibility.

**11. Debounce, don't flood**
Flush is debounced at 2 seconds. Every new event resets the timer. `sendBeacon` on page hide for final delivery. Never flush per-event.

---

## Config Schema (Canonical)

```js
{
  clientId: String,               // Required. Your PulsarJS tenant ID.
  endpoint: String,               // Default: 'https://api.pulsarjs.com/v1/ingest'
  siteId: String,                 // Default: 'unknown'. SFCC Site ID (e.g., RefArch).
  storefrontType: Enum,           // 'PWA_KIT' | 'SITEGENESIS'
  enabled: Boolean,               // Default: true.
  sampleRate: Number,             // 0.0–1.0. Default: 1.0
  endpointFilter: RegExp,         // API routes to monitor. Default covers SCAPI baskets/orders/products/shopper.
  criticalSelectors: String[],    // CSS selectors for MutationObserver error UI detection.
  beforeSend: AsyncFunction,      // Async. Mutate payload or return null to drop. Primary consent/CMP integration point.
  beforeSendTimeout: Number,      // ms before beforeSend is timed out. Default: 2000.
  allowUnconfirmedConsent: Boolean, // If true, send events with consent_unconfirmed flag on beforeSend timeout. Default: false.
  nonce: String,                  // CSP nonce for any dynamically created elements.
  maxBreadcrumbs: Number,         // Default: 100
  slowApiThreshold: Number,       // ms before API call emits API_LATENCY. Default: 1000.
  rageClickThreshold: Number,     // Clicks within window to trigger RAGE_CLICK. Default: 3.
  rageClickWindow: Number,        // Time window (ms) for rage click detection. Default: 1000.
  scrollDepthMilestones: Number[], // SCROLL_DEPTH trigger points. Default: [25, 50, 75, 100].
  debug: Boolean                  // Default: false. Enables [Pulsar] console output.
}
```

### `beforeSend` Usage Note

`beforeSend` is the primary integration point for merchant-side consent requirements. Even though PulsarJS operates under legitimate interest and does not require a banner for its own legal basis, individual merchants may have stricter internal policies or regional requirements. This hook is how they enforce them.

```js
Pulsar.init({
  clientId: 'xyz',
  beforeSend: async (payload) => {
    const consent = await OneTrust.getConsentStatus('analytics');
    if (!consent) return null; // drop the payload
    return payload;
  }
});
```

If `beforeSend` throws or times out (2000ms default):
- `allowUnconfirmedConsent: false` (default) → event is **dropped**
- `allowUnconfirmedConsent: true` → event is sent with `metadata.consent_unconfirmed: true`

After `beforeSend` resolves, the payload must not be mutated by any internal code.

---

## Web Vitals Reference

| Metric | Good | Needs Improvement | Poor | Observer Type |
|--------|------|-------------------|------|---------------|
| LCP | ≤2.5s | ≤4.0s | >4.0s | `largest-contentful-paint` |
| INP | ≤200ms | ≤500ms | >500ms | `event` (durationThreshold: 40) |
| CLS | ≤0.1 | ≤0.25 | >0.25 | `layout-shift` |
| TTFB | ≤800ms | ≤1800ms | >1800ms | `navigation` |

> FID is **deprecated** as of March 2024. The SDK falls back to FID only if the `event` observer type is unsupported. File: `collectors/rum.js:42-48`.

---

## SFCC Context Reference

| Data Point | Source | Privacy Classification | Notes |
|---|---|---|---|
| `dwsid` | Cookie `dwsid` | Pseudonymous | Session ID, rotate on checkout. Include in error context only. |
| `visitorId` | Cookie `dwac_*`, field 0 | Sensitive | `__ANNONYMOUS__` means guest — treat as null |
| `customerId` | Cookie `dwac_*`, field 2 | Sensitive | `__ANNONYMOUS__` means guest — treat as null. Log only when essential. |
| `pageType` | URL path inference | Non-personal | Checkout, Cart, PDP, PLP, Search, Home, Other |
| `category` | `window.dw.ac._category` | Non-personal | Only on SiteGenesis, not PWA Kit |

**Rules for SFCC context extraction:**
- Never throw if `window.dw` is undefined
- Treat `__ANNONYMOUS__` as null, not a real value
- Cookie parsing must handle URI-encoded values
- `visitorId` and `customerId` must never appear in aggregate metrics
- `dwsid` and `dwac_*` cookie values must be listed as redaction targets in `Sanitizers`

### Commerce Action Detection (SCAPI Patterns)

The SDK detects successful commerce actions by matching SCAPI endpoints in `network.js`:

| Action | Method | Endpoint Pattern |
|---|---|---|
| `cart_add` | POST | `/baskets/{id}/items` |
| `cart_update` | PATCH | `/baskets/` |
| `cart_remove` | DELETE | `/baskets/{id}/items` |
| `checkout` | POST | `/orders` |
| `search` | GET | `/product-search` |

These fire as `COMMERCE_ACTION` events with the action name, sanitized endpoint, method, and `duration_ms` in metadata.

---

## Sanitizers Contract

`Sanitizers.redactPII(str: string): string` must handle at minimum:

- Credit card numbers (Luhn-detectable patterns)
- Email addresses
- US/CA phone numbers
- IPv4 addresses in query strings
- `password=`, `token=`, `api_key=`, `apikey=`, `authorization=` key-value patterns (case-insensitive)
- JWT tokens (`eyJ...` patterns)
- `dwsid=` and `dwac_` cookie/query string patterns
- Raw WebGL renderer strings matching GPU model patterns (classify, do not pass through)
- Precise timestamps in error context — bucket to nearest minute

`Sanitizers.sanitizeUrl(url)` — strips query params and fragments.
`Sanitizers.sanitizeApiEndpoint(url)` — replaces dynamic path segments (IDs) with `{id}`.

Return value must always be a string. Never throw. Input of non-string type should return `'[redacted]'`.

---

## Testing Expectations

Every module must have unit tests. Use the following patterns:

```js
// Interceptor test pattern — always restore after test
let originalFetch;
beforeEach(() => { originalFetch = window.fetch; });
afterEach(() => { window.fetch = originalFetch; Pulsar.disable(); });
```

**Required test coverage:**
- `sanitizers.js` — 100% line coverage, use adversarial PII strings including `dwsid`, JWT, and GPU renderer strings
- `capture.js` — test queue overflow, beforeSend drop, beforeSend mutation, async beforeSend, 2000ms timeout behavior, debounced flush timing, retry logic, FLUSH_FAILED emission
- `session.js` — test crypto.randomUUID path, crypto.getRandomValues fallback, null return on missing crypto
- `rum.js` — mock PerformanceObserver, assert INP threshold boundary values, assert FID is only used as fallback
- `errors.js` — test onerror, unhandledrejection, MutationObserver debounce
- `sfcc.js` — test `__ANNONYMOUS__` null handling, URI-encoded cookie parsing, undefined `window.dw` safety
- `navigation.js` — test pushState/replaceState patching, campaign entry with all click ID types, classifyReferrer logic
- `interactions.js` — test scroll milestone firing, rage click threshold, milestone reset on route change
- `network.js` — test COMMERCE_ACTION detection for all SCAPI patterns, API_FAILURE emission, API_LATENCY threshold

---

## What Claude Should NOT Do

**Code quality:**
- Do not add npm runtime dependencies to the SDK bundle
- Do not use `Math.random()` for any ID generation
- Do not log anything to the console unless `config.debug === true`
- Do not catch errors silently without incrementing a diagnostic counter
- Do not write `any` TypeScript types — use strict types or JSDoc
- Do not use `document.write()` or synchronous script injection
- Do not expand the public API surface without updating this file
- Do not use `localStorage` or `sessionStorage` for queue persistence (privacy + ITP issues)
- Do not flush per-event — always use the debounced timer (2s)
- Do not add event-to-event edge inference in the SDK — edges are server-side only

**Privacy & compliance:**
- Do not include `dwsid`, `visitorId`, or `customerId` in aggregate payloads or metrics
- Do not store or transmit raw WebGL renderer strings — classify into cohort labels only
- Do not generate persistent cross-session device identifiers of any kind
- Do not store full IP addresses — truncation is enforced at the ingest layer
- Do not repurpose event data across merchants or for any purpose beyond serving the merchant that collected it
- Do not store raw PII in the queue, even temporarily — redact at capture time
- Do not store click ID values (gclid, fbclid, etc.) beyond the CAMPAIGN_ENTRY event — they are one-time attribution signals

---

## Useful References

- [web-vitals.js source](https://github.com/GoogleChrome/web-vitals) — reference implementation for INP attribution
- [Sentry Browser SDK architecture](https://github.com/getsentry/sentry-javascript) — Hub/Client isolation pattern
- [SFCC SCAPI docs](https://developer.salesforce.com/docs/commerce/commerce-api) — endpoint patterns for `endpointFilter` and COMMERCE_ACTION detection
- [INP spec](https://web.dev/articles/inp) — authoritative INP guidance
- [GDPR Article 6 — Legitimate Interest](https://gdpr-info.eu/art-6-gdpr/) — legal basis reference
- [Quebec Law 25 — CAI guidance](https://www.cai.gouv.qc.ca/en/) — Quebec privacy authority
- [LGPD Article 7](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) — Brazilian legal bases including legitimate interest
