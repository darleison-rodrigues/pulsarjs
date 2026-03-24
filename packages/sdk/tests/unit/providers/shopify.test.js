import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ShopifyProvider } from '../../../src/providers/shopify.js';
import { resolveProvider } from '../../../src/providers/provider.js';

describe('ShopifyProvider', () => {

    describe('extractContext()', () => {
        beforeEach(() => {
            vi.stubGlobal('window', {
                Shopify: undefined,
                meta: undefined,
                ShopifyAnalytics: undefined
            });
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('returns {} when window.Shopify is undefined', () => {
            expect(ShopifyProvider.extractContext()).toEqual({});
        });

        it('returns correct values when full globals are present', () => {
            vi.stubGlobal('window', {
                Shopify: {
                    shop: 'test-store.myshopify.com',
                    theme: {
                        id: '123456',
                        name: 'Dawn'
                    },
                    locale: 'en-US',
                    currency: { active: 'USD' }
                },
                meta: {
                    page: { pageType: 'product' }
                },
                ShopifyAnalytics: {
                    meta: {
                        page: { customerId: '987654321' }
                    }
                }
            });

            expect(ShopifyProvider.extractContext()).toEqual({
                shop: 'test-store.myshopify.com',
                themeId: '123456',
                themeName: 'Dawn',
                locale: 'en-US',
                currency: 'USD',
                pageType: 'product',
                customerId: '987654321'
            });
        });

        it('handles partial globals gracefully', () => {
            vi.stubGlobal('window', {
                Shopify: {
                    shop: 'partial-store.myshopify.com',
                    theme: { id: '654321' }
                    // missing theme.name, locale, currency
                }
                // missing meta, ShopifyAnalytics
            });

            expect(ShopifyProvider.extractContext()).toEqual({
                shop: 'partial-store.myshopify.com',
                themeId: '654321'
            });
        });
    });

    describe('commerceActions', () => {
        const matchesAction = (actionName, method, url) => {
            const actionDef = ShopifyProvider.commerceActions.find(a => a.action === actionName);
            if (!actionDef) return false;
            if (actionDef.method !== method) return false;
            return actionDef.pattern.test(url);
        };

        it('matches expected Shopify Ajax API URLs', () => {
            // cart_add
            expect(matchesAction('cart_add', 'POST', '/cart/add.js')).toBe(true);
            expect(matchesAction('cart_add', 'POST', '/cart/add')).toBe(true);

            // cart_update
            expect(matchesAction('cart_update', 'POST', '/cart/change.js')).toBe(true);
            expect(matchesAction('cart_update', 'POST', '/cart/update.js')).toBe(true);

            // cart_remove
            expect(matchesAction('cart_remove', 'POST', '/cart/change.js?quantity=0')).toBe(true);
            expect(matchesAction('cart_remove', 'POST', '/cart/change?id=123&quantity=0')).toBe(true);

            // checkout
            expect(matchesAction('checkout', 'POST', '/checkout')).toBe(true);
            expect(matchesAction('checkout', 'POST', '/api/2024-01/graphql.json')).toBe(true);

            // search
            expect(matchesAction('search', 'GET', '/search')).toBe(true);
            expect(matchesAction('search', 'GET', '/search/suggest.json')).toBe(true);
        });

        it('does NOT match non-Shopify URLs', () => {
            expect(matchesAction('cart_add', 'POST', '/baskets/123/items')).toBe(false); // sfcc
            expect(matchesAction('checkout', 'POST', '/orders')).toBe(false); // sfcc
            expect(matchesAction('cart_update', 'PATCH', '/cart/change.js')).toBe(false); // wrong method
            expect(matchesAction('search', 'GET', '/product-search')).toBe(false); // sfcc
        });
    });

    describe('pageTypes', () => {
        const getPageType = (url) => {
            const match = ShopifyProvider.pageTypes.find(pt => pt[0].test(url));
            return match ? match[1] : 'Unknown';
        };

        it('correctly classifies all Shopify URL patterns', () => {
            expect(getPageType('/products/awesome-shirt')).toBe('PDP');
            expect(getPageType('/collections/summer-sale')).toBe('PLP');
            expect(getPageType('/cart')).toBe('Cart');
            expect(getPageType('/checkout')).toBe('Checkout');
            expect(getPageType('/checkouts/1234abcd')).toBe('Checkout');
            expect(getPageType('/search?q=shirt')).toBe('Search');
            expect(getPageType('/pages/about-us')).toBe('Content');
            expect(getPageType('/account/login')).toBe('Account');
            expect(getPageType('/')).toBe('Home');
        });
    });

    describe('piiPatterns', () => {
        const redact = (url) => {
            let result = url;
            for (const { pattern, replacement } of ShopifyProvider.piiPatterns) {
                // Reset lastIndex for global regexes before each use
                pattern.lastIndex = 0;
                result = result.replace(pattern, replacement);
            }
            return result;
        };

        it('redacts checkout tokens and account tokens', () => {
            expect(redact('/account?token=abcdef123456&foo=bar')).toBe('/account?token=[TOKEN_REDACTED]&foo=bar');
            expect(redact('/account?something=else&token=abcdef123456')).toBe('/account?something=else&token=[TOKEN_REDACTED]');
            expect(redact('/checkouts/c1c2c3c4c5c6c7c8c9c0?step=contact_information')).toBe('/checkouts/[TOKEN_REDACTED]?step=contact_information');
        });
    });

    describe('resolveProvider()', () => {
        it('returns merged provider with Shopify overrides', () => {
            const provider = resolveProvider('shopify');
            expect(provider.name).toBe('shopify');
            expect(provider.extractContext).toBe(ShopifyProvider.extractContext);
            expect(provider.commerceActions).toEqual(ShopifyProvider.commerceActions);
            expect(provider.pageTypes).toEqual(ShopifyProvider.pageTypes);
            expect(provider.endpointFilter).toEqual(ShopifyProvider.endpointFilter);
            expect(provider.piiPatterns).toEqual(ShopifyProvider.piiPatterns);
        });
    });
});
