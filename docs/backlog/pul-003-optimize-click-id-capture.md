# [PUL-003] Optimize Click ID Capture

**Status**: Draft — Revised after architectural review
**Severity**: Low — The click ID list is already comprehensive. Remaining work is hardening, not expansion.
**Depends on**: None

---

## Scope Boundary: Session Labeling, Not Credit Assignment

PulsarJS captures click IDs as **ephemeral session context** and labels sessions by entry source via `entryCampaignSource`. This is **session labeling** — an observed fact about how the session started. It is not causal attribution.

Per Google's "A Causal Framework for Digital Attribution" (Kelly, Vaver, Koehler 2017) and the UDDA methodology (Sapp, Vaver 2017), meaningful attribution requires **counterfactual modeling** — credit assignment demands knowing whether the conversion would have happened *without* the ad interaction, using upstream-only path matching. Simply capturing `gclid` values and labeling the session as "paid" provides correlation, not causation.

**Three distinct layers exist:**

1. **Session labeling (SDK — PUL-003 scope).** The `CLICK_ID_PARAMS` map classifies entry source: paid, social, affiliate. This is an observed fact, not a causal claim. It flows into `state.entryCampaignSource` and the flush envelope.
2. **Channel taxonomy resolution (Server — TenantAgent scope).** The server resolves raw click IDs + UTM params into a 4-level hierarchy (channel/platform/product/intent) and labels the session graph. Still observational — "this session entered via Meta Instagram Ads." See `docs/SERVER.md`.
3. **Causal attribution (Server — QueryAgent scope).** Incremental credit assignment requires UDDA-style upstream matching: find sessions with identical pre-intervention paths but different entry channels, compare conversion rates. This is a query pattern executed on demand, not a graph edge or a label. Permanently out of scope for the SDK.

Building causal attribution logic is out of scope for the SDK. The server's QueryAgent can execute UDDA-style causal queries over `session_graphs` on demand.

---

## Review Findings

### Already Done
The click ID list expansion (original item 1) is **complete in `navigation.js:191-208`**. All platforms cited in the original backlog are covered: Google Ads (gclid/gbraid/wbraid), Meta (fbclid), Microsoft (msclkid), TikTok (ttclid), X (twclid), LinkedIn (li_fat_id), Pinterest (pin_unauth), Snapchat (sccid), DV360 (dclid), Impact Radius (irclickid), generic affiliate (aff_id, clickid).

### Actual Issues Found

**1. Duplicated click ID list — latent bug**
The click ID params exist in two places:
- `emitCampaignEntry` keys array (`navigation.js:191-208`)
- `classifyReferrer` regex (`navigation.js:241`)

If a param is added to one and not the other, `referrer_type: 'campaign'` won't fire for that param. These must be derived from a single source of truth.

**2. No value length cap**
`data[key] = params.get(key)` stores raw values with no length validation. Click IDs are typically 50-100 chars, but a malformed or adversarial URL could inject arbitrarily long strings into the payload. Cap at 128 chars.

**3. `entryCampaignSource` fallback conflates channels**
Line 220: `state.entryCampaignSource = data.utm_source || 'paid'`. If a session has `irclickid` but no `utm_source`, it's labeled `'paid'` — but Impact Radius is affiliate, not paid. The fallback should classify by click ID type:
- `gclid/gbraid/wbraid/msclkid/dclid` → `'paid'`
- `fbclid/ttclid/twclid/sccid/pin_unauth/li_fat_id` → `'social'`
- `irclickid/aff_id/clickid` → `'affiliate'`

**4. Zero test coverage for `emitCampaignEntry`**
Tests exist in `environment.test.js` for a legacy `extractCampaigns` function, but the actual `emitCampaignEntry` in `navigation.js` — including `caused_by` edge linking, `state.entryCampaignSource` assignment, and the full key list — is untested.

---

## Proposed Changes (Revised)

### 1. Extract shared click ID constant
**Location:** `packages/sdk/src/collectors/navigation.js`

Define a single `CLICK_ID_PARAMS` array (or map with channel classification) used by both `emitCampaignEntry` and `classifyReferrer`. Eliminates the duplication bug.

```javascript
const CLICK_ID_PARAMS = {
    // Paid search/display
    gclid: 'paid', gbraid: 'paid', wbraid: 'paid',
    msclkid: 'paid', dclid: 'paid',
    // Social
    fbclid: 'social', ttclid: 'social', twclid: 'social',
    sccid: 'social', pin_unauth: 'social', li_fat_id: 'social',
    // Affiliate
    irclickid: 'affiliate', aff_id: 'affiliate', clickid: 'affiliate'
};
```

### 2. Cap click ID value length
**Location:** `packages/sdk/src/collectors/navigation.js` — `emitCampaignEntry`

Truncate values: `data[key] = params.get(key).slice(0, 128)`.

### 3. Fix `entryCampaignSource` classification
**Location:** `packages/sdk/src/collectors/navigation.js` — `emitCampaignEntry`

Use `CLICK_ID_PARAMS` map to derive channel when `utm_source` is absent. First matched click ID determines the channel.

### 4. Write tests for `emitCampaignEntry`
**Location:** `packages/sdk/tests/unit/navigation.test.js`

- Test: all `CLICK_ID_PARAMS` keys are captured when present in URL
- Test: `classifyReferrer` returns `'campaign'` for every click ID param (proves single-source-of-truth works)
- Test: values exceeding 128 chars are truncated
- Test: `entryCampaignSource` correctly classifies paid vs social vs affiliate
- Test: `CAMPAIGN_ENTRY` event includes `caused_by` edge to `firstPageViewEventId`
- Negative: unknown params are not captured
- Negative: empty search string emits no event

---

## Verification Plan

**Automated Tests:**
- All tests above in `navigation.test.js`
- Run `npx vitest` — no regressions

**Manual Testing:**
- Construct URLs with each click ID type, verify `CAMPAIGN_ENTRY` payload
- Verify `state.entryCampaignSource` reflects correct channel classification
