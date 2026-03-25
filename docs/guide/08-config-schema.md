# Config Schema (Canonical)

```js
{
  clientId: String,               // Required. Your PulsarJS tenant ID.
  endpoint: String,               // Default: 'https://api.pulsarjs.com/v1/ingest'
  siteId: String,                 // Default: 'unknown'. SFCC Site ID (e.g., RefArch).
  storefrontType: Enum,           // 'PWA_KIT' | 'SITEGENESIS'
  enabled: Boolean,               // Default: true.
  sampleRate: Number,             // 0.0–1.0. Default: 1.0
  endpointFilter: RegExp,         // API routes to monitor. Default covers SCAPI baskets/orders/products/shopper.
  criticalSelectors: String[],    // CSS selectors for MutationObserver error UI detection.
  beforeSend: AsyncFunction,      // Async. Mutate payload or return null to drop. Primary consent/CMP integration point.
  beforeSendTimeout: Number,      // ms before beforeSend is timed out. Default: 2000.
  allowUnconfirmedConsent: Boolean, // If true, send events with consent_unconfirmed flag on beforeSend timeout. Default: false.
  nonce: String,                  // CSP nonce for any dynamically created elements.
  maxBreadcrumbs: Number,         // Default: 100
  slowApiThreshold: Number,       // ms before API call emits API_LATENCY. Default: 1000.
  rageClickThreshold: Number,     // Clicks within window to trigger RAGE_CLICK. Default: 3.
  rageClickWindow: Number,        // Time window (ms) for rage click detection. Default: 1000.
  scrollDepthMilestones: Number[], // SCROLL_DEPTH trigger points. Default: [25, 50, 75, 100].
  debug: Boolean                  // Default: false. Enables [Pulsar] console output.
}
```

### `beforeSend` Usage Note

`beforeSend` is the primary integration point for merchant-side consent requirements. Even though PulsarJS operates under legitimate interest and does not require a banner for its own legal basis, individual merchants may have stricter internal policies or regional requirements. This hook is how they enforce them.

```js
Pulsar.init({
  clientId: 'xyz',
  beforeSend: async (payload) => {
    const consent = await OneTrust.getConsentStatus('analytics');
    if (!consent) return null; // drop the payload
    return payload;
  }
});
```

If `beforeSend` throws or times out (2000ms default):
- `allowUnconfirmedConsent: false` (default) → event is **dropped**
- `allowUnconfirmedConsent: true` → event is sent with `metadata.consent_unconfirmed: true`

After `beforeSend` resolves, the payload must not be mutated by any internal code.
