# Core Methods

### `Pulsar.init(config)`

| Option | Type | Default | Description |
|---|---|---|---|
| `clientId` | `string` | **Required** | Your PulsarJS tenant ID |
| `siteId` | `string` | `'unknown'` | Site identifier (e.g., RefArch) |
| `endpoint` | `string` | `https://api.pulsarjs.com/v1/ingest` | Ingestion endpoint URL |
| `storefrontType` | `string` | `'PWA_KIT'` | `PWA_KIT` or `SITEGENESIS` |
| `platform` | `string\|object` | `'sfcc'` | Platform provider. Built-in: `'sfcc'`. Pass an object for custom providers (see below). |
| `enabled` | `boolean` | `true` | Whether the SDK is enabled. <!-- DOCS: C1 --> |
| `sampleRate` | `number` | `1.0` | Session sampling rate (0–1) |
| `beforeSend` | `function` | `null` | Async hook to filter/enrich events. Return `null` to drop. |
| `beforeSendTimeout` | `number` | `2000` | Max ms to wait for `beforeSend` |
| `allowUnconfirmedConsent` | `boolean` | `false` | Whether to allow unconfirmed consent <!-- DOCS: C1 --> |
| `nonce` | `string` | `null` | Nonce string <!-- DOCS: C1 --> |
| `endpointFilter` | `RegExp` | from provider | Regex to filter which fetch/XHR calls are monitored. Overrides provider default. |
| `criticalSelectors` | `string[]` | Error UI selectors | CSS selectors for MutationObserver (error UI detection) |
| `maxBreadcrumbs` | `number` | `100` | Max breadcrumbs in circular buffer |
| `slowApiThreshold` | `number` | `1000` | Latency threshold (ms) for API_LATENCY events |
| `rageClickThreshold` | `number` | `3` | Clicks within window to trigger RAGE_CLICK |
| `rageClickWindow` | `number` | `1000` | Time window (ms) for rage click detection |
| `scrollDepthMilestones` | `number[]` | `[25, 50, 75, 100]` | SCROLL_DEPTH trigger points |
| `debug` | `boolean` | `false` | Console logging |

### `Pulsar.captureException(error, metadata?)`

```javascript
try {
    checkout.submit();
} catch (e) {
    Pulsar.captureException(e, { page: 'checkout' });
}
```

### `Pulsar.enable()` / `Pulsar.disable()`

Runtime toggle. `disable()` restores original `fetch`, `XHR`, `onerror`, and `onunhandledrejection`, and detaches interaction/navigation listeners.

### `Pulsar.getContext()`

Returns a snapshot of the current session context, tags, user data, and configuration. Useful for debugging or custom server-side handshakes.

```javascript
const context = Pulsar.getContext();
console.log(context.sessionID);
```

---

## Interacting with the Scope

The Scope API enables context tracking and session tagging that are forwarded to all telemetry events. This enables richer cohort aggregation.

### `Pulsar.getScope()`

Returns the current `Scope` instance for tag/breadcrumb management:

```javascript
// Add experiment details
Pulsar.getScope().setTag('experiment', 'v2_checkout');
// Group events by a user characteristic (never add raw PII)
Pulsar.getScope().setUser({ segment: 'vip' });
```
