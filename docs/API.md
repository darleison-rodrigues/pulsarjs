# PulsarJS API Reference

Privacy-first error monitoring & RUM for SFCC storefronts.

**Base URL**: `https://api.pulsarjs.com`

---

## Authentication

PulsarJS uses **HMAC-SHA256 per-request signing**. Each request to `/v1/ingest` must include:

| Header | Description |
|---|---|
| `X-Pulsar-Client-Id` | Your tenant ID |
| `X-Pulsar-Signature` | HMAC-SHA256 signature of the JSON body, base64-encoded |

The SDK generates signatures automatically when `secret` is configured.

> **Fallback**: JWT Bearer tokens via `/v1/session` are also supported but HMAC is the recommended path.

---

## SDK Quick Start

```html
<script src="https://api.pulsarjs.com/pulsar.js"></script>
<script>
    Pulsar.init({
        clientId: 'your-tenant-id',
        siteId: 'RefArch',
        secret: 'your-hmac-secret',
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
| `secret` | `string` | `null` | HMAC-SHA256 signing secret |
| `storefrontType` | `string` | `'PWA_KIT'` | `PWA_KIT` or `SITEGENESIS` |
| `sampleRate` | `number` | `1.0` | Session sampling rate (0–1) |
| `beforeSend` | `function` | `null` | Async hook to filter/enrich events. Return `null` to drop. |
| `beforeSendTimeout` | `number` | `2000` | Max ms to wait for `beforeSend` |
| `endpointFilter` | `RegExp` | SFCC routes | Regex to filter which fetch/XHR calls are monitored |
| `criticalSelectors` | `string[]` | Error UI selectors | CSS selectors for MutationObserver (error UI detection) |
| `maxBreadcrumbs` | `number` | `100` | Max breadcrumbs in circular buffer |
| `slowApiThreshold` | `number` | `1000` | Latency threshold (ms) for API_LATENCY events |
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

Runtime toggle. `disable()` restores original `fetch`, `XHR`, `onerror`, and `onunhandledrejection`.

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

### `POST /v1/session`

JWT handshake (legacy, HMAC preferred).

**Headers**: `X-Pulsar-Client-Id`
**Response**: `{ "token": "...", "expires_at": 1234567890 }`

### `POST /v1/ingest`

Primary telemetry sink. Returns `202 Accepted`.

**Headers**: `X-Pulsar-Client-Id`, `X-Pulsar-Signature`
**Content-Type**: `application/json` or `text/plain`

**Response**:
```json
{
    "status": "accepted",
    "incident_id": "uuid",
    "classification": "pending"
}
```

---

## TelemetryEvent Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `error_type` | `string` | ✓ | `JS_CRASH`, `API_FAILURE`, `API_LATENCY`, `UI_FAILURE`, `NETWORK_ERROR`, `RUM_METRICS`, `QUEUE_OVERFLOW`, `FLUSH_FAILED`, `CUSTOM_EXCEPTION` |
| `message` | `string` | ✓ | Error message (PII-redacted by SDK) |
| `session_id` | `string` | ✓ | Unique session ID (crypto.randomUUID) |
| `severity` | `enum` | | `critical` · `high` · `warning` · `low` · `info` |
| `timestamp` | `ISO8601` | | Capture timestamp |
| `url` | `string` | | Document URL |
| `is_blocking` | `boolean` | | Whether error blocks user flow |
| `status_code` | `number` | | HTTP status for API errors |
| `response_snippet` | `string` | | Truncated request body (≤500 chars, PII-redacted) |
| `device_type` | `string` | | `mobile` or `desktop` |
| `metrics` | `WebVitals` | | RUM: LCP, INP, CLS, TTFB, loadTime |
| `metadata` | `object` | | SFCC context (dwsid, pageType, campaign, etc.) |
| `environment` | `object` | | Screen, timezone, DevTools detection |
| `scope` | `object` | | Tags, user, breadcrumbs |
| `dropped_events` | `number` | | Count of dropped events due to queue limits |

### WebVitals Object

| Metric | Type | Description |
|---|---|---|
| `lcp` | `number` | Largest Contentful Paint (ms) |
| `inp` | `number` | Interaction to Next Paint (ms). FID fallback for older browsers. |
| `cls` | `number` | Cumulative Layout Shift |
| `ttfb` | `number` | Time to First Byte (ms) |
| `loadTime` | `number` | Full page load time (ms) |

---

## Pipeline Architecture

```
SDK (pulsar.js) → POST /v1/ingest → CF Queue → Batch Consumer
                                              ├── StorageWorkflow (D1 + R2 + BigQuery)
                                              └── AlertWorkflow (Email / Slack)
```

### Middleware Stack (request order)

1. **Logger** — Request ID, structured logging
2. **Subdomain guard** — Enforces `api.*` in production
3. **CORS** — Origin allowlist
4. **Firewall** — ASN/IP blocklist, path traversal, scanner UA detection
5. **Security headers** — CSP, X-Frame-Options, nosniff
6. **Ingestion auth** — HMAC signature verification → JWT fallback

### Storage (Phase 1)

| Layer | Purpose |
|---|---|
| **D1** | Session tracking, tenant registry, hot metadata |
| **R2** | Raw event blobs (gzip compressed) |
| **BigQuery** | Analytics queries (placeholder, not yet active) |

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
| `202` | Accepted — event queued |
| `400` | Bad request — missing fields or invalid JSON |
| `401` | Unauthorized — invalid/missing HMAC or JWT |
| `403` | Forbidden — origin not in allowlist |
| `404` | Not found — invalid route or firewall block |
| `415` | Unsupported media type — must be JSON or text/plain |
| `500` | Internal error — missing SESSION_SECRET |
