# PulsarJS

> **Unconditionally Reliable Monitoring for High-Volume Storefronts.**

PulsarJS is a privacy-first, zero-dependency Monitoring SDK specifically engineered for Salesforce Commerce Cloud (SFCC) environments. It captures Core Web Vitals, API latencies, client-side crashes, and UI failures with surgical precision—designed to operate under *legitimate interest* without requiring a consent banner.

---

## 🏛 Architecture & Philosophy

PulsarJS is built on an **Edge Observer** model. It lives on the main thread but offloads processing to browser idle periods to ensure zero impact on TBT (Total Blocking Time).

### Core Principles
- **Zero Runtime Dependencies**: Single-file IIFE (`pulsar.js`) that directly hooks into native browser APIs.
- **Privacy by Design**: Mandatory PII redaction (Email, CC, JWT, SFCC tokens) performed locally before data ever leaves the device.
- **Main-Thread Efficiency**: Uses `requestIdleCallback` for initialization and debounced batching for delivery.
- **Deterministic Debugging**: No heavy session replay. Instead, it maintains a circular buffer of UI breadcrumbs (clicks, navigation, state changes) to reconstruct the path to failure.

---

## 🛠 Features

### 1. Real User Monitoring (RUM) & Navigation
Automatic capture of Core Web Vitals and route transitions:
- **LCP, INP, CLS, TTFB**: Measured via `PerformanceObserver`.
- **PAGE_VIEW**: Unified stream for initial loads and SPA transitions (PWA Kit/History API).
- **CAMPAIGN_ENTRY**: Precice session attribution for UTM/Ad parameters.

### 2. User Interactions (Engagement)
Granular behavioral signals:
- **SCROLL_DEPTH**: Milestone-based tracking (25/50/75/100%) with rAF throttling.
- **RAGE_CLICK**: Detects UI frustration and broken buttons.
- **TAB_VISIBILITY**: Captures hidden/visible transitions to measure engagement gaps.

### 3. Network & Commerce Actions
Monkey-patches `fetch` and `XHR` to monitor API health and business outcomes:
- **COMMERCE_ACTION**: Automatic tracking for `cart_add`, `cart_remove`, `checkout`, and `search`.
- **API Health**: Captures status codes (5xx, 429s, SLAS timeouts) and latencies.
- **Security**: Mandatory PII redaction and endpoint sanitization.

### 4. Error & Stability
- Catches `onerror`, `unhandledrejection`, and JS crashes.
- **MutationObserver**: Detects "Error UI" selectors rendered to the DOM.
- **Infinite Recursion Guard**: Prevents telemetry loops.

---

## 📦 Repository Structure

```
pulsarjs/
├── packages/
│   ├── sdk/                # Core Observer SDK
│   │   ├── src/
│   │   │   ├── core/       # State, Config, Session, Capture Pipeline
│   │   │   ├── collectors/ # Network, Errors, RUM
│   │   │   ├── integrations/# SFCC Domain Logic
│   │   │   └── utils/      # Sanitizers & Environment
│   │   └── tests/          # Playwright & Vitest suites
│   └── agent/              # The Actor (DEPRECATED)
├── docs/
│   ├── API.md              # Technical Reference
│   └── BACKLOG.md          # Phased Roadmap
└── GEMINI.md               # Engineering Manifesto & Rules
```

---

## 🚀 Integration

### Standard Script Tag
```html
<script src="https://cdn.pulsarjs.com/v1/pulsar.js" async></script>
<script>
  window.Pulsar.init({
    clientId: 'your-tenant-id',
    siteId: 'RefArch',
    storefrontType: 'PWA_KIT', // or 'SFRA' | 'SITEGENESIS'
    debug: false
  });
</script>
```

### Advanced Config
| Option | Description |
|---|---|
| `sampleRate` | Percentage of sessions to track (0.0 to 1.0). |
| `beforeSend` | Async hook to filter/enrich payloads. Return `null` to drop. |
| `endpointFilter` | RegExp to limit which XHR/fetch calls are intercepted. |
| `slowApiThreshold` | Latency (ms) before an API call is flagged. |

---

## ⚖️ Privacy & Compliance

PulsarJS operates as a **Data Processor**.
- **No Persistence**: We do not generate cross-session device identifiers.
- **No PII**: All identifiable data is redacted at the source.
- **Legitimate Interest**: Since we monitor operational reliability and performance (and do not track individuals for marketing/profiling), PulsarJS typically falls under the "Strictly Necessary" category of ePrivacy/GDPR.

---

## 📜 License

© 2026 PulsarJS. BSL 1.1 / Apache 2.0. See [LICENSE](LICENSE) for details.