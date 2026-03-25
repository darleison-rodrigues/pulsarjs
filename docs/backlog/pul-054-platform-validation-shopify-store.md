# [PUL-054] Platform Validation — Shopify Store

**Status**: 🔴 Open
**Severity**: Medium — validates provider architecture on a real non-SFCC store.
**Depends on**: PUL-040 (open), PUL-052 (open)

**Goal**: Install Pulsar on a Shopify development store via `theme.liquid` snippet. Validate the generic/Shopify provider against real Storefront API calls.

**Approach**:
- Shopify Partner account → development store (free)
- Add Pulsar via `theme.liquid`
- Verify: endpoint filter catches `/cart/add.js`, `/cart/change.js`
- Verify: page type inference for `/products/`, `/collections/`, `/cart`, `/checkouts/`
- Extract beacon payloads via DevTools or Playwright

---
