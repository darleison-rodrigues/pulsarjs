<p align="center">
  <img src="https://img.shields.io/badge/bundle-22KB_gzip-18160f?style=flat-square" alt="Bundle size" />
  <img src="https://img.shields.io/badge/dependencies-0-18160f?style=flat-square" alt="Zero dependencies" />
  <img src="https://img.shields.io/github/actions/workflow/status/pulsarjs/pulsarjs/ci.yml?branch=main&style=flat-square&label=CI&color=2a7a4b" alt="CI" />
  <img src="https://img.shields.io/badge/coverage-unit%20%2B%20e2e-2a7a4b?style=flat-square" alt="Tests" />
  <img src="https://img.shields.io/badge/license-BSL_1.1-d4872a?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/SFCC-PWA_Kit_%7C_SiteGenesis-2a4a7a?style=flat-square" alt="SFCC" />
</p>

# PulsarJS

**Turn shopper behavior into a knowledge graph. Zero PII. 22KB. One script tag.**

PulsarJS is an observability SDK for Salesforce Commerce Cloud storefronts. It captures the full shopper journey — from campaign click to checkout — and feeds an **Event-Centric Knowledge Graph** that turns behavioral telemetry into revenue insights.

Traditional tools tell you "500 errors went up." Pulsar tells you _"Google Ads traffic is hitting a payment API failure on checkout, causing 40% cart abandonment — costing $12K/day."_

```html
<script src="https://api.pulsarjs.com/pulsar.js"></script>
<script>
  Pulsar.init({ clientId: 'your-tenant-id', siteId: 'RefArch' });
</script>
```

That's it. No npm install, no build step, no consent banner required.

---

## How It Works

```
Storefront → pulsar.js (22KB) → api.pulsarjs.com → Knowledge Graph → Alerts + Dashboard
```

The SDK captures **15 event types** as graph nodes. The server infers **5 edge types** (caused, preceded, blocked_by, frustrated_by, abandoned_at) from session ordering. The result is a causal chain per session, not just isolated metrics.

| What happened | What Pulsar captures | ECKG edge |
|---|---|---|
| Shopper clicks Google Ad → lands on Home | `CAMPAIGN_ENTRY` → `PAGE_VIEW` | **caused** |
| Shopper adds to cart → checkout API fails | `COMMERCE_ACTION` → `API_FAILURE` | **blocked_by** |
| API error → shopper rage-clicks | `API_FAILURE` → `RAGE_CLICK` | **frustrated_by** |
| Cart added → shopper closes tab | `COMMERCE_ACTION` → `TAB_VISIBILITY` | **abandoned_at** |

---

## Event Types

| Category | Events | Description |
|---|---|---|
| **Navigation** | `PAGE_VIEW` `CAMPAIGN_ENTRY` `TAB_VISIBILITY` | Page loads, SPA routing, campaign attribution (16 click IDs), tab focus |
| **Interaction** | `SCROLL_DEPTH` `RAGE_CLICK` | Engagement depth (25/50/75/100%), frustration detection |
| **Commerce** | `COMMERCE_ACTION` | SCAPI detection: cart_add, cart_update, cart_remove, checkout, search |
| **Error** | `JS_CRASH` `API_FAILURE` `NETWORK_ERROR` `UI_FAILURE` `CUSTOM_EXCEPTION` | Crashes, non-2xx APIs, network failures, error UI (MutationObserver) |
| **Performance** | `API_LATENCY` `RUM_METRICS` | Slow API alerts, Core Web Vitals (LCP, INP, CLS, TTFB) |
| **System** | `QUEUE_OVERFLOW` `FLUSH_FAILED` | SDK health signals |

---

## Campaign Attribution

Captures **16 attribution parameters** from landing URLs — the full paid acquisition ecosystem:

| Platform | Parameters |
|---|---|
| Google Ads | `gclid`, `gbraid`, `wbraid` |
| Meta (Facebook/Instagram) | `fbclid` |
| Microsoft/Bing | `msclkid` |
| TikTok, X, LinkedIn, Pinterest, Snapchat | `ttclid`, `twclid`, `li_fat_id`, `pin_unauth`, `sccid` |
| Google DV360 | `dclid` |
| Affiliate networks | `irclickid`, `aff_id`, `clickid` |
| Manual | `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` |

The server resolves raw params into a **channel taxonomy** (channel → platform → product → intent) for ECKG enrichment.

---

## SFCC Integration

### PWA Kit

```javascript
// app/components/_app-config/index.jsx
import '@pulsarjs/sdk';

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

### Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `clientId` | `string` | **required** | Your PulsarJS tenant ID |
| `siteId` | `string` | `'unknown'` | SFCC Site ID |
| `storefrontType` | `string` | `'PWA_KIT'` | `PWA_KIT` or `SITEGENESIS` |
| `sampleRate` | `number` | `1.0` | Session sampling (0–1) |
| `beforeSend` | `async fn` | `null` | Filter/enrich events. Return `null` to drop. |
| `beforeSendTimeout` | `number` | `2000` | Max ms for `beforeSend` |
| `endpointFilter` | `RegExp` | SCAPI routes | Which fetch/XHR calls to monitor |
| `slowApiThreshold` | `number` | `1000` | ms before `API_LATENCY` fires |
| `rageClickThreshold` | `number` | `3` | Clicks to trigger `RAGE_CLICK` |
| `rageClickWindow` | `number` | `1000` | ms window for rage detection |
| `scrollDepthMilestones` | `number[]` | `[25,50,75,100]` | Scroll trigger points |
| `debug` | `boolean` | `false` | Console logging |

### Public API

```javascript
Pulsar.captureException(error, { page: 'checkout' }); // Manual capture
Pulsar.getScope().setTag('experiment', 'v2_checkout');  // Tag sessions
Pulsar.getScope().setUser({ segment: 'vip' });          // User context
Pulsar.getContext();                                     // Session snapshot
Pulsar.enable() / Pulsar.disable();                     // Runtime toggle
```

---

## Architecture

```
pulsarjs/
├── packages/
│   └── sdk/                         # Core browser SDK
│       ├── src/
│       │   ├── index.js             # Public API + IIFE wrapper
│       │   ├── core/                # capture, config, scope, session
│       │   ├── collectors/          # errors, network, rum, navigation, interactions
│       │   ├── integrations/        # SFCC context (dwsid, dwac_*, page type)
│       │   └── utils/               # sanitizers, environment
│       ├── tests/
│       │   ├── unit/                # Vitest (jsdom)
│       │   └── e2e/                 # Playwright (Chromium)
│       └── dist/
│           ├── pulsar.js            # Production (minified, ~22KB gzip)
│           └── pulsar.js.map        # Source map
├── docs/                            # API reference, SDK spec, changelog
├── .github/workflows/ci.yml         # Lint → Build → Test → E2E
└── PULSAR_SERVE.md                  # Server architecture (CF Workers)
```

### Design Principles

- **Zero runtime dependencies.** Single-file IIFE. No npm packages in the browser bundle.
- **Privacy at capture time.** PII redacted before entering the queue. URLs sanitized. No cookies created.
- **Nodes not edges.** The SDK emits well-ordered events. The server infers causal relationships.
- **Debounce, don't flood.** 2-second flush timer. `sendBeacon` on page hide. Never flush per-event.
- **Restore everything on disable().** Every patched global and event listener is torn down cleanly.

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

```bash
# Install
pnpm install

# Build SDK
pnpm --filter @pulsarjs/sdk build        # → dist/pulsar.js (minified)
pnpm --filter @pulsarjs/sdk build:dev    # → dist/pulsar.dev.js

# Test
pnpm --filter @pulsarjs/sdk test         # Vitest unit tests
pnpm --filter @pulsarjs/sdk test:e2e     # Playwright E2E

# Lint
pnpm exec eslint .
```

---

## License

[BSL 1.1](LICENSE) — free for non-competing use. Converts to Apache 2.0 on February 28, 2029.

**Copyright 2025 Darleison Rodrigues.** Contact: darleison@pulsarjs.com
