# PulsarJS: Privacy-First RUM for SFCC

**Zero-Dependency Real User Monitoring & Revenue Insurance for Salesforce B2C Commerce**

PulsarJS captures Core Web Vitals, API latencies, client-side crashes, and UI failures across your SFCC storefront (PWA Kit, SFRA, Headless) — then ships actionable alerts without touching your Lighthouse score.

> **The Edge**: Deep SFCC context (`dwsid`, page type inference, OCAPI/SCAPI awareness) + privacy-by-architecture. No session replay, no PII, no consent banner required.

---

## ⚡ What It Does

1. **Zero-Dependency Core**: Connects directly to native browser APIs (`PerformanceObserver`, `navigator.sendBeacon`, `fetch`/`XHR` interception) with no third-party libraries.
2. **Core Web Vitals**: LCP, INP, CLS, TTFB, FCP — measured via `PerformanceObserver` during browser idle time.
3. **SFCC Context Awareness**: Knows *Checkout Step 2* was slow for a *Guest User* on a specific storefront type (PWA Kit vs. SFRA).
4. **Silent Failure Detection**: Catches `TypeError`s, unhandled promise rejections, and failed `fetch`/`XHR` calls (SLAS timeouts, SCAPI 429s).
5. **UI Breadcrumbs**: Rolling memory of the last clicks leading up to a crash — deterministic debugging without session replay.
6. **Privacy-First**: `beforeSend` hooks strip PII before payloads leave the device. Operates under merchant legitimate interest — no consent banner needed.
7. **Resilient Delivery**: Payloads flush via `sendBeacon` on `visibilitychange` with `fetch(..., {keepalive: true})` fallback.

---

## 🏗️ Architecture

```text
┌─────────────────────────────────────────────────────┐
│  Storefront (PWA Kit / SFRA / Headless)             │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  p.js (SDK Pixel)                             │  │
│  │  - PerformanceObserver (Web Vitals)            │  │
│  │  - Fetch & XHR Interceptors                    │  │
│  │  - SFCC Context Extraction                     │  │
│  │  - PII Sanitization at capture time            │  │
│  └───────────────────────┬───────────────────────┘  │
│                          │ navigator.sendBeacon      │
│                 (Fired on visibilitychange)          │
└──────────────────────────┼──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  Cloudflare Edge (api.pulsarjs.com)                 │
│                                                     │
│  POST /v1/session ──► JWT Token                     │
│  POST /v1/ingest  ──► CF Queue ──► Workflows        │
│                                      │    │         │
│                              Storage ─┘    └─ Alert  │
│                              (D1)          (Email)   │
│                                                     │
│  DLQ ──► R2 Bucket (manual recovery)                │
└─────────────────────────────────────────────────────┘
```

---

## 📦 Repository Structure

```
pulsarjs/
├── packages/
│   ├── sdk/              # Browser SDK pixel
│   │   ├── src/
│   │   │   ├── index.js       # Entry point (→ p.js build output)
│   │   │   ├── core/          # Config, scope, session, capture pipeline
│   │   │   ├── collectors/    # Errors, network (fetch/XHR), RUM
│   │   │   ├── integrations/  # SFCC context extraction
│   │   │   └── utils/         # Sanitizers, environment
│   │   └── tests/
│   ├── api/              # Cloudflare Worker API
│   │   ├── src/
│   │   │   ├── index.ts      # Hono routes (/v1/session, /v1/ingest)
│   │   │   ├── routes/       # Ingest handler
│   │   │   ├── middleware/    # Firewall, security, ingestion auth
│   │   │   ├── lib/          # Rule engine, Slack alerts, logger
│   │   │   └── workflows/    # Alert, Storage (CF Durable)
│   │   └── migrations/       # D1 schema
├── terraform/            # Cloudflare infrastructure (D1, R2, Queues)
├── GEMINI.md             # Engineering manifesto & context
└── docs/BACKLOG.md       # Product backlog
```

---

## 🗺️ Roadmap

| Phase | What | Status |
|---|---|---|
| **1** | Core SDK + CF Worker API + D1 + Email Alerts | 🔨 Active |
| **2** | SFCC Cartridge (server-side hooks, WebDAV, code profiler) | Next |
| **3** | Dashboard (revenue-prioritized errors, checkout funnel) | Planned |
| **4** | AppExchange listing | Planned |

---

## 🚀 Quick Start

```html
<!-- Drop into any SFCC storefront -->
<script src="https://api.pulsarjs.com/p.js"></script>
<script>
  Pulsar.init({
    clientId: 'your-project-key',
    storefrontType: 'PWA_KIT', // or 'SFRA' | 'HEADLESS'
    enabled: true,
    debug: false
  });
</script>
```

---

## License

Proprietary. All rights reserved.