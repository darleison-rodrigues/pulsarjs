# Testing Expectations

Every module must have unit tests. Use the following patterns:

```js
// Interceptor test pattern — always restore after test
let originalFetch;
beforeEach(() => { originalFetch = window.fetch; });
afterEach(() => { window.fetch = originalFetch; Pulsar.disable(); });
```

**Required test coverage:**
- `sanitizers.js` — 100% line coverage, use adversarial PII strings including `dwsid`, JWT, and GPU renderer strings
- `capture.js` — test queue overflow, beforeSend drop, beforeSend mutation, async beforeSend, 2000ms timeout behavior, debounced flush timing, retry logic, FLUSH_FAILED emission
- `session.js` — test crypto.randomUUID path, crypto.getRandomValues fallback, null return on missing crypto
- `rum.js` — mock PerformanceObserver, assert INP threshold boundary values, assert FID is only used as fallback
- `errors.js` — test onerror, unhandledrejection, MutationObserver debounce
- `sfcc.js` — test `__ANNONYMOUS__` null handling, URI-encoded cookie parsing, undefined `window.dw` safety
- `navigation.js` — test pushState/replaceState patching, campaign entry with all click ID types, classifyReferrer logic
- `interactions.js` — test scroll milestone firing, rage click threshold, milestone reset on route change
- `network.js` — test COMMERCE_ACTION detection for all SCAPI patterns, API_FAILURE emission, API_LATENCY threshold
