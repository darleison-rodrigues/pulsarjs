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

```html
<script src="https://api.pulsarjs.com/pulsar.js"></script>
<script>
  Pulsar.init({ clientId: 'your-tenant-id', siteId: 'my-store' });
</script>
```

That's it. No npm install, no build step, no consent banner required.

---

## How It Works

```
Storefront → pulsar.js (22KB) → api.pulsarjs.com → Causal Event Stream → Alerts + Dashboard
```

The SDK captures **15 event types**. The server infers **5 causal relationships** (caused, preceded, blocked_by, frustrated_by, abandoned_at) from session ordering. The result is a causal chain per session, not just isolated metrics.

| What happened | What Pulsar captures | Causal edge |
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
| **Commerce** | `COMMERCE_ACTION` | Commerce API detection: cart_add, cart_update, cart_remove, checkout, search |
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

The server resolves raw params into a **channel taxonomy** (channel → platform → product → intent) for causal event stream enrichment.

---

## Platform Providers

PulsarJS uses a **provider architecture** to decouple platform-specific enrichment from core instrumentation. Each provider supplies commerce action patterns, page type mappings, endpoint filters, PII patterns, and a context extractor.

### Built-in: SFCC (default)

SFCC is the built-in default provider. It extracts `dwsid`, `dwac_*` visitor/customer IDs, `dw.ac` category context, and detects Evergage/BOOMR.

```javascript
Pulsar.init({ clientId: '...', platform: 'sfcc' });        // explicit (same as default)
Pulsar.init({ clientId: '...' });                           // SFCC is the default
```

#### SFCC — PWA Kit

```javascript
// app/components/_app-config/index.jsx
import '@pulsarjs/sdk';

Pulsar.init({
    clientId: 'YOUR_CLIENT_ID',
    siteId: 'RefArch',
    storefrontType: 'PWA_KIT'
});
```

#### SFCC — SiteGenesis (ISML)

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

### Custom Provider

Pass a provider object to override platform-specific behavior:

```javascript
Pulsar.init({
    clientId: '...',
    platform: {
        name: 'custom',
        extractContext: () => ({ tenant: 'acme', region: 'us-east' }),
        commerceActions: [
            { action: 'cart_add', method: 'POST', pattern: /\/api\/cart\/add/i }
        ],
        pageTypes: [
            [/\/product\/([^/?]+)/i, 'PDP'],
            [/\/checkout/i, 'Checkout'],
            [/^\/$/,  'Home']
        ],
        endpointFilter: /\/api\//i,
        piiPatterns: [
            { pattern: /\bUSER-\d+\b/gi, replacement: '[USER_REDACTED]' }
        ]
    }
});
```

Missing keys are filled from sensible generic ecommerce defaults.

### Provider Roadmap

| Provider | Status | Description |
|---|---|---|
| SFCC | Built-in | Salesforce Commerce Cloud (PWA Kit, SiteGenesis) |
| Shopify | Planned | Storefront API + Checkout Extensions |
| Agentforce Commerce | Planned | AI agent orchestration telemetry |
| Custom | Available | User-supplied provider object |

---

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `clientId` | `string` | **required** | Your PulsarJS tenant ID |
| `siteId` | `string` | `'unknown'` | Site identifier |
| `storefrontType` | `string` | `'PWA_KIT'` | `PWA_KIT` or `SITEGENESIS` |
| `platform` | `string\|object` | `'sfcc'` | Platform provider — `'sfcc'`, custom object, or provider name |
| `sampleRate` | `number` | `1.0` | Session sampling (0–1) |
| `beforeSend` | `async fn` | `null` | Filter/enrich events. Return `null` to drop. |
| `beforeSendTimeout` | `number` | `2000` | Max ms for `beforeSend` |
| `endpointFilter` | `RegExp` | from provider | Which fetch/XHR calls to monitor. Overrides provider default. |
| `commerceActions` | `array` | from provider | Commerce action patterns. Overrides provider default. |
| `pageTypes` | `array` | from provider | Page type regex/name tuples. Overrides provider default. |
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
│       │   ├── providers/           # Platform providers (sfcc, generic)
│       │   ├── integrations/        # Backward-compat shims
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
- **Provider-based enrichment.** Platform-specific logic is encapsulated in providers, keeping the core engine agnostic.
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
