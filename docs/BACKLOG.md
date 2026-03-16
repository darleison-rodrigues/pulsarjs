# PulsarJS Product Backlog

> **Scope**: Core Deterministic Pipeline (Phase 1 MVP)
> **Prefix**: `PUL-XXX`
> **Branch Convention**: `feature/pul-XXX-short-description`

---

### [PUL-002] Local PWAKit Integration Testing
**Status**: 🔴 Open
**Branch**: `feature/pul-002-pwakit-integration`
**Severity**: High — Required for system validation.

**The Goal**: Integrate `pulsar.js` into a local PWAKit storefront. Simulate SFCC basket errors, SCAPI timeouts, and JS crashes. Verify: Ingestion API catches errors → Rule Engine classifies → alert fires.


---

### [PUL-013] Feature: CSP Nonce Support
**Status**: 🔴 Open
**Branch**: `feature/pul-013-csp-nonce`
**Severity**: High — enterprise SFCC sites with strict `script-src` CSP.

**The Goal**: Accept `nonce` in config, apply to dynamically injected `<script>` elements.

---

### [PUL-024] Source Map CLI
**Status**: 🟡 Evaluate — TBD if needed for Phase 1 merchants.
**The Goal**: `pulsarjs upload-sourcemaps` for CI/CD. Tie maps to `release_id`.

---

### [PUL-027] Platform-Agnostic Commerce Action Detection
**Status**: 🔴 Open
**Severity**: High — required for non-SFCC adoption.

**The Goal**: Replace hardcoded SFCC SCAPI patterns in `network.js` and `config.js` with configurable mappings. SFCC patterns remain the default.

**Changes**:
1. `config.js` — Add `commerceActions` config option (array of `{action, method, pattern}` objects). Default: current SFCC SCAPI patterns.
2. `config.js` — Add `pageTypes` config option (array of `[regex, typeName]` tuples with optional capture group for product ref extraction). Default: current SFCC/PWAKit patterns.
3. `network.js` — `detectCommerceAction()` reads from `config.commerceActions` instead of hardcoded `COMMERCE_ACTIONS`.
4. `navigation.js` — `inferPageType()` reads from `config.pageTypes` instead of hardcoded `PAGE_TYPES`.
5. `sfcc.js` — Remove duplicated page type inference, use shared `inferPageType`.

**Acceptance Criteria**:
- Default config (no `commerceActions`/`pageTypes` provided) behaves identically to current SDK.
- Shopify example: `commerceActions: [{action:'cart_add', method:'POST', pattern:/\/cart\/add/i}]` works.
- `pageTypes` regex with capture group extracts product ref: `[/\/p\/([^/?]+)/i, 'PDP']` → `product_ref: "blue-sneakers-123"`.
- Commerce action vocabulary stays fixed: `cart_add`, `cart_remove`, `cart_update`, `checkout`, `search`.

---

### [PUL-028] SDK Edge Hints (caused_by + edge_hint)
**Status**: 🔴 Open
**Branch**: `feature/pul-028-edge-hints`
**Severity**: High — enables deterministic graph edges instead of server-side heuristics.
**Depends on**: PUL-026

**The Goal**: Add `caused_by` and `edge_hint` fields to events where the SDK has deterministic causal knowledge.

**Edges to implement**:
1. `blocked_by` — In fetch/XHR interceptor: when a commerce action's API call returns non-2xx, the `API_FAILURE` event references the `COMMERCE_ACTION` event_id.
2. `frustrated_by` — In rage click detector: store `lastErrorEventId` on state, attach to `RAGE_CLICK`.
3. `abandoned_at` — In visibility handler: if `TAB_VISIBILITY(hidden)` fires and `lastCommerceEventId` exists with no subsequent checkout, attach reference.
4. `caused` — In campaign entry: attach reference to the first `PAGE_VIEW` event_id.
5. `degraded_by` — In fetch/XHR interceptor: when commerce action's API call succeeds but exceeds `slowApiThreshold`, `API_LATENCY` references the `COMMERCE_ACTION`.
6. `retried_after` — Track `lastFailedCommerceAction` per action type. If same action fires again, hint `retried_after`.

**Requires**: `state.lastErrorEventId`, `state.lastCommerceEventId`, `state.lastFailedCommerceAction` tracking on the shared state object.

**Acceptance Criteria**:
- `caused_by` always references a lower seq number (DAG property).
- `edge_hint` is one of: `blocked_by`, `frustrated_by`, `abandoned_at`, `caused`, `degraded_by`, `retried_after`.
- Events without causal links omit both fields (not `null`).

---

### [PUL-029] Flush Envelope: Session Context + Manifest
**Status**: 🔴 Open
**Branch**: `feature/pul-029-envelope-manifest`
**Severity**: High — enables server-side routing and cold storage mining.
**Depends on**: PUL-026, PUL-027

**The Goal**: Enrich the flush envelope with `session` context and `manifest` predicates so the ingest pipeline can route before parsing events.

**Changes**:
1. `capture.js` flush — Add `session` block: `session_id`, `device_cohort`, `seq_range`, `started_at`, `page_count`, `entry` (page_type, referrer_type, campaign_source).
2. `capture.js` flush — Add `manifest` block: computed from queue contents at flush time.
3. Track `sessionStartedAt`, `entryPageType`, `entryReferrerType`, `pageCount`, `productRefs[]` on state.
4. Manifest predicates: `has_errors`, `has_commerce`, `has_frustration`, `has_abandonment`, `has_degradation`, `has_product`, `commerce_actions`, `product_refs`, `max_severity`, `page_types_visited`.
5. Rename envelope `timestamp` → `flushed_at` for clarity.

**Acceptance Criteria**:
- `session.seq_range` accurately reflects the batch, not the full session.
- `manifest.has_product` is true only when PDP views with extractable product refs exist.
- `product_refs` are URL slugs, not full URLs. Sanitized, no query params.
- Manifest computation does not iterate events twice (single pass).

---

### [PUL-030] Product View Tracking for Cold Storage Mining
**Status**: 🔴 Open
**Branch**: `feature/pul-030-product-views`
**Severity**: Medium — enables future recommendation system from owned data.
**Depends on**: PUL-027

**The Goal**: Extract product identifiers from PDP page views so cold storage can be mined for co-occurrence patterns (collaborative filtering).

**Changes**:
1. `navigation.js` `inferPageType()` — When `pageTypes` config uses a regex with a capture group, extract the matched group as `product_ref`.
2. `PAGE_VIEW` events on PDP pages include `metadata.product_ref: "blue-sneakers-123"`.
3. State tracks `productRefs[]` for manifest inclusion.
4. Default SFCC pattern: `/\/p\/([^/?]+)/i` extracts slug after `/p/`.

**Acceptance Criteria**:
- `product_ref` is a URL slug, not a full URL or SKU.
- Pages without capture groups in their regex return `null` product_ref.
- `product_refs` in manifest are deduplicated (same product viewed twice = one entry).
- No PII in product refs (validated by sanitizer).

---

## 🗑️ Backlog (No Timeline)


