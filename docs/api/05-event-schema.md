# Event Schema

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

```text
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
