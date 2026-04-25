<!-- DOCS: H2 -->
# PulsarJS CLAUDE.md

## Repository Structure & Module Map
```
pulsarjs/
├── packages/
│   └── sdk/                         # Core browser SDK
│       ├── src/
│       │   ├── index.js             # Public API surface + IIFE wrapper + createInstance factory
│       │   ├── core/
│       │   │   ├── capture.js       # Capture pipeline: queue, dedup, debounced flush, retry, beforeSend
│       │   │   ├── config.js        # Config defaults + validateConfig()
│       │   │   ├── scope.js         # Scope class (breadcrumbs, tags, user)
│       │   │   └── session.js       # Session ID generation (crypto.randomUUID only)
│       │   ├── collectors/
│       │   │   ├── errors.js        # onerror, onunhandledrejection, MutationObserver (debounced)
│       │   │   ├── network.js       # fetch + XHR interceptors, COMMERCE_ACTION detection
│       │   │   ├── rum.js           # PerformanceObserver: LCP, INP, CLS, TTFB
│       │   │   ├── navigation.js    # PAGE_VIEW, SPA routing, CAMPAIGN_ENTRY, TAB_VISIBILITY
│       │   │   └── interactions.js  # SCROLL_DEPTH milestones, RAGE_CLICK detection
│       │   ├── providers/
│       │   │   └── sfcc.js          # SFCC context extraction (dwsid, dwac_*, page type)
│       │   └── utils/
│       │       ├── sanitizers.js    # PII redaction, URL sanitization, API endpoint sanitization
│       │       └── environment.js   # Screen, timezone, time_since_load, campaign extraction
│       ├── tests/
│       └── package.json
├── docs/                            # Internal and public documentation
└── README.md
```

## Known Issues (Security & Code-Health)
* **PUL-060**: Landing Page Content Structure
* **PUL-042**: Commerce Intent Edge Hints
* **PUL-052**: E2E Playwright Tests
* **PUL-053**: PWA Kit Validation
* **PUL-002**: PWAKit Integration Testing
* **PUL-054**: Shopify Store Validation
* **PUL-041**: Agentforce Commerce Provider
* **PUL-061**: Live Demo
* **PUL-062**: Console Mode QA Docs

### Recently Fixed Security/Performance Issues
* M1: Stack trace sanitization
* C2: PII reaching sendBeacon without sanitize()
* H1/H2/H3: Email sanitization, pattern isolation, ReDoS
* M3: Event listener leak in rum.js
* P2: Debounce synchronous storage writes
* P6: Cache shared envelope fields + lazy-init env
* P9: Redundant timestamp capture on fetch
