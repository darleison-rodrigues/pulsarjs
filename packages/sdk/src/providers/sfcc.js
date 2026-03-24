/**
 * PulsarJS — SFCC Platform Provider
 * Salesforce Commerce Cloud context extraction and commerce patterns.
 *
 * Provides: dwsid, dwac_* visitor/customer IDs, dw.ac category,
 * Evergage/BOOMR detection, SCAPI commerce patterns, SFCC PII patterns.
 */

/**
 * Get a cookie value by name.
 */
export function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

/**
 * SFCC Platform Provider.
 * extractContext returns SFCC-specific metadata (cookies, dw.ac, third-party detection).
 * Does NOT run page type inference or campaign extraction — those are core concerns.
 */
export const SFCCProvider = {
    name: 'sfcc',

    extractContext() {
        const context = {};

        // dw.ac category context
        if (typeof window.dw !== 'undefined' && window.dw.ac && window.dw.ac._category) {
            context.category = window.dw.ac._category;
        }

        // Third-party detection
        if (typeof window.Evergage !== 'undefined' && window.Evergage.getCurrentArticle) {
            context.evergageActive = true;
        }
        if (typeof window.BOOMR !== 'undefined' && window.BOOMR.session) {
            context.boomrSession = window.BOOMR.session.id;
        }

        return context;
    },

    commerceActions: [
        { action: 'cart_add',    method: 'POST',   pattern: /\/baskets\/[^/]+\/items/i },
        { action: 'cart_update', method: 'PATCH',  pattern: /\/baskets\//i },
        { action: 'cart_remove', method: 'DELETE',  pattern: /\/baskets\/[^/]+\/items/i },
        { action: 'checkout',    method: 'POST',   pattern: /\/orders/i },
        { action: 'search',      method: 'GET',    pattern: /\/product-search/i }
    ],

    pageTypes: [
        [/\/checkout/i, 'Checkout'],
        [/\/cart/i, 'Cart'],
        [/\/p\/([^/?]+)/i, 'PDP'],
        [/\/d\//i, 'PLP'],
        [/\/search/i, 'Search'],
        [/^\/$/,  'Home']
    ],

    endpointFilter: /\/baskets\/|\/orders\/|\/products\/|\/shopper\//i,

    piiPatterns: [
        { pattern: /\b\w+Customer-ID-\d+\b/gi, replacement: '[CUSTOMER_ID_REDACTED]' }
    ]
};
