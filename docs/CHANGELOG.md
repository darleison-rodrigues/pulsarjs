# What Changed: PulsarJS Causal Event Stream Evolution

PulsarJS has transitioned from a simple error/RUM observer to a **causal event stream** data source. This shift focuses on high-fidelity user journeys and commerce signals while removing non-observability features.

---

## 1. Agent — Killed
- **Status**: Deprecated / Gutted.
- **File**: `packages/agent/src/index.js`
- **Change**: Reduced from 156 lines of promotional/banner logic to a simple deprecation notice. Promotional interventions are no longer in scope for PulsarJS.

## 2. New Event Collectors (Event Sources)

### `collectors/interactions.js` (New)
Captures granular user engagement signals:
- **Scroll Depth**: Fires `SCROLL_DEPTH` events at 25%, 50%, 75%, and 100% milestones. Processes are rAF-throttled with passive listeners.
- **Rage-Click Detection**: Identifies frustration signals (default: 3 clicks within 1000ms on the same element).
- **Persistence**: Milestones reset on SPA navigation to ensure fresh tracking per route.

### `collectors/navigation.js` (New)
The backbone of the Event Graph:
- **Page Views**: Unified `PAGE_VIEW` events for initial load and SPA transitions (History API patching).
- **Campaign Entry**: Captures `CAMPAIGN_ENTRY` precisely once per session when UTM or advertising parameters are present.
- **Visibility Tracking**: `TAB_VISIBILITY` events capture `hidden` and `visible` transitions, revealing user focus gaps.
- **Schema Improvements**: All URLs are sanitized through `Sanitizers.sanitizeUrl()`.

## 3. Network — Commerce Actions
The `collectors/network.js` module now maps SCAPI/OCAPI calls to meaningful commerce events:
- **Commerce Actions**: Automatic `COMMERCE_ACTION` events for:
  - `cart_add`: POST `/baskets/*/items`
  - `cart_update`: PATCH `/baskets/`
  - `cart_remove`: DELETE `/baskets/*/items`
  - `checkout`: POST `/orders`
  - `search`: GET `/product-search`
- **Security**: All API endpoints are now sanitized via `Sanitizers.sanitizeApiEndpoint()` to remove IDs and Basket/Order references.

## 4. Capture Pipeline — Node Identity
- **Event Identity**: Every event now carries a unique `event_id` in the format `{session_id}:{seq}`.
- **Unified Schema**: All internal fields transitioned from `error_type` to `event_type` to reflect the broader event scope.
- **Relational Integrity**: The server can now reconstruct exact temporal "edges" (graph relationships) using the monotonic sequence ID.

## 5. Configuration Defaults
New levers added to `core/config.js`:
- `rageClickThreshold`: 3
- `rageClickWindow`: 1000ms
- `scrollDepthMilestones`: [25, 50, 75, 100]

## 6. Campaign Attribution — Click ID Expansion
The `CAMPAIGN_ENTRY` event now captures 16 attribution parameters (up from 8), covering the full paid acquisition ecosystem:
- **Added**: `gbraid`, `wbraid` (Google iOS privacy), `ttclid` (TikTok), `twclid` (X/Twitter), `li_fat_id` (LinkedIn), `pin_unauth` (Pinterest), `sccid` (Snapchat), `dclid` (Google DV360), `irclickid` (Impact Radius), `aff_id`, `clickid` (generic affiliate)
- **Existing**: `utm_*`, `gclid`, `fbclid`, `msclkid`
- The server maps raw params to a **channel taxonomy** (channel → platform → product → intent) for causal stream enrichment.

## 7. Cleanup & Teardown
- **API Cleanup**: Removed `Pulsar.push()` (which was agent-only).
- **DNT Removal**: Removed inconsistent "Do Not Track" checks to prioritize standard consent-based monitoring.
- **Safe Teardown**: Full listener removal for navigation and interaction collectors on `disable()`.

---

## Example Causal Event Stream
A typical commerce session now produces a reconstructible causal chain:

```
CAMPAIGN_ENTRY(utm_source=google)  ──→  PAGE_VIEW(Home)  ──→  SCROLL_DEPTH(50%)
                                                                        │
                                           PAGE_VIEW(PLP)  ←───────────┘
                                                │
                                           PAGE_VIEW(PDP)  ──→  SCROLL_DEPTH(75%)
                                                │
                                      COMMERCE_ACTION(cart_add)
                                                │
                                           PAGE_VIEW(Cart)  ──→  PAGE_VIEW(Checkout)
                                                                        │
                                                                API_FAILURE(500)
                                                                        │
                                                                RAGE_CLICK(#place-order)
                                                                        │
                                                                TAB_VISIBILITY(hidden)
```
