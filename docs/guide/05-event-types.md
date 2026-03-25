# Event Types

The SDK emits these event types as stream nodes. Each event carries an `event_id` (`{session_id}:{seq}`) for monotonic ordering.

| event_type | Category | Emitted by | Description |
|---|---|---|---|
| `PAGE_VIEW` | Navigation | `navigation.js` | Page load or SPA route change (History API patch) |
| `CAMPAIGN_ENTRY` | Navigation | `navigation.js` | UTM + click ID params detected. Once per session. |
| `TAB_VISIBILITY` | Navigation | `navigation.js` | Tab hidden/visible transitions |
| `SCROLL_DEPTH` | Interaction | `interactions.js` | Milestone reached (25%, 50%, 75%, 100%) |
| `RAGE_CLICK` | Interaction | `interactions.js` | Rapid clicks on same element |
| `COMMERCE_ACTION` | Commerce | `network.js` | Successful SCAPI call: cart_add, cart_update, cart_remove, checkout, search |
| `JS_CRASH` | Error | `errors.js` | `window.onerror` or `onunhandledrejection` |
| `API_FAILURE` | Error | `network.js` | Non-2xx from monitored endpoints |
| `NETWORK_ERROR` | Error | `network.js` | Fetch/XHR network failure |
| `UI_FAILURE` | Error | `errors.js` | Critical error UI rendered (MutationObserver) |
| `API_LATENCY` | Performance | `network.js` | API call exceeding `slowApiThreshold` |
| `RUM_METRICS` | Performance | `rum.js` | Core Web Vitals snapshot (flushed on page hide) |
| `CUSTOM_EXCEPTION` | Error | `index.js` | Via `Pulsar.captureException()` |
| `QUEUE_OVERFLOW` | System | `capture.js` | Events dropped due to queue limits |
| `FLUSH_FAILED` | System | `capture.js` | Delivery failed after retries |

### Campaign Attribution (Click IDs)

Captured in `CAMPAIGN_ENTRY` metadata by `navigation.js`:

| Param | Platform |
|---|---|
| `utm_source/medium/campaign/term/content` | Any (manual) |
| `gclid`, `gbraid`, `wbraid` | Google Ads |
| `fbclid` | Meta (Facebook / Instagram) |
| `msclkid` | Microsoft / Bing |
| `ttclid` | TikTok |
| `twclid` | X (Twitter) |
| `li_fat_id` | LinkedIn |
| `pin_unauth` | Pinterest |
| `sccid` | Snapchat |
| `dclid` | Google DV360 |
| `irclickid` | Impact Radius (affiliate) |
| `aff_id`, `clickid` | Generic affiliate |

The SDK sends raw params only. The server resolves them into a structured taxonomy and ontology (see below).
