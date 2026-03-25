# Defining Custom Commerce Providers

While PulsarJS ships with an `sfcc` built-in provider, custom platform providers can be passed via the `platform` config option. A provider is an object with the following shape:

```javascript
/**
 * @typedef {Object} PlatformProvider
 * @property {string} name                 - Provider identifier ('sfcc', 'shopify', 'custom')
 * @property {Function} extractContext     - Returns platform-specific metadata object
 * @property {Array} commerceActions       - [{action, method, pattern}] commerce API patterns
 * @property {Array} pageTypes             - [[RegExp, string]] page type patterns
 * @property {RegExp|null} endpointFilter  - Which fetch/XHR calls to monitor
 * @property {Array} [piiPatterns]         - [{pattern, replacement}] additional PII redaction rules
 */
```

Missing keys are filled from generic ecommerce defaults. Example:

```javascript
Pulsar.init({
    clientId: 'your-tenant-id',
    platform: {
        name: 'shopify',
        extractContext: () => ({
            shop_id: window.Shopify?.shop,
            theme_id: window.Shopify?.theme?.id
        }),
        commerceActions: [
            { action: 'cart_add', method: 'POST', pattern: /\/cart\/add/i },
            { action: 'checkout', method: 'POST', pattern: /\/checkout/i }
        ],
        endpointFilter: /\/cart\/|\/checkout\//i
    }
});
```
