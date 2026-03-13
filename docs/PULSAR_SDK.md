# CLAUDE.md — PulsarJS SDK

> AI assistant instructions for building PulsarJS: a privacy-first, SFCC-oriented error monitoring and RUM SDK.

---

## Project Identity

**PulsarJS** is a client-side JavaScript SDK targeting Salesforce Commerce Cloud (SFCC) storefronts (PWA Kit, SFRA, and headless). It captures Core Web Vitals, API latencies, client-side crashes, and UI failures, then ships them to a backend ingest pipeline.

The product competes in the space between "too expensive" (Noibu, Quantum Metric) and "not SFCC-aware" (Sentry, Datadog). The differentiator is deep SFCC context (`dwsid`, `dwac_*` cookies, page type inference) combined with a lightweight, privacy-respecting footprint.

**Moat statement:**
> A zero-dependency JavaScript beacon that tracks Core Web Vitals, API latencies, and client-side crashes across your Salesforce Commerce Cloud storefront — without touching your Lighthouse score.

---

## Legal & Compliance Position

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
| Session-level event rows | ✅ Permissible | Pseudonymous — treat with care |
| Stack traces with URLs | ✅ Permissible | Sanitize before storage |
| API latency per endpoint | ✅ Permissible | Core monitoring purpose |
| Core Web Vitals per page type | ✅ Permissible | Core monitoring purpose |
| `dwsid` (SFCC session ID) | ✅ Permissible | Pseudonymous operational identifier |
| Device cohort label | ✅ Permissible | Broad classification only — see Device Signal Strategy |
| `visitorId` / `customerId` | ⚠️ Sensitive | Log only when necessary for debugging; never in aggregate reports |
| IP address | ⚠️ Truncate only | Strip last octet (IPv4) or last 80 bits (IPv6) before storage — full IP is disproportionate |
| Full request/response bodies | ❌ Never | Sanitize PII; do not store raw bodies |
| User name, email, address | ❌ Never | Not necessary for monitoring |
| Raw GPU renderer strings | ❌ Never | Classify into cohort labels only |
| Cross-merchant behavioral profiles | ❌ Never | Violates processor role |

### IP Address Stripping

IP truncation must be enforced at the **network/load balancer layer**, not in application code. This is a technical control — it guarantees no full IP reaches the data warehouse even in the event of a payload mistake. Configure nginx, Cloudflare, or your ingestion proxy to truncate before the request reaches the application.

### Retention

Retention periods must be defined per data type and enforced programmatically:

- Session event rows: 90 days
- Aggregate RUM metrics: 24 months
- Error/crash records: 12 months
- Raw ingest payloads (pre-processing): discard immediately after processing

### Subject Rights

As a processor, PulsarJS fulfills deletion and access requests on merchant instruction. The SDK and ingest pipeline must support cascading deletion by `sessionId` and by `dwsid`.

---

## Device Signal Strategy

WebGL and device capability signals are useful for correlating performance issues with hardware tier. The following rules define what is and is not permitted.

**Permitted:**
- Broad cohort classification using WebGL — `high-gpu`, `mid-gpu`, `low-gpu`, `software-render`, `apple-silicon`
- Each cohort must represent a population of at least tens of thousands of users to avoid quasi-identification
- `navigator.hardwareConcurrency` and `deviceMemory` for capability hints
- `navigator.connection.effectiveType` for network tier

**Not permitted:**
- Raw GPU renderer strings (e.g., `"ANGLE (NVIDIA GeForce RTX 3090)"`) stored at event level
- Full WebGL extension lists
- Hashed combinations of GPU parameters — a hash of identifying data is still identifying data
- Any signal combination that could single out an individual device

```js
// ✅ Correct — cohort label only
function getDeviceCohort() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  if (!gl) return 'no-webgl';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  if (/Apple M[123]/i.test(renderer)) return 'apple-silicon';
  if (/RTX [34]\d{3}/i.test(renderer)) return 'high-nvidia';
  if (/SwiftShader|llvmpipe/i.test(renderer)) return 'software-render';
  if (maxTex >= 16384) return 'high-gpu';
  if (maxTex >= 8192) return 'mid-gpu';
  return 'low-gpu';
}

// ❌ Wrong — raw string stored or transmitted
const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); // never send this
```

`software-render` (SwiftShader / llvmpipe) is also a useful **bot detection signal** — log it as a risk indicator at the transaction level, not as a persistent device profile.

---

## Repository Structure (Suggested)

```
pulsarjs/
├── packages/
│   ├── sdk/                    # Core browser SDK (this document's focus)
│   │   ├── src/
│   │   │   ├── index.js        # Public API surface + IIFE wrapper
│   │   │   ├── scope.js        # Scope class (breadcrumbs, tags, user)
│   │   │   ├── capture.js      # _capture(), queue, flush logic
│   │   │   ├── handlers.js     # onerror, onunhandledrejection, MutationObserver
│   │   │   ├── interceptors.js # fetch + XHR patching
│   │   │   ├── rum.js          # PerformanceObserver, Web Vitals, INP
│   │   │   ├── sfcc.js         # SFCC context extraction (cookies, dw.ac)
│   │   │   ├── sanitizers.js   # PII redaction (must stay zero-dep)
│   │   │   ├── session.js      # Session ID generation, handshake logic
│   │   │   └── config.js       # Config defaults + _validateConfig()
│   │   ├── tests/
│   │   └── package.json
│   ├── ingest/                 # Backend ingest API (Node/Edge)
│   ├── cli/                    # Source map upload tooling
│   └── dashboard/              # React dashboard (future)
├── CLAUDE.md                   # This file
└── README.md
```

---

## Known Issues to Fix (Priority Order)

These are confirmed gaps from code review. Address these before adding new features.

### P0 — Critical

1. **INP (Interaction to Next Paint) missing**
   - FID is deprecated as of March 2024. Replace with INP via `PerformanceObserver` type `event` with `durationThreshold: 40`.
   - Reference: https://web.dev/articles/inp
   - File: `rum.js`

2. **Event loss on queue overflow**
   - Current: `queue.shift()` silently drops oldest event at 50 items.
   - Fix: implement a `_droppedCount` counter, flush it as a synthetic `QUEUE_OVERFLOW` event periodically. Never drop silently.
   - File: `capture.js`

3. **Turnstile is an undeclared dependency**
   - The "zero-dependency" claim breaks if Turnstile is injected at runtime.
   - Decision needed: either (a) document it honestly, or (b) replace with a server-side HMAC token strategy (preferred for enterprise).
   - File: `session.js`

### P1 — High

4. **`beforeSend` must support async**
   - `beforeSend` is the primary consent integration point. Enterprise CMPs (OneTrust, Cookiebot) require async checks before any data leaves the browser. Even though PulsarJS operates under legitimate interest and does not require a consent banner for core functionality, merchants may impose their own consent requirements via this hook.
   - Change signature to: `payload = await config.beforeSend(payload)`
   - Wrap in try/catch, timeout after 2000ms to avoid blocking flush.
   - After `beforeSend` returns, treat the payload as immutable — never mutate it.
   - File: `capture.js`

5. **CSP nonce support for dynamic scripts**
   - Dynamically injected scripts (Turnstile) will be blocked by `script-src` CSP without a nonce.
   - Accept `nonce` in config and apply to any created `<script>` elements.
   - File: `session.js`

6. **Global scope is not isolation-safe**
   - Micro-frontend environments (common in enterprise SFCC) will share globalScope across teams.
   - Add a `createInstance(config)` factory export alongside the default singleton.
   - File: `index.js`

7. **No retry logic on flush failure**
   - Failed `fetch` in `_flush()` is caught and discarded.
   - Implement exponential backoff (2 retries, 500ms / 1500ms) before dropping.
   - File: `capture.js`

### P2 — Medium

8. **Source map upload tooling missing**
   - Without source maps, crash stack traces in production are unreadable.
   - Build a CLI tool (`pulsarjs upload-sourcemaps`) that posts maps to the ingest API.
   - This is a separate package: `packages/cli/`

9. **`sendBeacon` blob type must remain `text/plain`**
   - `text/plain` via `Blob` is the correct deliberate choice. It avoids CORS preflight, which means no OPTIONS request leaking the endpoint URL to intermediaries, lower latency on page exit, and no CORS server config requirement in restrictive enterprise CSP environments common in SFCC.
   - Do NOT change to `application/json`. Ensure the ingest endpoint parses the body correctly regardless of content-type header.
   - File: `capture.js`

10. **MutationObserver on `subtree: true` is a performance risk**
    - Broad subtree observation on `document.body` causes layout queries on every DOM mutation.
    - Debounce the observer callback with a 100ms RAF-based debounce.
    - File: `handlers.js`

---

## Architecture Principles

When writing or reviewing code for this project, apply these rules:

**1. Truly zero runtime dependencies**
No `import` of external packages in the final browser bundle. Sanitizers, utilities, and helpers must be self-contained. Build-time devDependencies are fine.

**2. Never mutate the payload after `beforeSend`**
The `beforeSend` hook is a contract with the developer. After it runs, treat the payload as immutable.

**3. Fail silently in production, loudly in debug mode**
Every catch block must gate on `config.debug` before logging. The SDK must never throw to the host page.

**4. Restore everything on `disable()`**
Every monkey-patched global (`fetch`, `XHR`, `onerror`, etc.) must be restored to its exact original. Test this with a teardown assertion.

**5. PII must be redacted before anything enters the queue**
`Sanitizers.redactPII()` must be called at capture time, not at flush time. Assume the queue may be inspected.

**6. Session ID must use `crypto.randomUUID()` or `crypto.getRandomValues()`**
Never fall back to `Math.random()`. If crypto is unavailable, disable the SDK with a warning.

**7. IP address must never reach persistent storage**
This is enforced at the ingest layer (load balancer / proxy), not in the SDK. However, the SDK must not include IP addresses in any payload field it constructs. The ingest contract must document the IP truncation requirement explicitly so infrastructure teams cannot miss it.

**8. SFCC context fields are operational identifiers — handle with proportionality**
`dwsid` is pseudonymous. `visitorId` and `customerId` are sensitive. Include them only when operationally necessary (e.g., linking an error to a specific session for debugging). Never include them in aggregate metrics, dashboards, or any output visible to parties other than the merchant.

**9. Device signals must be cohort labels, never raw fingerprint data**
See Device Signal Strategy above. Raw GPU strings, extension lists, and hashed device combinations must never appear in any payload.

---

## Web Vitals Reference

| Metric | Good | Needs Improvement | Poor | Observer Type |
|--------|------|-------------------|------|---------------|
| LCP | ≤2.5s | ≤4.0s | >4.0s | `largest-contentful-paint` |
| INP | ≤200ms | ≤500ms | >500ms | `event` (durationThreshold: 40) |
| CLS | ≤0.1 | ≤0.25 | >0.25 | `layout-shift` |
| TTFB | ≤800ms | ≤1800ms | >1800ms | `navigation` |
| FCP | ≤1.8s | ≤3.0s | >3.0s | `paint` |

> FID is **deprecated** as of March 2024. Do not collect or report it.

---

## SFCC Context Reference

| Data Point | Source | Privacy Classification | Notes |
|---|---|---|---|
| `dwsid` | Cookie `dwsid` | Pseudonymous | Session ID, rotate on checkout. Include in error context only. |
| `visitorId` | Cookie `dwac_*`, field 0 | Sensitive | `__ANNONYMOUS__` means guest — treat as null |
| `customerId` | Cookie `dwac_*`, field 2 | Sensitive | `__ANNONYMOUS__` means guest — treat as null. Log only when essential for debugging. |
| `pageType` | URL path inference | Non-personal | Checkout, Cart, PDP, PLP, Search, Home |
| `category` | `window.dw.ac._category` | Non-personal | Only on SFRA, not PWA Kit |
| `boomrSession` | `window.BOOMR.session.id` | Pseudonymous | Present if Salesforce Commerce Analytics enabled |

**Rules for SFCC context extraction:**
- Never throw if `window.dw` is undefined
- Treat `__ANNONYMOUS__` as null, not a real value
- Cookie parsing must handle URI-encoded values
- `visitorId` and `customerId` must never appear in aggregate metrics or dashboard displays — only in individual error detail views accessible to the merchant
- `dwsid` and `dwac_*` cookie values must be listed as redaction targets in `Sanitizers` — they will appear in captured URLs and request headers

---

## Sanitizers Contract

`Sanitizers.redactPII(str: string): string` must handle at minimum:

- Credit card numbers (Luhn-detectable patterns)
- Email addresses
- US/CA phone numbers
- IPv4 addresses in query strings
- `password=`, `token=`, `api_key=`, `apikey=`, `authorization=` key-value patterns (case-insensitive)
- JWT tokens (`eyJ...` patterns)
- `dwsid=` and `dwac_` cookie/query string patterns
- Raw WebGL renderer strings matching GPU model patterns (classify, do not pass through)
- Precise timestamps in error context — bucket to nearest minute

Return value must always be a string. Never throw. Input of non-string type should return `'[redacted]'`.

---

## Testing Expectations

Every module must have unit tests. Use the following patterns:

```js
// Interceptor test pattern — always restore after test
let originalFetch;
beforeEach(() => { originalFetch = window.fetch; });
afterEach(() => { window.fetch = originalFetch; Pulsar.disable(); });
```

**Required test coverage:**
- `sanitizers.js` — 100% line coverage, use adversarial PII strings including `dwsid`, JWT, and GPU renderer strings
- `capture.js` — test queue overflow, beforeSend drop, beforeSend mutation, async beforeSend, 2000ms timeout behavior
- `session.js` — test crypto fallback path, handshake failure path
- `rum.js` — mock PerformanceObserver, assert INP threshold boundary values, assert FID is not collected
- `handlers.js` — test onerror, unhandledrejection, MutationObserver debounce
- `sfcc.js` — test `__ANNONYMOUS__` null handling, URI-encoded cookie parsing, undefined `window.dw` safety

---

## Config Schema (Canonical)

```js
{
  clientId: String,            // Required. Your PulsarJS project key.
  endpoint: String,            // Default: 'https://api.pulsarjs.io/v1/ingest'
  sessionEndpoint: String,     // Default: 'https://api.pulsarjs.io/v1/session'
  siteId: String,              // Default: 'unknown'. Human label for the storefront.
  storefrontType: Enum,        // 'PWA_KIT' | 'SFRA' | 'HEADLESS'
  sampleRate: Number,          // 0.0–1.0. Default: 1.0
  enabled: Boolean,            // Default: false. Must be explicitly opted in.
  endpointFilter: RegExp,      // API routes to monitor. Default covers OCAPI + SCAPI.
  criticalSelectors: String[], // CSS selectors that indicate UI failure when rendered.
  beforeSend: AsyncFunction,   // Async. Mutate payload or return null to drop. Primary consent/CMP integration point. Timeout: 2000ms.
  maxBreadcrumbs: Number,      // Default: 100
  slowApiThreshold: Number,    // ms before API call is flagged as latency. Default: 1000
  nonce: String,               // CSP nonce for injected scripts.
  debug: Boolean               // Default: false. Enables console output.
}
```

### `beforeSend` Usage Note

`beforeSend` is the primary integration point for merchant-side consent requirements. Even though PulsarJS operates under legitimate interest and does not require a banner for its own legal basis, individual merchants may have stricter internal policies or regional requirements. This hook is how they enforce them.

Example — merchant integrating with OneTrust:

```js
Pulsar.init({
  clientId: 'xyz',
  beforeSend: async (payload) => {
    const consent = await OneTrust.getConsentStatus('analytics');
    if (!consent) return null; // drop the payload
    return payload;
  }
});
```

After `beforeSend` resolves, the payload must not be mutated by any internal code.

---

## What Claude Should NOT Do

**Code quality:**
- Do not add npm runtime dependencies to the SDK bundle
- Do not use `Math.random()` for any ID generation
- Do not log anything to the console unless `config.debug === true`
- Do not catch errors silently without incrementing a diagnostic counter
- Do not write `any` TypeScript types — use strict types or JSDoc
- Do not use `document.write()` or synchronous script injection
- Do not expand the public API surface without updating this file
- Do not use `localStorage` or `sessionStorage` for queue persistence (privacy + ITP issues)

**Privacy & compliance:**
- Do not include `dwsid`, `visitorId`, or `customerId` in aggregate payloads or metrics
- Do not store or transmit raw WebGL renderer strings — classify into cohort labels only
- Do not generate persistent cross-session device identifiers of any kind
- Do not store full IP addresses — truncation is enforced at the ingest layer
- Do not repurpose event data across merchants or for any purpose beyond serving the merchant that collected it
- Do not store raw PII in the queue, even temporarily — redact at capture time

---

## Useful References

- [web-vitals.js source](https://github.com/GoogleChrome/web-vitals) — reference implementation for INP attribution
- [Sentry Browser SDK architecture](https://github.com/getsentry/sentry-javascript) — Hub/Client isolation pattern
- [SFCC OCAPI docs](https://documentation.b2c.commercecloud.salesforce.com/DOC2/topic/com.demandware.dochelp/OCAPI/current/usage/OpenCommerceAPI.html) — endpoint patterns for `endpointFilter`
- [Cloudflare Turnstile docs](https://developers.cloudflare.com/turnstile/) — if keeping Turnstile, document the dependency
- [INP spec](https://web.dev/articles/inp) — authoritative INP guidance
- [GDPR Article 6 — Legitimate Interest](https://gdpr-info.eu/art-6-gdpr/) — legal basis reference
- [Quebec Law 25 — CAI guidance](https://www.cai.gouv.qc.ca/en/) — Quebec privacy authority
- [LGPD Article 7](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) — Brazilian legal bases including legitimate interest