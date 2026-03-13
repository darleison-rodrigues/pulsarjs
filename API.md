#### `POST /v1/ingest`
Primary telemetry sink. Receives ordered behavioral events for ECKG construction.

**Request**
```bash
curl -X POST https://api.pulsarjs.com/v1/ingest \
  -H "X-Pulsar-Client-Id: your-client-id" \
  -H "Content-Type: application/json" \
  -d '{
    "pulsar_version": "1.0.0",
    "client_id": "your-client-id",
    "site_id": "RefArch",
    "timestamp": "2026-03-13T14:22:05.000Z",
    "dropped_events": 0,
    "events": [
      {
        "event_id": "550e8400-e29b-41d4-a716-446655440000:1",
        "event_type": "CAMPAIGN_ENTRY",
        "session_id": "550e8400-e29b-41d4-a716-446655440000",
        "timestamp": "2026-03-13T14:22:01.000Z",
        "url": "/",
        "message": "Campaign: google",
        "severity": "info",
        "is_blocking": false,
        "device_type": "desktop",
        "metadata": {
          "utm_source": "google",
          "utm_medium": "cpc",
          "utm_campaign": "spring-sale"
        }
      },
      {
        "event_id": "550e8400-e29b-41d4-a716-446655440000:2",
        "event_type": "PAGE_VIEW",
        "session_id": "550e8400-e29b-41d4-a716-446655440000",
        "timestamp": "2026-03-13T14:22:01.100Z",
        "url": "/",
        "message": "Page: Home",
        "severity": "info",
        "is_blocking": false,
        "device_type": "desktop",
        "metadata": {
          "page_type": "Home",
          "referrer_type": "campaign",
          "from_page_type": null,
          "path": "/"
        }
      },
      {
        "event_id": "550e8400-e29b-41d4-a716-446655440000:5",
        "event_type": "COMMERCE_ACTION",
        "session_id": "550e8400-e29b-41d4-a716-446655440000",
        "timestamp": "2026-03-13T14:22:45.000Z",
        "url": "/p/product-123",
        "message": "Commerce: cart_add",
        "severity": "info",
        "is_blocking": false,
        "device_type": "desktop",
        "metadata": {
          "action": "cart_add",
          "endpoint": "/baskets/{id}/items",
          "method": "POST",
          "duration_ms": 340
        }
      },
      {
        "event_id": "550e8400-e29b-41d4-a716-446655440000:8",
        "event_type": "API_FAILURE",
        "session_id": "550e8400-e29b-41d4-a716-446655440000",
        "timestamp": "2026-03-13T14:23:12.000Z",
        "url": "/checkout",
        "message": "API HTTP 500: /orders",
        "severity": "error",
        "is_blocking": false,
        "device_type": "desktop",
        "status_code": 500,
        "metadata": {
          "status": 500,
          "endpoint": "/orders",
          "method": "POST",
          "duration_ms": 2100
        }
      }
    ]
  }'
```

**Response (`202 Accepted`)**
```json
{
  "status": "accepted",
  "batch_id": "a1b2c3d4-e5f6-g7h8-i9j0",
  "events_processed": 4
}
```
| Field | Type | Description |
|---|---|---|
| `status` | `string` | Always `accepted`. Processing is asynchronous. |
| `batch_id` | `uuid` | Unique trace ID for the batch. |
| `events_processed` | `number` | Number of events acknowledged. |

---

### Event Types

Events are **ECKG nodes**. The server builds edges (`preceded`, `caused`, `blocked_by`) from `session_id` + `event_id` ordering.

| event_type | Category | Description |
|---|---|---|
| `PAGE_VIEW` | Navigation | Page load or SPA route change. Includes `page_type` and `referrer_type`. |
| `CAMPAIGN_ENTRY` | Navigation | Session entry with UTM/ad params. Fires once per session. |
| `TAB_VISIBILITY` | Navigation | Tab hidden/visible transition. Reveals engagement gaps. |
| `SCROLL_DEPTH` | Interaction | Scroll milestone reached (25%, 50%, 75%, 100%). |
| `RAGE_CLICK` | Interaction | Rapid repeated clicks on the same element. Frustration signal. |
| `COMMERCE_ACTION` | Commerce | Successful SCAPI call: `cart_add`, `cart_update`, `cart_remove`, `checkout`, `search`. |
| `JS_CRASH` | Error | `window.onerror` or `onunhandledrejection`. |
| `API_FAILURE` | Error | Non-2xx response from monitored endpoints. |
| `NETWORK_ERROR` | Error | Fetch/XHR network failure (status 0, DNS, timeout). |
| `UI_FAILURE` | Error | Critical error UI element rendered (MutationObserver). |
| `API_LATENCY` | Performance | API call exceeding `slowApiThreshold`. |
| `RUM_METRICS` | Performance | Core Web Vitals snapshot (LCP, INP, CLS, TTFB). |
| `CUSTOM_EXCEPTION` | Error | Manually captured via `Pulsar.captureException()`. |
| `QUEUE_OVERFLOW` | System | Events dropped due to queue limits. |
| `FLUSH_FAILED` | System | Delivery failed after retries. |

---

### ECKG Edge Inference (Server-Side)

The SDK emits nodes. The server infers edges:

| Edge Type | Rule |
|---|---|
| `preceded` | Sequential events in same session: `e2.seq = e1.seq + 1` |
| `caused` | `CAMPAIGN_ENTRY` → first `PAGE_VIEW` in session |
| `blocked_by` | `API_FAILURE` or `NETWORK_ERROR` within 2s after `COMMERCE_ACTION` |
| `frustrated_by` | `RAGE_CLICK` following any error event in same session |
| `abandoned_at` | `TAB_VISIBILITY(hidden)` after `COMMERCE_ACTION` with no subsequent `checkout` |

Example graph for a single session:
```
CAMPAIGN_ENTRY ──caused──→ PAGE_VIEW(Home) ──preceded──→ PAGE_VIEW(PDP)
                                                              │
                                                         preceded
                                                              ↓
                                                      COMMERCE_ACTION(cart_add)
                                                              │
                                                         preceded
                                                              ↓
                                                      PAGE_VIEW(Checkout)
                                                              │
                                                        blocked_by
                                                              ↓
                                                      API_FAILURE(500)
                                                              │
                                                       frustrated_by
                                                              ↓
                                                      RAGE_CLICK(#place-order)
```

---
