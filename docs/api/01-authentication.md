# Authentication

PulsarJS uses **Domain-bound origin validation** and **Client ID** headers. Each request to `/v1/ingest` must include:

| Header | Description |
|---|---|
| `X-Pulsar-Client-Id` | Your tenant ID |

Server-side rate limiting and origin allowlists handle authenticated ingestion.
