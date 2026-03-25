# [PUL-001] Commerce Context Builder

**Status**: Draft — Revised after architectural review

**Goal**:
Optimize and standardize the commerce context extraction from platform providers (`packages/sdk/src/providers`). The providers currently capture window objects without a strict output contract, causing platform-specific fragmentation and PII leaks (`customerId`, `boomrSession`). We will enforce a universal `CommerceContext` schema using a two-layer strategy: synchronous window objects for T=0 environment context, and an async `dataLayer` interceptor for dynamic commerce intent signals.

---

## Architectural Review & Design Rationale

### Why Two Layers?

**Layer 1 — Synchronous Window Objects (T=0 environment context)**
`window.Shopify`, `window.dw.ac` are available at parse time. They guarantee immediate payload completeness for the first `PAGE_VIEW` and causal edge stitching. These carry environment data (locale, currency, platform version, pageType) that dataLayer often omits.

**Layer 2 — Async dataLayer Interceptor (post-T=0 commerce intent)**
Monkey-patch `window.dataLayer.push` (same pattern as fetch/XHR interception) to capture GA4 Enhanced Ecommerce events (`view_item`, `add_to_cart`, `purchase`) as they fire. This provides dynamic, platform-agnostic commerce signals that window objects cannot deliver — cart mutations, product interactions, search queries — without writing per-platform code.

### Why dataLayer Belongs in V1

The original counter-argument rejected dataLayer for V1 on three grounds. Two hold; one was invalidated:

1. **Race conditions (VALID, addressed):** dataLayer.push is async and merchant-controlled. It cannot replace window objects for T=0 context. **Resolution:** dataLayer is a secondary enrichment layer, not a replacement. Window objects stamp `PAGE_VIEW` at T=0. dataLayer enriches subsequent events as signals arrive.

2. **Premature abstraction (VALID for full GA4 parser, NOT for basic intercept):** A fault-tolerant GA4 interceptor with full event taxonomy is V2 scope. But a minimal intercept of 3-4 event types (`view_item`, `add_to_cart`, `purchase`, `search`) with an allowlisted field map is ~40 lines and directly useful now.

3. **"We're not an ad tracker" / Consent (INVALIDATED by PUL-003):** PUL-003 explicitly captures marketing click IDs (`gclid`, `fbclid`, `ttclid`, `li_fat_id`, etc.) for attribution. PulsarJS already operates in the attribution space. The dataLayer carries the same class of signals — commerce intent events that merchants already normalized for GA4. Refusing dataLayer while harvesting click IDs is an inconsistent position. Both are ephemeral attribution signals; both belong.

### Consent Position (Unchanged)

Per `GEMINI.md`: PulsarJS operates as a Data Processor under Legitimate Interest for system monitoring. A consent banner is not required for anonymous telemetry with strict data minimization. We strip PII at the SDK edge — we do not condition telemetry on CMP state. This is not scope for PUL-001.

---

## Proposed Changes

### 1. Define Universal CommerceContext Contract
**Location:** `packages/sdk/src/providers/provider.js`

Define the strict typed schema all providers must return. No platform-specific keys pass through.

```javascript
/**
 * @typedef {Object} CommerceContext
 * @property {string} [pageType]     - 'PDP', 'PLP', 'Search', 'Cart', 'Home', 'Checkout'
 * @property {string} [currency]     - ISO 4217 code, e.g. 'USD'
 * @property {string} [locale]       - BCP 47, e.g. 'en-US'
 * @property {string} [productRef]   - Product identifier (no PII)
 * @property {string} [categoryRef]  - Category/Collection identifier
 * @property {string} [searchQuery]  - Search term
 */
```

Add a `sanitizeContext(raw)` function that allowlists only these keys and drops everything else. All providers call this before returning.

### 2. Lock Down SFCC Provider
**Location:** `packages/sdk/src/providers/sfcc.js`

- Map `window.dw.ac._category` → `categoryRef`
- **Remove** `boomrSession` extraction (cross-session identifier, violates privacy architecture)
- **Remove** `evergageActive` detection (tracking other trackers is out of scope)
- Return through `sanitizeContext()`

### 3. Lock Down Shopify Provider
**Location:** `packages/sdk/src/providers/shopify.js`

- Map `window.ShopifyAnalytics.meta.page.pageType` → `pageType`
- Map `window.Shopify.locale` → `locale`, `window.Shopify.currency.active` → `currency`
- **CRITICAL: Remove `customerId` extraction** — explicit PII violation
- **Remove `themeName`** — UI noise, no analytical value
- Keep `themeId` only if it maps to a CommerceContext field (it doesn't — drop it)
- Return through `sanitizeContext()`

### 4. Add dataLayer Interceptor (Async Enrichment)
**Location:** New file `packages/sdk/src/collectors/datalayer.js`

Minimal intercept — not a full GA4 parser. Patch `dataLayer.push`, match against an allowlist of 4 event types, extract allowlisted fields only:

| dataLayer Event | CommerceContext Fields Updated |
|---|---|
| `view_item` | `productRef`, `categoryRef`, `currency` |
| `add_to_cart` | `productRef`, `currency` |
| `purchase` | `currency` (transaction value is analytics, not PII) |
| `search` | `searchQuery` |

Design constraints:
- Never block or delay event emission waiting for dataLayer
- Enrichment is additive: if window objects already populated a field, dataLayer does not overwrite
- All extracted values pass through `sanitizeContext()`

**Critical: The `purchase` event closes the Markov model.**
PulsarJS models user intent as a six-state absorbing Markov chain (see "Causal Attribution Framework" below). The conversion state (S₅) currently has no SDK-observable signal — the SDK detects `COMMERCE_ACTION(checkout)` (S₄) but never observes the order confirmation. The dataLayer `purchase` event is the only platform-agnostic way to observe S₅ without parsing platform-specific order confirmation pages. Without it, the intent model absorbs into a state the server never sees, making funnel completion inference unreliable.

### 5. Remove Legacy Integration Shim
**Location:** `packages/sdk/src/integrations/sfcc.js`

Delete entirely. The deprecated `extractPlatformContext()` bypasses the new strict contract and creates a circumvention path.

---

## Verification Plan

**Automated Tests:**
- Run `npx vitest` — existing unit tests must pass with no regressions
- Add tests to verify `sanitizeContext()` strips unknown keys
- Add tests for each provider confirming only `CommerceContext` keys appear in output
- Add tests for dataLayer interceptor: mock `dataLayer.push` with GA4 events, verify correct field mapping and allowlist enforcement
- Negative tests: verify `customerId`, `boomrSession`, `evergageActive`, `themeName` never appear in any provider output

**Integration Tests:**
- Verify `PAGE_VIEW` at T=0 contains `pageType` from synchronous window objects (no dependency on dataLayer timing)
- Verify subsequent events are enriched with dataLayer signals when available
- Verify payloads contain zero PII under all provider configurations
