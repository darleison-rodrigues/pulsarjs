# Repository Structure

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
