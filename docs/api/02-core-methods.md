# Core Methods

### `Pulsar.init(config)`
<!-- DOCS: C1 -->

<!-- DOCS: C1 -->
| Option | Type | Default | Description |
|---|---|---|---|
| `clientId` | `string` | **Required** | Your PulsarJS tenant ID |
| `siteId` | `string` | `'unknown'` | Site identifier (e.g., RefArch) |
| `endpoint` | `string` | `https://api.pulsarjs.com/v1/ingest` | Ingestion endpoint URL |
| `storefrontType` | `string` | `'PWA_KIT'` | `PWA_KIT` or `SITEGENESIS` |
| `platform` | `string\|object` | `'sfcc'` | Platform provider. Built-in: `'sfcc'`. Pass an object for custom providers (see below). |
| `enabled` | `boolean` | `true` | Whether the SDK is enabled. If `false`, events are dropped. |
| `sampleRate` | `number` | `1.0` | Session sampling rate (0–1) |
| `allowUnconfirmedConsent` | `boolean` | `false` | Allow data collection without explicit consent |
| `nonce` | `string` | `null` | CSP nonce for dynamic script tags |
| `beforeSend` | `function` | `null` | Async hook to filter/enrich events. Return `null` to drop. |
| `beforeSendTimeout` | `number` | `2000` | Max ms to wait for `beforeSend` |
| `allowUnconfirmedConsent` | `boolean` | `false` | Whether to allow unconfirmed consent <!-- DOCS: C1 --> |
| `nonce` | `string` | `null` | Nonce string <!-- DOCS: C1 --> |
| `endpointFilter` | `RegExp` | from provider | Regex to filter which fetch/XHR calls are monitored. Overrides provider default. |
| `criticalSelectors` | `string[]` | Error UI selectors | CSS selectors for MutationObserver (error UI detection) |
| `nonce` | `string` | `null` | CSP nonce for any dynamically created elements. |
| `maxBreadcrumbs` | `number` | `100` | Max breadcrumbs in circular buffer |
| `slowApiThreshold` | `number` | `1000` | Latency threshold (ms) for API_LATENCY events |
| `rageClickThreshold` | `number` | `3` | Clicks within window to trigger RAGE_CLICK |
| `rageClickWindow` | `number` | `1000` | Time window (ms) for rage click detection |
| `scrollDepthMilestones` | `number[]` | `[25, 50, 75, 100]` | SCROLL_DEPTH trigger points |
| `allowUnconfirmedConsent` | `boolean` | `false` | Allow event capture without confirmed consent |
| `nonce` | `string` | `null` | Nonce for Content Security Policy |
| `debug` | `boolean` | `false` | Console logging |
<!-- DOCS: C1 -->

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

### `Pulsar.setTag(key, value)`
<!-- DOCS: C2 -->

Adds a tag to the global scope. This is a proxy for `Pulsar.getScope().setTag(key, value)`.

### `Pulsar.setUser(id, email, metadata?)`

Sets user context on the global scope. This is a proxy for `Pulsar.getScope().setUser({ id, email, ...metadata })`.

### `Pulsar.addBreadcrumb(category, message, level?)`

Adds a breadcrumb to the global scope. This is a proxy for `Pulsar.getScope().addBreadcrumb({ category, message, level })`.

### `Pulsar.flush()`

Manually trigger a flush of the event queue. Returns a `Promise<void>`. Useful for merchants who need guaranteed delivery before a redirect (e.g. checkout submit).

---

## Interacting with the Scope

The Scope API enables context tracking and session tagging that are forwarded to all telemetry events. This enables richer cohort aggregation.

### `Pulsar.getScope()`

Returns the current `Scope` instance for tag/breadcrumb management. Available methods on the `Scope` instance:

- `setTag(key, value)`
- `setUser(user)`
- `setExtra(key, value)`
- `setMaxBreadcrumbs(max)`
- `addBreadcrumb(crumb)`

```javascript
// Add experiment details
Pulsar.getScope().setTag('experiment', 'v2_checkout');
// Group events by a user characteristic (never add raw PII)
Pulsar.getScope().setUser({ segment: 'vip' });
// Set maximum breadcrumbs to retain
Pulsar.getScope().setMaxBreadcrumbs(50);
// Add a manual breadcrumb
Pulsar.getScope().addBreadcrumb({
    category: 'ui.click',
    message: 'User expanded details',
    level: 'info'
});
```
