# Legal & Compliance Position

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
