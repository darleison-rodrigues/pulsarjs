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

### [PUL-031] Remove SFCC-Specific Naming from Core SDK
**Status**: 🔴 Open
**Branch**: `feature/pul-031-platform-neutral-naming`
**Severity**: Medium — removes platform coupling from public API surface and internals.
**Depends on**: PUL-027

**The Goal**: Rename all SFCC/SCAPI/PWAKit-specific identifiers in the core SDK so the codebase reads as platform-neutral. SFCC support remains via the integration module and default config, but nothing in the public API or internal naming implies a single-vendor dependency.

**Changes**:
1. `integrations/sfcc.js` → `integrations/sfcc.js` (file stays, it IS the SFCC integration) — but rename exported `extractSFCCContext` → `extractPlatformContext`, with SFCC logic as the built-in provider. Comments updated.
2. `index.js` — Update import and `state.extractSFCCContext` → `state.extractPlatformContext`. Update module docstring ("SFCC storefronts" → "commerce storefronts").
3. `capture.js` — Update `state.extractSFCCContext()` call.
4. `rum.js` — Update `state.extractSFCCContext()` call and PWA Kit comments.
5. `network.js` — Rename `isSFCCRoute` → `isMonitoredRoute`. Update comments ("SFCC API calls" → "API calls", "SCAPI calls" → "commerce calls").
6. `config.js` — Update comment referencing "SFCC SCAPI patterns".
7. `sanitizers.js` — Update "SFCC customer IDs" comment.
8. `navigation.js` — Update "PWA Kit uses React Router" comment.
9. `config.js` — Rename default `storefrontType: 'PWA_KIT'` → keep value (breaking change risk), but update surrounding comments.

**Acceptance Criteria**:
- `grep -ri 'sfcc\|scapi\|pwakit' packages/sdk/src/` returns zero hits outside `integrations/sfcc.js`.
- Public API unchanged — `extractSFCCContext` internally aliased, no breaking change for existing callers.
- All existing tests pass without modification.
- SFCC integration continues to work identically with default config.

---