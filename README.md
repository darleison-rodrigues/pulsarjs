<p align="center">
  <img src="https://img.shields.io/badge/bundle-22KB_gzip-18160f?style=flat-square" alt="Bundle size" />
  <img src="https://img.shields.io/badge/dependencies-0-18160f?style=flat-square" alt="Zero dependencies" />
  <img src="https://img.shields.io/github/actions/workflow/status/pulsarjs/pulsarjs/ci.yml?branch=main&style=flat-square&label=CI&color=2a7a4b" alt="CI" />
  <img src="https://img.shields.io/badge/coverage-unit%20%2B%20e2e-2a7a4b?style=flat-square" alt="Tests" />
  <img src="https://img.shields.io/badge/license-BSL_1.1-d4872a?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/platforms-SFCC_%7C_Shopify_%7C_Custom-2a4a7a?style=flat-square" alt="Platforms" />
</p>

# PulsarJS

**Commerce instrumentation SDK. Turn shopper behavior into causal event chains. Zero PII. 22KB. One script tag.**

PulsarJS is an electronic commerce instrumentation SDK that captures the full shopper journey — from campaign click to checkout — and builds **causal event chains** that connect behavioral telemetry to revenue impact.

Traditional tools tell you "500 errors went up." Pulsar tells you _"Google Ads traffic is hitting a payment API failure on checkout, causing 40% cart abandonment — costing $12K/day."_

* **Zero runtime dependencies.** Single-file IIFE. No npm packages in the browser bundle.
* **Privacy at capture time.** PII redacted before entering the queue. URLs sanitized. No cookies created.
* **Nodes not edges.** The SDK emits well-ordered events. The server infers causal relationships.
* **Provider-based enrichment.** Platform-specific logic is encapsulated in providers, keeping the core engine agnostic.

---

## ⚡ Quick Start

Add the following snippet to your `<head>` or via your Tag Manager.

```html
<script src="https://api.pulsarjs.com/pulsar.js"></script>
<script>
  Pulsar.init({
    clientId: 'your-tenant-id',
    siteId: 'my-store'
  });
</script>
```

That's it. No npm install, no build step, no consent banner required.

---

## 📖 Documentation

<!-- DOCS: M2 -->
* [API Reference](docs/INDEX.md#api-reference) — Full configuration options, public methods, and event schemas.
* [Platform Providers & Examples](docs/guide/14-examples.md) — How to integrate with SFCC, Shopify, React, and Custom platforms.
* [Architecture & Guide](docs/INDEX.md#pulsarjs-architecture--internal-guide) — Deep dive into the SDK internals, causality engine, and architecture.
* [Custom Export](docs/guide/15-export.md) — How to export event data to your own S3 bucket or data lake.

---

## How It Works

```text
Storefront → pulsar.js (22KB) → api.pulsarjs.com → Causal Event Stream → Alerts + Dashboard
```

The SDK captures **15 event types**. The SDK hints at **8 causal relationships** (preceded, blocked_by, frustrated_by, abandoned_at, caused, degraded_by, retried_after, navigated_from) and the server computes an additional **5 relationships**. The result is a causal chain per session, not just isolated metrics.

| What happened | What Pulsar captures | Causal edge |
|---|---|---|
| Shopper clicks Google Ad → lands on Home | `CAMPAIGN_ENTRY` → `PAGE_VIEW` | **caused** |
| Shopper adds to cart → checkout API fails | `COMMERCE_ACTION` → `API_FAILURE` | **blocked_by** |
| API error → shopper rage-clicks | `API_FAILURE` → `RAGE_CLICK` | **frustrated_by** |
| Cart added → shopper closes tab | `COMMERCE_ACTION` → `TAB_VISIBILITY` | **abandoned_at** |

<!-- DOCS: M1 -->

---

## Event Types

| Category | Events | Description |
|---|---|---|
| **Navigation** | `PAGE_VIEW` `CAMPAIGN_ENTRY` `TAB_VISIBILITY` | Page loads, SPA routing, campaign attribution (16 click IDs), tab focus |
| **Interaction** | `SCROLL_DEPTH` `RAGE_CLICK` | Engagement depth (25/50/75/100%), frustration detection |
| **Commerce** | `COMMERCE_ACTION` | Commerce API detection: cart_add, cart_update, cart_remove, checkout, search |
| **Error** | `JS_CRASH` `API_FAILURE` `NETWORK_ERROR` `UI_FAILURE` `CUSTOM_EXCEPTION` | Crashes, non-2xx APIs, network failures, error UI (MutationObserver) |
| **Performance** | `API_LATENCY` `RUM_METRICS` | Slow API alerts, Core Web Vitals (LCP, INP, CLS, TTFB) |
| **System** | `QUEUE_OVERFLOW` `FLUSH_FAILED` | SDK health signals |

---

## Platform Providers

PulsarJS uses a **provider architecture** to decouple platform-specific enrichment from core instrumentation. Each provider supplies commerce action patterns, page type mappings, endpoint filters, PII patterns, and a context extractor.

### Built-in: SFCC (default)

SFCC is the built-in default provider. It extracts `dwsid`, `dwac_*` visitor/customer IDs, `dw.ac` category context, and detects Evergage/BOOMR.

```javascript
Pulsar.init({ clientId: '...', platform: 'sfcc' });        // explicit (same as default)
Pulsar.init({ clientId: '...' });                           // SFCC is the default
```

<!-- DOCS: M2 -->
For custom providers and more examples, see [Platform Providers & Examples](docs/guide/14-examples.md).
<!-- DOCS: M2 -->

---

## Privacy & Compliance

PulsarJS operates as a **data processor** under merchant instruction. Legal basis: **legitimate interest** (GDPR Art. 6(1)(f), LGPD Art. 7, Quebec Law 25).

| | Status |
|---|---|
| PII collection | **Never.** Redacted at capture time. |
| Cookie creation | **Never.** Session ID via `crypto.randomUUID()`. |
| Cross-session tracking | **Never.** No persistent identifiers. |
| IP storage | **Truncated** at edge (Cloudflare Workers). |
| Consent banner required | **No.** Operational monitoring under legitimate interest. |
| Data retention | 90 days (events), 24h (real-time metrics). |

---

## Development

<!-- DOCS: H3 -->
```bash
# Install
pnpm install

# Build
pnpm --recursive run build

# Test
pnpm --recursive --if-present run test
pnpm --recursive --if-present run typecheck

# Lint
pnpm exec eslint .
```

---

## License

[BSL 1.1](LICENSE) — free for non-competing use. Converts to Apache 2.0 on February 28, 2029.

**Copyright 2025 Darleison Rodrigues.** Contact: darleison@pulsarjs.com
