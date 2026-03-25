# API Reference

Privacy-first commerce instrumentation SDK — platform-agnostic, causality-aware.

**Base URL**: `https://api.pulsarjs.com`

---

## Authentication

PulsarJS uses **Domain-bound origin validation** and **Client ID** headers. Each request to `/v1/ingest` must include:

| Header | Description |
|---|---|
| `X-Pulsar-Client-Id` | Your tenant ID |

Server-side rate limiting and origin allowlists handle authenticated ingestion.

---


### `Pulsar.init(config)`

| Option | Type | Default | Description |
|---|---|---|---|
| `clientId` | `string` | **Required** | Your PulsarJS tenant ID |
| `siteId` | `string` | `'unknown'` | Site identifier (e.g., RefArch) |
| `endpoint` | `string` | `https://api.pulsarjs.com/v1/ingest` | Ingestion endpoint URL |
| `storefrontType` | `string` | `'PWA_KIT'` | `PWA_KIT` or `SITEGENESIS` |
| `platform` | `string\|object` | `'sfcc'` | Platform provider. Built-in: `'sfcc'`. Pass an object for custom providers (see below). |
| `sampleRate` | `number` | `1.0` | Session sampling rate (0–1) |
| `beforeSend` | `function` | `null` | Async hook to filter/enrich events. Return `null` to drop. |
| `beforeSendTimeout` | `number` | `2000` | Max ms to wait for `beforeSend` |
| `allowUnconfirmedConsent` | `boolean` | `false` | If true, send events with consent_unconfirmed flag on beforeSend timeout <!-- DOCS: C1 --> |
| `nonce` | `string` | `null` | CSP nonce for any dynamically created elements <!-- DOCS: C1 --> |
| `endpointFilter` | `RegExp` | from provider | Regex to filter which fetch/XHR calls are monitored. Overrides provider default. |
| `criticalSelectors` | `string[]` | Error UI selectors | CSS selectors for MutationObserver (error UI detection) |
| `maxBreadcrumbs` | `number` | `100` | Max breadcrumbs in circular buffer |
| `slowApiThreshold` | `number` | `1000` | Latency threshold (ms) for API_LATENCY events |
| `rageClickThreshold` | `number` | `3` | Clicks within window to trigger RAGE_CLICK |
| `rageClickWindow` | `number` | `1000` | Time window (ms) for rage click detection |
| `scrollDepthMilestones` | `number[]` | `[25, 50, 75, 100]` | SCROLL_DEPTH trigger points |
| `debug` | `boolean` | `false` | Console logging |

### `Pulsar.captureException(error, metadata?)`

```javascript
try {
    checkout.submit();
} catch (e) {
    Pulsar.captureException(e, { page: 'checkout' });
}
```

### `Pulsar.enable()` / `Pulsar.disable()`

Runtime toggle. `disable()` restores original `fetch`, `XHR`, `onerror`, and `onunhandledrejection`, and detaches interaction/navigation listeners.

### `Pulsar.getContext()`

Returns a snapshot of the current session context, tags, user data, and configuration. Useful for debugging or custom server-side handshakes.

```javascript
const context = Pulsar.getContext();
console.log(context.sessionID);
```


---

## Interacting with the Scope

The Scope API enables context tracking and session tagging that are forwarded to all telemetry events. This enables richer cohort aggregation.

### `Pulsar.getScope()`

Returns the current `Scope` instance for tag/breadcrumb management:

```javascript
// Add experiment details
Pulsar.getScope().setTag('experiment', 'v2_checkout');
// Group events by a user characteristic (never add raw PII)
Pulsar.getScope().setUser({ segment: 'vip' });
```

---

## Defining Custom Commerce Providers

While PulsarJS ships with an `sfcc` built-in provider, custom platform providers can be passed via the `platform` config option. A provider is an object with the following shape:

```javascript
/**
 * @typedef {Object} PlatformProvider
 * @property {string} name                 - Provider identifier ('sfcc', 'shopify', 'custom')
 * @property {Function} extractContext     - Returns platform-specific metadata object
 * @property {Array} commerceActions       - [{action, method, pattern}] commerce API patterns
 * @property {Array} pageTypes             - [[RegExp, string]] page type patterns
 * @property {RegExp|null} endpointFilter  - Which fetch/XHR calls to monitor
 * @property {Array} [piiPatterns]         - [{pattern, replacement}] additional PII redaction rules
 */
```

Missing keys are filled from generic ecommerce defaults. Example:

```javascript
Pulsar.init({
    clientId: 'your-tenant-id',
    platform: {
        name: 'shopify',
        extractContext: () => ({
            shop_id: window.Shopify?.shop,
            theme_id: window.Shopify?.theme?.id
        }),
        commerceActions: [
            { action: 'cart_add', method: 'POST', pattern: /\/cart\/add/i },
            { action: 'checkout', method: 'POST', pattern: /\/checkout/i }
        ],
        endpointFilter: /\/cart\/|\/checkout\//i
    }
});
```

---

## Endpoints

### `GET /v1/health`

Health check.

```json
{ "status": "ok", "service": "pulsarjs" }
```

### `POST /v1/ingest`

Primary telemetry sink. Receives ordered behavioral events for causal chain construction. Returns `202 Accepted`.

**Headers**: `X-Pulsar-Client-Id`, `Content-Type: application/json`
**Fallback**: `text/plain` via `navigator.sendBeacon` (no custom headers — `client_id` is in the body)

**Batch Envelope**:
```json
{
    "pulsar_version": "1.0.0",
    "client_id": "your-client-id",
    "site_id": "RefArch",
    "timestamp": "2026-03-13T14:22:05.000Z",
    "dropped_events": 0,
    "events": [ ... ]
}
```

**Response (`202 Accepted`)**:
```json
{
    "status": "accepted",
    "batch_id": "a1b2c3d4-e5f6-g7h8-i9j0",
    "events_processed": 12
}
```

---

## Event Schema

Every event is a **node** in the causal event stream. The server infers edges from `session_id` + `event_id` ordering.

### Temporal Contract

All transmitted temporal values follow two rules:

| Kind | Format | Example |
|---|---|---|
| **Absolute wall-clock time** | ISO 8601 UTC string | `"2026-03-15T14:30:01.456Z"` |
| **Relative duration** | Integer milliseconds, field suffixed `_ms` | `3420` |

No floats, no epoch integers, no bare offsets in transmitted payloads.

### Identity: Session ID + Event ID

**`session_id`** — Generated once per page load via `crypto.randomUUID()` (fallback: manual UUIDv4 from `crypto.getRandomValues()`). Ephemeral — not persisted to cookies or storage. Never uses `Math.random()`.

**`event_id`** — Monotonic compound key: `{session_id}:{seq}` where `seq` is a 1-based integer incremented per `capture()` call. Guarantees total ordering within a session without a second UUID.

```
session_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
event_id:   "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d:1"
event_id:   "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d:2"
event_id:   "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d:3"
```

### Device: Cohort Hash + Optional Hints

**`device_cohort`** — A hash of cross-browser signals, computed once at SDK init and reused for all events in the session. Used for grouping sessions by device class, not for identifying individual users.

Cohort hash inputs (all universally available):

| Signal | Source | Notes |
|---|---|---|
| Screen dimensions | `screen.width + 'x' + screen.height` | Stable across browsers |
| CPU cores | `navigator.hardwareConcurrency` | All modern browsers |
| IANA timezone | `Intl.DateTimeFormat().resolvedOptions().timeZone` | Geographic clustering without locale ambiguity |
| GPU renderer | `WEBGL_debug_renderer_info` extension | Falls back to `'none'` deterministically |

Realistic entropy: ~6-9 bits on mobile, higher on desktop. This clusters devices into cohorts (e.g., "iPhone 15 in EST"), it does not uniquely identify users. The hash prevents casual payload inspection but is reversible by enumeration at this entropy level — it is not a privacy mechanism.

**`device.hints`** — Optional Chromium-only signals. Present only when the browser exposes them. Never included in the cohort hash. Downstream consumers must not join or group on these fields.

| Hint | Source | Availability |
|---|---|---|
| `device_memory` | `navigator.deviceMemory` | Chromium only. Deliberately excluded by Firefox and Safari as a privacy countermeasure. Coarse values: 0.25, 0.5, 1, 2, 4, 8. |
| `ua_platform` | `navigator.userAgentData?.platform` | Chromium UA-CH only. Absent on Safari/Firefox — no equivalent fallback. |
| `ua_mobile` | `navigator.userAgentData?.mobile` | Chromium UA-CH only. |

### Common Fields (all events)

| Field | Type | Required | Description |
|---|---|---|---|
| `event_id` | `string` | ✓ | Monotonic ID: `{session_id}:{seq}`. Unique graph node identifier. |
| `event_type` | `string` | ✓ | Node type (see Event Types below) |
| `session_id` | `string` | ✓ | Session ID (`crypto.randomUUID`) |
| `timestamp` | `ISO8601` | ✓ | Capture time (absolute). Temporal edge ordering. |
| `url` | `string` | ✓ | Sanitized URL (query params stripped) |
| `message` | `string` | ✓ | Human-readable summary (PII-redacted) |
| `severity` | `enum` | | `error` · `warning` · `info` |
| `is_blocking` | `boolean` | | Whether this event blocks user flow |
| `device` | `object` | ✓ | Device classification (see below) |
| `metadata` | `object` | | Event-specific + SFCC context |
| `environment` | `object` | ✓ | Runtime context (see below) |
| `scope` | `object` | | Tags, user, breadcrumbs |
| `metrics` | `WebVitals` | | Only on `RUM_METRICS` events |
| `status_code` | `number` | | Only on API error events |
| `response_snippet` | `string` | | Truncated body (≤500 chars, PII-redacted) |
| `dropped_events` | `number` | | Running count of dropped events |

### `device` Object

| Field | Type | Required | Description |
|---|---|---|---|
| `device_type` | `string` | ✓ | `"mobile"` or `"desktop"` |
| `device_cohort` | `string` | ✓ | Hash of cross-browser signals (screen, cores, timezone, GPU) |
| `hints` | `object\|null` | | Chromium-only enrichment. `null` or absent on Safari/Firefox. |
| `hints.device_memory` | `number` | | `navigator.deviceMemory` (Chromium only) |
| `hints.ua_platform` | `string` | | `navigator.userAgentData.platform` (Chromium only) |
| `hints.ua_mobile` | `boolean` | | `navigator.userAgentData.mobile` (Chromium only) |

### `environment` Object

| Field | Type | Required | Description |
|---|---|---|---|
| `time_since_load_ms` | `integer` | ✓ | Milliseconds since page load (`Math.round(performance.now())`) |
| `screen_resolution` | `string` | ✓ | `"{width}x{height}"` |
| `timezone` | `string` | ✓ | IANA timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) |
| `is_devtools_open` | `boolean` | | Heuristic based on outer/inner window size delta |

### Full Event Example

```jsonc
{
    // ── Identity
    "event_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d:3",
    "session_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "client_id": "acme-us",
    "site_id": "RefArch",
    "storefront_type": "pwakit",
    "url": "https://shop.acme.com/cart",

    // ── Temporal
    "timestamp": "2026-03-15T14:30:01.456Z",

    // ── Device
    "device": {
        "device_type": "mobile",
        "device_cohort": "k7f2x",
        "hints": {
            "device_memory": 4,
            "ua_platform": "Android",
            "ua_mobile": true
        }
    },

    // ── Environment
    "environment": {
        "time_since_load_ms": 3420,
        "screen_resolution": "390x844",
        "timezone": "America/Sao_Paulo",
        "is_devtools_open": false
    },

    // ── Payload
    "event_type": "COMMERCE_ACTION",
    "message": "cart_add",
    "severity": "info",
    "is_blocking": false,
    "status_code": 200,
    "response_snippet": null,
    "metrics": null,

    // ── Metadata (event-specific + SFCC context)
    "metadata": {
        "action": "cart_add",
        "endpoint": "/baskets/{basket_id}/items",
        "method": "POST",
        "duration_ms": 342,
        "dwsid": "abc123...",
        "visitorId": null,
        "customerId": null,
        "pageType": "Cart",
        "campaign": null
    },

    // ── Scope
    "scope": {
        "user": {},
        "tags": { "release": "2024.03.1" },
        "extra": {},
        "breadcrumbs": [
            {
                "timestamp": "2026-03-15T14:30:00.100Z",
                "category": "navigation",
                "message": "/cart",
                "level": "info"
            }
        ]
    },

    "dropped_events": 0
}
```

### Edge Taxonomy

Events are nodes. Edges connect them. Some edges are hinted by the SDK (deterministic, from direct observation), others are computed by the server (require cross-session context or full session completion).

#### SDK-Hinted Edges

The SDK attaches `edge_hint` and `caused_by` fields to events where the causal relationship is deterministic — not inferred by time proximity.

| Edge | From → To | How SDK Knows |
|---|---|---|
| `preceded` | any → next seq | Sequential by definition. Implicit — not sent as a hint. |
| `blocked_by` | COMMERCE_ACTION → API_FAILURE / NETWORK_ERROR | Same fetch interceptor. The failure IS the response to the commerce call. |
| `frustrated_by` | error event → RAGE_CLICK | Rage click detector stores last error event reference. |
| `abandoned_at` | COMMERCE_ACTION → TAB_VISIBILITY(hidden) | Visibility handler stores last commerce event reference. No subsequent checkout in session. |
| `caused` | CAMPAIGN_ENTRY → PAGE_VIEW | First page view in session. SDK knows it's the first emit. |
| `degraded_by` | COMMERCE_ACTION → API_LATENCY | Same fetch call was slow but successful. Both events originate from one interceptor call. |
| `retried_after` | API_FAILURE → COMMERCE_ACTION (same action type) | Same commerce action type fires again after a failure sequence. |
| `navigated_from` | PAGE_VIEW → PAGE_VIEW | SPA route change. Already tracked via `from_page_type`. |

Edge hint fields on an event:

| Field | Type | Description |
|---|---|---|
| `caused_by` | `string` | `event_id` of the causally related event (always a lower seq number) |
| `edge_hint` | `string` | Edge type: `blocked_by`, `frustrated_by`, `abandoned_at`, `caused`, `degraded_by`, `retried_after` |

Example:
```jsonc
{
    "event_id": "a1b2c3d4-...:8",
    "event_type": "API_FAILURE",
    "metadata": { "status": 500, "endpoint": "/orders" },
    "caused_by": "a1b2c3d4-...:7",
    "edge_hint": "blocked_by"
}
```

#### Server-Computed Edges

These require context beyond a single event stream. The server materializes them after processing the full session or across sessions.

| Edge | From → To | Why Server |
|---|---|---|
| `correlated_with` | Error → Error (cross-session) | Same fingerprint across N sessions in time window. Requires aggregation. |
| `returned_after` | Session → Session | Same device_cohort visited within time window. Requires session history. |
| `converted_through` | CAMPAIGN_ENTRY → COMMERCE_ACTION(checkout) | Needs full session to confirm checkout completed without subsequent error. |
| `recovered_from` | API_FAILURE → COMMERCE_ACTION (same session, later) | User retried and succeeded. Needs full session timeline. |
| `dropped_from` | Session → funnel stage | No subsequent commerce action after last one. Needs session end signal. |

#### Edge Materialization

The SDK emits facts: `{ edge_hint, caused_by }`. The server materializes RDF triples at write time:

```
SDK emits:     { event_id: ":8", edge_hint: "blocked_by", caused_by: ":7" }
Server writes: :session_a3f9c2_000007  :blocked_by  :session_a3f9c2_000008 .
```

The SDK never emits RDF. It doesn't know the ontology namespace. The server owns the triple vocabulary and can evolve it without redeploying the SDK.

---

### Envelope Manifest

The flush envelope includes a `session` object and a `manifest` object summarizing the batch contents. This lets the ingest pipeline route events before parsing the full array.

#### Session Context

Sent with every flush. Computed once at init, updated as the session progresses.

| Field | Type | Description |
|---|---|---|
| `session.session_id` | `string` | Session UUID |
| `session.device_cohort` | `string` | Hash of cross-browser signals |
| `session.seq_range` | `[int, int]` | First and last seq in this batch |
| `session.started_at` | `ISO8601` | Session start time |
| `session.page_count` | `integer` | Pages visited so far |
| `session.entry.page_type` | `string` | First page type in session |
| `session.entry.referrer_type` | `string` | `campaign`, `direct`, `internal`, `external` |
| `session.entry.campaign_source` | `string\|null` | `utm_source` or ad platform name |

#### Manifest Predicates

| Predicate | Type | Description |
|---|---|---|
| `event_count` | `integer` | Number of events in this batch |
| `event_types` | `string[]` | Distinct event types in batch |
| `has_errors` | `boolean` | Batch contains error events |
| `has_commerce` | `boolean` | Batch contains COMMERCE_ACTION events |
| `has_frustration` | `boolean` | Batch contains RAGE_CLICK or repeated retries |
| `has_abandonment` | `boolean` | TAB_VISIBILITY(hidden) after commerce with no subsequent checkout |
| `has_degradation` | `boolean` | API_LATENCY on commerce endpoints |
| `has_product` | `boolean` | Batch contains PDP page views with product references |
| `commerce_actions` | `string[]` | Distinct commerce actions (`cart_add`, `checkout`, etc.) |
| `commerce_count` | `integer` | Total commerce action events |
| `product_refs` | `string[]` | Product identifiers from PDP views (extracted from URL capture group) |
| `max_severity` | `string` | Highest severity in batch: `error` > `warning` > `info` |
| `page_types_visited` | `string[]` | Distinct page types in batch |
| `entry_type` | `string` | Referrer classification for session entry |

#### Full Envelope Example

```jsonc
{
    "pulsar_version": "1.0.0",
    "client_id": "acme-us",
    "site_id": "RefArch",
    "flushed_at": "2026-03-15T14:30:05.000Z",

    "session": {
        "session_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        "device_cohort": "k7f2x",
        "seq_range": [1, 12],
        "started_at": "2026-03-15T14:28:00.000Z",
        "page_count": 5,
        "entry": {
            "page_type": "Home",
            "referrer_type": "campaign",
            "campaign_source": "google"
        }
    },

    "manifest": {
        "event_count": 5,
        "event_types": ["PAGE_VIEW", "COMMERCE_ACTION", "API_FAILURE", "RAGE_CLICK"],
        "has_errors": true,
        "has_commerce": true,
        "has_frustration": true,
        "has_abandonment": false,
        "has_degradation": false,
        "has_product": true,
        "commerce_actions": ["cart_add"],
        "commerce_count": 1,
        "product_refs": ["blue-sneakers-123"],
        "max_severity": "error",
        "page_types_visited": ["Home", "PDP", "Cart", "Checkout"],
        "entry_type": "campaign"
    },

    "events": [ ... ],
    "dropped_events": 0
}
```

#### Server-Computed Session Predicates

These are NOT in the manifest. The server adds them to the session record after processing:

| Predicate | Description |
|---|---|
| `has_conversion` | Checkout completed without subsequent error |
| `has_loyalty` | Device cohort seen in previous sessions |
| `has_revenue_impact` | Error blocked a commerce action |
| `funnel_stage` | Deepest commerce stage reached |
| `funnel_completed` | Checkout succeeded |
| `session_health` | `ok`, `errored`, `crashed`, `abnormal` |

---

### Event Types

| event_type | Category | metadata keys | Description |
|---|---|---|---|
| `PAGE_VIEW` | Navigation | `page_type`, `referrer_type`, `from_page_type`, `path`, `product_ref` | Page load or SPA route change. `product_ref` present on PDP pages. |
| `CAMPAIGN_ENTRY` | Navigation | `utm_source`, `utm_medium`, `utm_campaign`, `gclid`, `fbclid` | Session entry with campaign params. Once per session. |
| `TAB_VISIBILITY` | Navigation | `visibility`, `page_type` | Tab hidden/visible. Reveals engagement gaps. |
| `SCROLL_DEPTH` | Interaction | `depth` | Milestone reached (25%, 50%, 75%, 100%) |
| `RAGE_CLICK` | Interaction | `selector`, `click_count`, `window_ms` | Rapid clicks on same element. Frustration signal. |
| `COMMERCE_ACTION` | Commerce | `action`, `endpoint`, `method`, `duration_ms` | Successful SCAPI call: `cart_add`, `cart_update`, `cart_remove`, `checkout`, `search` |
| `JS_CRASH` | Error | — | `window.onerror` or unhandled rejection |
| `API_FAILURE` | Error | `status`, `endpoint`, `method`, `duration_ms` | Non-2xx from monitored endpoints |
| `NETWORK_ERROR` | Error | `endpoint`, `method` | Fetch/XHR network failure |
| `UI_FAILURE` | Error | — | Critical error UI rendered (MutationObserver) |
| `API_LATENCY` | Performance | `endpoint`, `method`, `duration_ms` | API exceeding `slowApiThreshold` |
| `RUM_METRICS` | Performance | — | Core Web Vitals snapshot |
| `CUSTOM_EXCEPTION` | Error | user-defined | Via `Pulsar.captureException()` |
| `QUEUE_OVERFLOW` | System | `dropped_count`, `first_drop_time` | Events dropped due to queue limits |
| `FLUSH_FAILED` | System | — | Delivery failed after retries |

### WebVitals Object (on RUM_METRICS)

| Metric | Type | Description |
|---|---|---|
| `lcp` | `integer` | Largest Contentful Paint (ms) |
| `inp` | `integer` | Interaction to Next Paint (ms). FID fallback for older browsers. |
| `cls` | `number` | Cumulative Layout Shift (unitless ratio) |
| `ttfb` | `integer` | Time to First Byte (ms) |
| `load_time_ms` | `integer` | Full page load time (ms) |

---

## Causal Edge Inference (Server-Side)

The SDK emits **nodes**. The server computes **edges** from session ordering and event type pairs.

| Edge Type | Inference Rule |
|---|---|
| `preceded` | Sequential events in same session (`e2.seq = e1.seq + 1`) |
| `caused` | `CAMPAIGN_ENTRY` → first `PAGE_VIEW` in session |
| `blocked_by` | `API_FAILURE` / `NETWORK_ERROR` within 2s after `COMMERCE_ACTION` |
| `frustrated_by` | `RAGE_CLICK` following any error event |
| `abandoned_at` | `TAB_VISIBILITY(hidden)` after `COMMERCE_ACTION` with no subsequent `checkout` |

```
CAMPAIGN_ENTRY ──caused──→ PAGE_VIEW(Home) ──preceded──→ PAGE_VIEW(PDP)
                                                              │
                                                      COMMERCE_ACTION(cart_add)
                                                              │
                                                      PAGE_VIEW(Checkout)
                                                              │ blocked_by
                                                      API_FAILURE(500)
                                                              │ frustrated_by
                                                      RAGE_CLICK(#place-order)
```

---

## Pipeline Architecture

```
SDK (pulsar.js) → POST /v1/ingest → CF Queue → Batch Consumer
                                                    ├── Event Store (events table)
                                                    ├── Edge Materializer (optional, Phase 2)
                                                    └── AlertWorkflow (Email / Slack)
```

### Middleware Stack (request order)

1. **Logger** — Request ID, structured logging
2. **Subdomain guard** — Enforces `api.*` in production
3. **CORS** — Origin allowlist
4. **Firewall** — ASN/IP blocklist, path traversal, scanner UA detection
5. **Security headers** — CSP, X-Frame-Options, nosniff
6. **Ingestion auth** — Domain-origin validation + Client ID

### Storage

**Phase 1 (MVP — query-time graph)**:

| Layer | Purpose |
|---|---|
| **D1** | Events table (flat), tenant registry, session index |
| **R2** | Raw batch blobs (gzip, immutable archive) |

Events are stored flat. Graph edges computed at query time via SQL window functions on `session_id` + `event_id` ordering.

**Phase 2 (materialized graph)**:

| Layer | Purpose |
|---|---|
| **ClickHouse** | Columnar event store. Fast aggregation across millions of sessions. |
| **Edge table** | Pre-computed adjacency list: `(source_event_id, target_event_id, edge_type)` |
| **R2** | Cold archive |

Edge materialization happens in the batch consumer. Dashboard queries become graph traversals instead of window functions.

### Alerting

| Channel | Status |
|---|---|
| **Email** | Phase 1 default (via SendGrid/Resend) |
| **Slack** | Opt-in webhook integration |

---

## Error Codes

| HTTP | Meaning |
|---|---|
| `202` | Accepted — batch queued for processing |
| `400` | Bad request — missing `client_id`, invalid JSON, or empty events array |
| `403` | Forbidden — origin not in allowlist |
| `404` | Not found — invalid route |
| `415` | Unsupported media type — must be `application/json` or `text/plain` |
| `429` | Too many requests — rate limit exceeded for this `client_id` |
| `500` | Internal error |
