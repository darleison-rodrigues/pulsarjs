# [PUL-062] Console Mode Documentation & QA Positioning

**Status**: 🔴 Open
**Depends on**: None (SDK already supports `debug: true`)

**Goal**: Document console mode as a standalone QA instrumentation tool — the immediate value prop requiring no server.

**Deliverables**:
1. `docs/QA_INSTRUMENTATION.md` — install, what you see, export, Playwright usage, comparison
2. Landing page section copy for QA & Dev persona card
3. Console output formatting — structured, grouped by session, color-coded severity:
   ```
   [Pulsar] PAGE_VIEW → Home (referrer: campaign)
   [Pulsar] CAMPAIGN_ENTRY → google (caused → :1)
   [Pulsar] COMMERCE_ACTION → cart_add (/baskets/{id}/items, 342ms)
   [Pulsar] API_FAILURE → 500 /orders (blocked_by → :3)
   [Pulsar] RAGE_CLICK → #place-order (3 clicks, frustrated_by → :4)
   ```

---
