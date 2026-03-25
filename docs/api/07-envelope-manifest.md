# Envelope Manifest

The flush envelope includes a `session` object and a `manifest` object summarizing the batch contents. This lets the ingest pipeline route events before parsing the full array.

### Session Context

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

### Manifest Predicates

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

### Full Envelope Example

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
