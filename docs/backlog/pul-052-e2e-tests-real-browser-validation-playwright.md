# [PUL-052] E2E Tests — Real Browser Validation (Playwright)

**Status**: 🔴 Open
**Severity**: High — proves the SDK works in a real browser, not just jsdom.
**Depends on**: PUL-051 (done)

**Goal**: Playwright tests against a minimal HTML page with Pulsar. Intercept `sendBeacon` / `fetch` at the network level. Assert on real payloads from real DOM events.

**Tests** (~30):
- Page load → PAGE_VIEW with correct URL and page_type
- SPA navigation → second PAGE_VIEW with `from_page_type`
- Scroll to bottom → SCROLL_DEPTH at milestones
- Rapid clicks → RAGE_CLICK with selector and count
- Fetch 500 → API_FAILURE captured
- Fetch match → COMMERCE_ACTION if pattern matches
- Tab hide → `sendBeacon` with correct envelope
- `Pulsar.disable()` → errors stop being captured
- `Pulsar.captureException()` → CUSTOM_EXCEPTION
- Campaign URL params → CAMPAIGN_ENTRY once per session
- RUM metrics on page hide (LCP, CLS)

---
