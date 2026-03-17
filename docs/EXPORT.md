# Exporting Data to Custom Endpoints (e.g. S3, Data Lakes)

PulsarJS allows you to bypass the default managed ingest service (`api.pulsarjs.com`) and send event streams directly to your own infrastructure. You can configure this easily via the `endpoint` setting.

## Configuration

To route your data to a custom endpoint, provide the URL during initialization:

```javascript
Pulsar.init({
    clientId: 'your-tenant-id',
    siteId: 'my-store',
    // Route traffic to your own API gateway or proxy
    endpoint: 'https://api.your-domain.com/ingest'
});
```

The SDK uses `fetch` (with `sendBeacon` as a fallback during page unloads) to send a `POST` request with a `Content-Type: application/json` header containing the batch payload.

## Payload Schema

The server you set up to receive the SDK's POST requests will receive JSON payloads in the following format. A single request may contain multiple events representing a "batch".

```json
{
  "pulsar_version": "1.0.0",
  "client_id": "your-tenant-id",
  "site_id": "my-store",
  "flushed_at": "2025-02-28T12:00:00.000Z",
  "session": {
    "session_id": "uuid-v4",
    "device_cohort": "mobile_ios",
    "seq_range": [1, 5],
    "started_at": "2025-02-28T11:50:00.000Z",
    "page_count": 3,
    "entry": {
      "page_type": "Home",
      "referrer_type": "campaign",
      "campaign_source": "google"
    }
  },
  "manifest": {
    "has_errors": false,
    "has_commerce": true,
    "has_frustration": false,
    "has_abandonment": false,
    "has_degradation": false,
    "has_product": true,
    "commerce_actions": ["cart_add"],
    "product_refs": ["prod-123"],
    "max_severity": "info",
    "page_types_visited": ["Home", "PDP"]
  },
  "events": [
    {
      "event_id": "uuid-v4:1",
      "client_id": "your-tenant-id",
      "storefront_type": "PWA_KIT",
      "site_id": "my-store",
      "session_id": "uuid-v4",
      "url": "https://www.your-store.com/p/prod-123",
      "timestamp": "2025-02-28T11:55:00.000Z",
      "event_type": "PAGE_VIEW",
      "message": "Page: PDP",
      "response_snippet": null,
      "severity": "info",
      "is_blocking": false,
      "metrics": null,
      "metadata": {
        "page_type": "PDP",
        "referrer_type": "internal",
        "from_page_type": "Home",
        "path": "/p/prod-123",
        "product_ref": "prod-123"
      },
      "environment": {
        "user_agent": "Mozilla/5.0...",
        "viewport": "390x844",
        "language": "en-US",
        "timezone": "America/New_York",
        "connection": "4g"
      },
      "device": {
        "device_cohort": "mobile_ios"
      },
      "status_code": null,
      "scope": {
        "tags": {},
        "user": null,
        "breadcrumbs": []
      },
      "dropped_events": 0,

      // Optional fields for causal edges:
      "caused_by": "uuid-v4:0",
      "edge_hint": "caused"
    }
  ],
  "product_refs": ["prod-123"],
  "dropped_events": 0,
  "_unload": false // true if sent via sendBeacon on page unload
}
```

## Server Expectations & Causal Logic

Because PulsarJS runs client-side and deals with unreliable networks and user behaviors (like closing tabs mid-action), your custom ingest backend needs to gracefully handle the following scenarios:

### 1. Out-of-Order Delivery
If a network request fails, the SDK "rescues" the events and puts them back into the queue alongside newer events. Depending on retry timing and concurrency (e.g., multiple tabs open simultaneously), your server may receive batches of events out of order.
**Solution**: Rely on the `seq_range` in the envelope or the sequence number suffix in the `event_id` (`sessionID:seq`) to order the events server-side.

### 2. Dangling Causal References
To protect memory usage, the SDK's queue is capped at 50 events. If the queue overflows or a retry completely fails, the oldest events are dropped. If an event is dropped, any subsequent events that reference it via `caused_by` will create a "dangling reference".
**Solution**: Your backend causal processing engine must gracefully handle `caused_by` edges that point to non-existent `event_id`s without crashing.

### 3. Flushing to S3
Because web browsers cannot safely sign requests directly to an S3 bucket or map an arbitrary JSON POST payload to an S3 Object PUT request, you **cannot point `endpoint` directly to an S3 bucket URL**.
**Solution**: Point the `endpoint` to a custom API Gateway (e.g. AWS API Gateway + Lambda or Kinesis Firehose) that securely receives the POST payload, validates it, and writes the JSON into S3 or your data warehouse.
