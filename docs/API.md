# PulsarJS API Reference

Privacy-first error monitoring & RUM for SFCC storefronts.

**Base URL**: `https://api.pulsarjs.com`

---

## Authentication

PulsarJS uses **Domain-bound origin validation** and **Client ID** headers. Each request to `/v1/ingest` must include:

| Header | Description |
|---|---|
| `X-Pulsar-Client-Id` | Your tenant ID |

Server-side rate limiting and origin allowlists handle authenticated ingestion.

---

## SDK Quick Start

```html
<script src="https://api.pulsarjs.com/pulsar.js"></script>
<script>
    Pulsar.init({
        clientId: 'your-tenant-id',
        siteId: 'RefArch',
        debug: false
    });
</script>
```

### `Pulsar.init(config)`

| Option | Type | Default | Description |
|---|---|---|---|
| `clientId` | `string` | **Required** | Your PulsarJS tenant ID |
| `siteId` | `string` | `'unknown'` | SFCC Site ID (e.g., RefArch) |
| `endpoint` | `string` | `https://api.pulsarjs.com/v1/ingest` | Ingestion endpoint URL |
| `storefrontType` | `string` | `'PWA_KIT'` | `PWA_KIT` or `SITEGENESIS` |
| `sampleRate` | `number` | `1.0` | Session sampling rate (0–1) |
| `beforeSend` | `function` | `null` | Async hook to filter/enrich events. Return `null` to drop. |
| `beforeSendTimeout` | `number` | `2000` | Max ms to wait for `beforeSend` |
| `endpointFilter` | `RegExp` | SFCC routes | Regex to filter which fetch/XHR calls are monitored |
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

### `Pulsar.getScope()`

Returns the current `Scope` instance for tag/breadcrumb management:

```javascript
Pulsar.getScope().setTag('experiment', 'v2_checkout');
Pulsar.getScope().setUser({ segment: 'vip' });
```

---

## Endpoints

### `GET /v1/health`

Health check.

```json
{ "status": "ok", "service": "pulsarjs" }
```

### `POST /v1/ingest`

Primary telemetry sink. Receives ordered behavioral events for ECKG construction. Returns `202 Accepted`.

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

Every event is a **node** in the Event-Centric Knowledge Graph. The server infers edges from `session_id` + `event_id` ordering.

### Common Fields (all events)

| Field | Type | Required | Description |
|---|---|---|---|
| `event_id` | `string` | ✓ | Monotonic ID: `{session_id}:{seq}`. Unique graph node identifier. |
| `event_type` | `string` | ✓ | Node type (see Event Types below) |
| `session_id` | `string` | ✓ | Session ID (`crypto.randomUUID`) |
| `timestamp` | `ISO8601` | ✓ | Capture time. Temporal edge ordering. |
| `url` | `string` | ✓ | Sanitized URL (query params stripped) |
| `message` | `string` | ✓ | Human-readable summary (PII-redacted) |
| `severity` | `enum` | | `error` · `warning` · `info` |
| `is_blocking` | `boolean` | | Whether this event blocks user flow |
| `device_type` | `string` | | `mobile` or `desktop` |
| `metadata` | `object` | | Event-specific + SFCC context |
| `environment` | `object` | | Screen, timezone, time_since_load |
| `scope` | `object` | | Tags, user, breadcrumbs |
| `metrics` | `WebVitals` | | Only on `RUM_METRICS` events |
| `status_code` | `number` | | Only on API error events |
| `response_snippet` | `string` | | Truncated body (≤500 chars, PII-redacted) |
| `dropped_events` | `number` | | Running count of dropped events |

### Event Types

| event_type | Category | metadata keys | Description |
|---|---|---|---|
| `PAGE_VIEW` | Navigation | `page_type`, `referrer_type`, `from_page_type`, `path` | Page load or SPA route change |
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
| `lcp` | `number` | Largest Contentful Paint (ms) |
| `inp` | `number` | Interaction to Next Paint (ms). FID fallback for older browsers. |
| `cls` | `number` | Cumulative Layout Shift |
| `ttfb` | `number` | Time to First Byte (ms) |
| `loadTime` | `number` | Full page load time (ms) |

---

## ECKG Edge Inference (Server-Side)

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

## SFCC Integration

### PWA Kit (Recommended)

```javascript
// app/components/_app-config/index.jsx
import Pulsar from '@pulsarjs/sdk';

Pulsar.init({
    clientId: 'YOUR_CLIENT_ID',
    siteId: 'RefArch',
    storefrontType: 'PWA_KIT'
});
```

### SiteGenesis (ISML)

```html
<script src="https://api.pulsarjs.com/pulsar.js"></script>
<script>
    Pulsar.init({
        clientId: 'YOUR_CLIENT_ID',
        siteId: '${dw.system.Site.current.ID}',
        storefrontType: 'SITEGENESIS'
    });
</script>
```

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
