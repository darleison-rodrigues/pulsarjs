import { describe, it, expect, beforeEach } from 'vitest';
import { resolveProvider, GENERIC_PROVIDER } from '../../src/providers/provider.js';
import { Sanitizers } from '../../src/utils/sanitizers.js';

describe('Platform Provider Resolution', () => {

    beforeEach(() => {
        Sanitizers._resetPiiPatterns();
    });

    it('resolveProvider("sfcc") returns SFCC provider with all required keys', () => {
        const provider = resolveProvider('sfcc');
        expect(provider.name).toBe('sfcc');
        expect(typeof provider.extractContext).toBe('function');
        expect(Array.isArray(provider.commerceActions)).toBe(true);
        expect(Array.isArray(provider.pageTypes)).toBe(true);
        expect(provider.endpointFilter).toBeInstanceOf(RegExp);
        expect(Array.isArray(provider.piiPatterns)).toBe(true);
        expect(provider.piiPatterns.length).toBeGreaterThan(0);
    });

    it('resolveProvider("sfcc") uses SFCC commerce actions', () => {
        const provider = resolveProvider('sfcc');
        const actions = provider.commerceActions.map(a => a.action);
        expect(actions).toContain('cart_add');
        expect(actions).toContain('checkout');
    });

    it('resolveProvider(undefined) returns generic provider', () => {
        const provider = resolveProvider(undefined);
        expect(provider.name).toBe('generic');
        expect(typeof provider.extractContext).toBe('function');
        // Generic extractContext returns empty object
        expect(provider.extractContext()).toEqual({});
    });

    it('resolveProvider(undefined) has sensible commerce defaults', () => {
        const provider = resolveProvider(undefined);
        const actions = provider.commerceActions.map(a => a.action);
        expect(actions).toContain('cart_add');
        expect(actions).toContain('checkout');
        expect(actions).toContain('search');
    });

    it('resolveProvider(customObj) merges with generic defaults for missing keys', () => {
        const customExtract = () => ({ custom: true });
        const provider = resolveProvider({
            name: 'shopify',
            extractContext: customExtract
        });
        expect(provider.name).toBe('shopify');
        expect(provider.extractContext).toBe(customExtract);
        // Missing keys filled from GENERIC_PROVIDER
        expect(Array.isArray(provider.commerceActions)).toBe(true);
        expect(Array.isArray(provider.pageTypes)).toBe(true);
        expect(provider.endpointFilter).toBeInstanceOf(RegExp);
    });

    it('custom provider extractContext is called correctly', () => {
        const provider = resolveProvider({
            name: 'test',
            extractContext: () => ({ tenant: 'acme', region: 'us-east' })
        });
        const ctx = provider.extractContext();
        expect(ctx).toEqual({ tenant: 'acme', region: 'us-east' });
    });

    it('custom provider can override commerceActions', () => {
        const customActions = [
            { action: 'add_to_cart', method: 'POST', pattern: /\/api\/cart/i }
        ];
        const provider = resolveProvider({
            name: 'custom',
            commerceActions: customActions
        });
        expect(provider.commerceActions).toBe(customActions);
    });

    it('unknown string provider returns generic with that name', () => {
        const provider = resolveProvider('shopify');
        expect(provider.name).toBe('shopify');
        expect(provider.extractContext()).toEqual({});
    });

    it('provider piiPatterns can be registered via Sanitizers', () => {
        const provider = resolveProvider('sfcc');
        Sanitizers.registerPiiPatterns(provider.piiPatterns);
        const result = Sanitizers.sanitizeMessage('Error for abcCustomer-ID-12345');
        expect(result).toContain('[CUSTOMER_ID_REDACTED]');
        expect(result).not.toContain('Customer-ID-12345');
    });

    it('generic provider has no piiPatterns by default', () => {
        const provider = resolveProvider(undefined);
        expect(provider.piiPatterns).toEqual([]);
    });

    it('GENERIC_PROVIDER pageTypes match common ecommerce routes', () => {
        const types = GENERIC_PROVIDER.pageTypes;
        const match = (path) => {
            for (const [pattern, type] of types) {
                if (pattern.test(path)) return type;
            }
            return 'Other';
        };
        expect(match('/checkout')).toBe('Checkout');
        expect(match('/cart')).toBe('Cart');
        expect(match('/products/blue-sneakers')).toBe('PDP');
        expect(match('/search')).toBe('Search');
        expect(match('/')).toBe('Home');
    });
});
