# [PUL-053] Platform Validation — PWA Kit Integration

**Status**: 🔴 Open
**Severity**: High — first real-world validation of the SDK.
**Depends on**: PUL-050 (done), PUL-051 (done)

**Goal**: Install Pulsar in the open-source PWA Kit Retail React App. Run Playwright tests against the local storefront with SFCC API mocks.

**Approach**:
- Clone `pwa-kit` Retail React App, add `@pulsarjs/sdk` to `_app-config`
- Mock SFCC SCAPI responses (MSW or Playwright route interception)
- Set cookies with synthetic `dwsid` and `dwac_*` via `context.addCookies()`
- Set `window.dw = { ac: { _category: 'electronics' } }` via `page.addInitScript()`
- Simulate: PLP → PDP → cart add → checkout → 500 → rage click → tab close
- Intercept beacon, verify full envelope including SFCC context

**Data Extraction**: Intercept `sendBeacon` via `page.route('**/v1/ingest', ...)`, collect payloads, write to JSON. This produces real-shaped event data for server development and synthetic generator calibration.

---
