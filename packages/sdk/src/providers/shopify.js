/**
 * PulsarJS — Shopify Platform Provider
 * Shopify context extraction and commerce patterns.
 */

export const ShopifyProvider = {
    name: 'shopify',

    extractContext() {
        const context = {};

        if (typeof window !== 'undefined') {
            if (typeof window.Shopify !== 'undefined') {
                if (window.Shopify.shop) context.shop = window.Shopify.shop;
                if (window.Shopify.theme) {
                    if (window.Shopify.theme.id) context.themeId = window.Shopify.theme.id;
                    if (window.Shopify.theme.name) context.themeName = window.Shopify.theme.name;
                }
                if (window.Shopify.locale) context.locale = window.Shopify.locale;
                if (window.Shopify.currency && window.Shopify.currency.active) {
                    context.currency = window.Shopify.currency.active;
                }
            }

            if (typeof window.meta !== 'undefined' && window.meta.page && window.meta.page.pageType) {
                context.pageType = window.meta.page.pageType;
            }

            if (typeof window.ShopifyAnalytics !== 'undefined' &&
                window.ShopifyAnalytics.meta &&
                window.ShopifyAnalytics.meta.page &&
                window.ShopifyAnalytics.meta.page.customerId) {
                context.customerId = window.ShopifyAnalytics.meta.page.customerId;
            }
        }

        return context;
    },

    commerceActions: [
        { action: 'cart_add',    method: 'POST',   pattern: /\/cart\/add(?:\.js)?/i },
        { action: 'cart_remove', method: 'POST',   pattern: /\/cart\/change(?:\.js)?/i },
        { action: 'cart_update', method: 'POST',   pattern: /\/cart\/(?:change|update)(?:\.js)?/i },
        { action: 'checkout',    method: 'POST',   pattern: /\/checkout/i },
        { action: 'search',      method: 'GET',    pattern: /\/search(?:\/suggest\.json)?/i }
    ],

    pageTypes: [
        [/\/products\/[^/?]+/i, 'PDP'],
        [/\/collections\/[^/?]+/i, 'PLP'],
        [/\/cart/i, 'Cart'],
        [/\/checkouts?(?:\/|$)/i, 'Checkout'],
        [/\/search/i, 'Search'],
        [/\/pages\/[^/?]+/i, 'Content'],
        [/\/account/i, 'Account'],
        [/^\/$/,  'Home']
    ],

    endpointFilter: /\/cart\/|\/checkout|\/search/i,

    piiPatterns: [
        { pattern: /(\/account\?.*token=)[^&]+/i, replacement: '$1[TOKEN_REDACTED]' },
        { pattern: /\/checkouts\/[a-zA-Z0-9]+/i, replacement: '/checkouts/[TOKEN_REDACTED]' }
    ]
};
