# Platform Providers & Integration Examples

PulsarJS is designed to be platform-agnostic while still capturing deep, platform-specific commerce events. This is achieved through **Platform Providers**.

When you initialize PulsarJS, you can specify a `platform` configuration. A platform provider is simply an object that tells the SDK how to extract relevant commerce information (like page types, visitor IDs, and what endpoints correspond to a "checkout" or "add to cart").

## Built-in: Salesforce Commerce Cloud (SFCC)

SFCC is the built-in default provider.

### SFCC — PWA Kit (React)

If you are using the PWA Kit, simply import the SDK and initialize it in your application config.

```javascript
// app/components/_app-config/index.jsx
import '@pulsarjs/sdk';

Pulsar.init({
    clientId: 'YOUR_CLIENT_ID',
    siteId: 'RefArch',
    storefrontType: 'PWA_KIT'
});
```

### SFCC — SiteGenesis (ISML)

For SiteGenesis or older architectures, include the script tag globally (e.g., in `htmlhead.isml`).

```html
<script src="https://api.pulsarjs.com/pulsar.js"></script>
<script>
    Pulsar.init({
        clientId: 'YOUR_CLIENT_ID',
        siteId: '${dw.system.Site.current.ID}',
        storefrontType: 'SITEGENESIS'
    });
</script>
```

---

## Defining a Custom Provider (e.g. Shopify)

If you are using a different platform, like Shopify, BigCommerce, or a custom backend, you can pass a custom provider object to the `platform` config option.

The provider needs to match the `PlatformProvider` interface, providing URL matchers for page types and API interactions.

### Shopify Example

This example demonstrates how to configure Pulsar to listen to Shopify's standard Cart and Checkout APIs.

```javascript
Pulsar.init({
    clientId: 'your-tenant-id',
    platform: {
        name: 'shopify',
        // Extract context metadata that is attached to every event
        extractContext: () => ({
            shop_id: window.Shopify?.shop,
            theme_id: window.Shopify?.theme?.id
        }),
        // Map API calls to logical Commerce Actions
        commerceActions: [
            { action: 'cart_add', method: 'POST', pattern: /\/cart\/add/i },
            { action: 'cart_update', method: 'POST', pattern: /\/cart\/change/i },
            { action: 'cart_remove', method: 'POST', pattern: /\/cart\/change.*quantity=0/i },
            { action: 'checkout', method: 'POST', pattern: /\/checkout/i }
        ],
        // Tell the network collector which endpoints it should watch
        endpointFilter: /\/cart\/|\/checkout\//i,

        // Optionally classify page views using URL patterns
        pageTypes: [
            [/\/products\//i, 'PDP'],
            [/\/collections\//i, 'PLP'],
            [/\/cart/i, 'Cart'],
            [/\/checkouts\//i, 'Checkout'],
            [/^\/$/, 'Home']
        ]
    }
});
```

---

## Using `beforeSend` for Consent / CMP Integration

The `beforeSend` hook is a powerful asynchronous callback that runs before any batch of events is sent. This is the primary integration point for checking user consent (e.g., OneTrust) before transmitting data.

If the user has not given consent, you can return `null` to drop the payload.

```javascript
Pulsar.init({
  clientId: 'your-tenant-id',
  beforeSend: async (payload) => {
    // Await your consent management platform's status
    const consent = await OneTrust.getConsentStatus('analytics');

    // Drop the payload entirely if consent is not granted
    if (!consent) return null;

    // Otherwise, you can also modify the payload (e.g. appending context)
    payload.session.consent_given = true;

    return payload;
  }
});
```
