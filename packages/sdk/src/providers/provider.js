/**
 * PulsarJS — Platform Provider Contract
 * Decouples platform enrichment from the core instrumentation engine.
 *
 * @typedef {Object} PlatformProvider
 * @property {string} name                 - identifier ('sfcc', 'shopify', 'custom')
 * @property {Function} extractContext     - returns platform-specific metadata {}
 * @property {Array} commerceActions       - [{action, method, pattern}]
 * @property {Array} pageTypes             - [[RegExp, string]]
 * @property {RegExp|null} endpointFilter  - which fetch/XHR to monitor
 * @property {Array} [piiPatterns]         - [{pattern, replacement}] optional
 */

import { SFCCProvider } from './sfcc.js';

/**
 * Generic provider — sensible ecommerce defaults.
 * Used as fallback when no provider is specified or when a custom provider omits keys.
 */
export const GENERIC_PROVIDER = {
    name: 'generic',
    extractContext() { return {}; },
    commerceActions: [
        { action: 'cart_add',    method: 'POST',   pattern: /\/cart\/items|\/baskets\/[^/]+\/items/i },
        { action: 'cart_update', method: 'PATCH',  pattern: /\/cart\/items|\/baskets\//i },
        { action: 'cart_remove', method: 'DELETE',  pattern: /\/cart\/items|\/baskets\/[^/]+\/items/i },
        { action: 'checkout',    method: 'POST',   pattern: /\/orders|\/checkout/i },
        { action: 'search',      method: 'GET',    pattern: /\/product-search|\/search/i }
    ],
    pageTypes: [
        [/\/checkout/i, 'Checkout'],
        [/\/cart/i, 'Cart'],
        [/\/products?\/([^/?]+)/i, 'PDP'],
        [/\/collections?\//i, 'PLP'],
        [/\/search/i, 'Search'],
        [/^\/$/,  'Home']
    ],
    endpointFilter: /\/cart|\/baskets\/|\/orders\/|\/products\/|\/checkout/i,
    piiPatterns: []
};

const PROVIDER_KEYS = ['name', 'extractContext', 'commerceActions', 'pageTypes', 'endpointFilter', 'piiPatterns'];

const BUILTIN_PROVIDERS = {
    sfcc: SFCCProvider
};

/**
 * Resolve a platform config value into a complete provider.
 *
 * @param {string|Object|undefined} platformConfig - 'sfcc', provider object, or undefined
 * @returns {PlatformProvider}
 */
export function resolveProvider(platformConfig) {
    if (!platformConfig) {
        return { ...GENERIC_PROVIDER };
    }

    if (typeof platformConfig === 'string') {
        const builtin = BUILTIN_PROVIDERS[platformConfig];
        if (builtin) {
            return { ...GENERIC_PROVIDER, ...builtin };
        }
        // Unknown string provider — fall back to generic with that name
        return { ...GENERIC_PROVIDER, name: platformConfig };
    }

    if (typeof platformConfig === 'object') {
        // Custom provider object — merge with generic defaults for missing keys
        const merged = { ...GENERIC_PROVIDER };
        for (const key of PROVIDER_KEYS) {
            if (platformConfig[key] !== undefined) {
                merged[key] = platformConfig[key];
            }
        }
        return merged;
    }

    return { ...GENERIC_PROVIDER };
}
