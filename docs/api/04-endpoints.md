# Endpoints

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
