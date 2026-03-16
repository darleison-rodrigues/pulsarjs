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

### [PUL-003] Feature: INP Web Vitals
**Status**: ✅ Built (verify)
**Branch**: `feature/pul-003-inp-support`
**Severity**: Critical — FID deprecated March 2024.

**The Goal**: Verify INP via `PerformanceObserver` type `event` with `durationThreshold: 40` is working correctly in the SDK.

> **Note**: Already implemented in `sentinel.js`. This item is verification only.

---

### [PUL-004] Feature: Guaranteed Delivery via sendBeacon
**Status**: ✅ Built (verify)
**Branch**: `feature/pul-004-sendbeacon-delivery`
**Severity**: Critical — payloads fail on tab close without this.

**The Goal**: Verify `sendBeacon` + `fetch(..., {keepalive: true})` fallback path works reliably.

> **Note**: Already implemented in `sentinel.js`. This item is verification only.

---

### [PUL-005] Feature: XHR Interception
**Status**: ✅ Built (verify)
**Branch**: `feature/pul-005-xhr-interceptor`
**Severity**: High — legacy SFCC widgets use XHR, not fetch.

**The Goal**: Verify `XMLHttpRequest.prototype.open/send` interception captures non-2xx responses and timeouts.

> **Note**: Already implemented in `sentinel.js`. This item is verification only.

---

### [PUL-006] Branding Rename: SentinelKit → PulsarJS
**Status**: ✅ Done
**Branch**: `feature/pul-006-rebrand`
**Severity**: High — public-facing consistency.

**The Goal**: Rename all references in code and infrastructure:
- SDK: `sentinel.js` → build outputs as `pulsar.js`
- API: `Sentinel` references → `Pulsar`
- Wrangler: worker name, queue names, D1 name, R2 bucket
- Headers: `X-Sentinel-Client-Id` → `X-Pulsar-Client-Id`
- Domain routes: `mosaique.ltd` → `pulsarjs.com`


### [PUL-010] Feature: Async beforeSend & CMP Support
**Status**: ✅ Built
**Branch**: `feature/pul-010-async-beforesend`
**Severity**: High — OneTrust/Cookiebot compliance.

**The Goal**: `await config.beforeSend(payload)` with 2000ms circuit breaker. Drop payload on timeout (consent-first default). Verified in `capture.js`.

---

### [PUL-011] Feature: Deterministic Queue Overflow Logging
**Status**: ✅ Built
**Branch**: `feature/pul-011-queue-overflow`
**Severity**: High — silent data drops violate observability principle.

**The Goal**: `_droppedCount` counter + `QUEUE_OVERFLOW` synthetic event. Never drop silently. Verified in `capture.js`.

---

### [PUL-012] Feature: Resilient Flush (Retries)
**Status**: ✅ Built
**Branch**: `feature/pul-012-flush-retries`
**Severity**: High — handles transient network failures.

**The Goal**: Exponential backoff (2 retries: 500ms / 1500ms) before dropping. Emit `FLUSH_FAILED` synthetic event on total failure. Verified in `capture.js`.

---

### [PUL-013] Feature: CSP Nonce Support
**Status**: 🔴 Open
**Branch**: `feature/pul-013-csp-nonce`
**Severity**: High — enterprise SFCC sites with strict `script-src` CSP.

**The Goal**: Accept `nonce` in config, apply to dynamically injected `<script>` elements.

---

### [PUL-014] Turnstile → Origin Auth Strategy
**Status**: ✅ Done (Pivoted)
**Branch**: `feature/pul-014-origin-auth`
**Severity**: High — security and zero-dep alignment.

**The Goal**: Replace client-side HMAC/Turnstile with **Origin-based validation** and **Client ID** headers. Documented in `API.md` and server architecture.

---

### [PUL-022] Micro-Frontend Scope Isolation
**Status**: ✅ Built
**The Goal**: `createInstance({config})` factory for multi-team headless storefronts. Verified in `index.js`.

---

### [PUL-023] D1 → ClickHouse/BigQuery Migration
**Status**: 🔴 Open — when D1 hits volume limits.
**The Goal**: Production-grade analytics storage. Must support SQL queries for merchant self-service.

---

### [PUL-024] Source Map CLI
**Status**: 🟡 Evaluate — TBD if needed for Phase 1 merchants.
**The Goal**: `pulsarjs upload-sourcemaps` for CI/CD. Tie maps to `release_id`.

---

### [PUL-025] Normalize Temporal Formats Across SDK Payload
**Status**: ✅ Done
**Branch**: `feature/pul-025-temporal-normalization`
**Severity**: Medium — payload contract inconsistency, not a runtime bug.

**The Goal**: Enforce a single temporal contract for all transmitted data:
- **Absolute wall-clock times** → ISO 8601 UTC strings (already done for `timestamp` fields).
- **Relative durations** → integer milliseconds with `_ms` suffix on the field name.
- **Breadcrumb timestamps** (scope.js `Date.now()`) → convert to ISO 8601 at serialization time if included in transmitted payload; keep epoch ms internally.

**Specific fixes**:
1. `environment.js:11` — rename `time_since_load` → `time_since_load_ms`, use `Math.round(performance.now())`.
2. `environment.js:13` — replace `timezone_offset` (numeric minute offset) with `timezone` using `Intl.DateTimeFormat().resolvedOptions().timeZone` (IANA string).
3. `network.js` — `duration_ms` values from `performance.now() - startTime` should be `Math.round()`'d (currently float).
4. Audit `scope.js` breadcrumb `timestamp: Date.now()` — if breadcrumbs are transmitted via `scope.getScopeData()`, normalize to ISO 8601 on the way out.
5. `rum.js` — rename `loadTime` → `load_time_ms` for consistency with `_ms` suffix convention.

**Acceptance Criteria**:
- No float durations in transmitted payloads.
- All duration fields end in `_ms`.
- All absolute timestamps are ISO 8601 UTC.
- `API.md` documents the contract (done — see Temporal Contract section).

---

### [PUL-026] Event Schema Refactor: Device Cohort + Structured Payload
**Status**: 🔴 Open
**Branch**: `feature/pul-026-device-cohort-schema`
**Severity**: High — aligns SDK payload with documented API contract.

**The Goal**: Restructure event payload to match the schema documented in `API.md` (Event Schema section). Three changes:

**1. `device` object** — Move `device_type` from top-level into a `device` block. Add `device_cohort` (hash of cross-browser signals) and optional `hints` (Chromium-only enrichment).

```js
device: {
    device_type: "mobile" | "desktop",
    device_cohort: hash(screen|cores|timezone|gpu),  // computed once at init
    hints: {                                          // null on Safari/Firefox
        device_memory: navigator.deviceMemory,
        ua_platform: navigator.userAgentData?.platform,
        ua_mobile: navigator.userAgentData?.mobile
    }
}
```

Cohort hash inputs (cross-browser only):
- `screen.width + 'x' + screen.height`
- `navigator.hardwareConcurrency`
- `Intl.DateTimeFormat().resolvedOptions().timeZone`
- WebGL renderer via `gl.getExtension('WEBGL_debug_renderer_info')` → `gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)`, fallback `'none'`

`hints` object is **never included in the hash**. It is nullable metadata for Chromium sessions. Downstream must not join/group on hints fields.

**2. `environment` object** — Apply PUL-025 temporal normalization. Replace `timezone_offset` with IANA `timezone`.

**3. Breadcrumb timestamps** — Normalize `Date.now()` → ISO 8601 at serialization in `scope.getScopeData()`.

**Depends on**: PUL-025 (temporal normalization).

**Acceptance Criteria**:
- `device_cohort` is deterministic: same device + browser = same hash across sessions.
- `device_cohort` is cross-browser stable: same device on Chrome vs Safari = same hash.
- `hints` is `null` (not `{}`) when no Chromium signals are available.
- `device_cohort` computed once at `init()`, not per event.
- Transmitted payload matches the full event example in `API.md`.
- WebGL canvas is cleaned up after cohort computation (no leaked DOM elements).

---

### [PUL-027] Platform-Agnostic Commerce Action Detection
**Status**: 🔴 Open
**Branch**: `feature/pul-027-agnostic-commerce`
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

- **Cart Abandonment (SharedWorker)**: Cross-tab state tracking. Blocked by Safari iOS support gap.
- **Web Workers (Dedicated)**: Move SDK processing off main thread. Prove main-thread SDK first.
- **Service Worker (Background Sync)**: Guaranteed delivery on flaky mobile. Over-engineered for Phase 1.
- **Slack Integration**: Opt-in alert channel, progressive add after email is proven.
