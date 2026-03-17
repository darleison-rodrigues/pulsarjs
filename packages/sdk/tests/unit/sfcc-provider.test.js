import { describe, it, expect, beforeEach } from 'vitest';
import { SFCCProvider, getCookie } from '../../src/providers/sfcc.js';

describe('SFCC Platform Provider', () => {

    beforeEach(() => {
        // Reset document.cookie mock
        Object.defineProperty(document, 'cookie', {
            writable: true,
            value: ''
        });
        // Reset window globals
        delete window.dw;
        delete window.Evergage;
        delete window.BOOMR;
    });

    it('has the correct provider name', () => {
        expect(SFCCProvider.name).toBe('sfcc');
    });

    it('extractContext returns expected shape with no cookies', () => {
        const ctx = SFCCProvider.extractContext();
        expect(ctx).toHaveProperty('dwsid');
        expect(ctx).toHaveProperty('visitorId');
        expect(ctx).toHaveProperty('customerId');
        expect(ctx.dwsid).toBeNull();
        expect(ctx.visitorId).toBeNull();
        expect(ctx.customerId).toBeNull();
    });

    it('extractContext reads dwsid cookie', () => {
        document.cookie = 'dwsid=abc123xyz';
        const ctx = SFCCProvider.extractContext();
        expect(ctx.dwsid).toBe('abc123xyz');
    });

    it('parses dwac_* cookies for visitor and customer IDs', () => {
        document.cookie = 'dwac_site1=visitor123|session456|customer789';
        const ctx = SFCCProvider.extractContext();
        expect(ctx.visitorId).toBe('visitor123');
        expect(ctx.customerId).toBe('customer789');
    });

    it('returns null for __ANNONYMOUS__ visitor/customer', () => {
        document.cookie = 'dwac_site1=__ANNONYMOUS__|session456|__ANNONYMOUS__';
        const ctx = SFCCProvider.extractContext();
        expect(ctx.visitorId).toBeNull();
        expect(ctx.customerId).toBeNull();
    });

    it('detects dw.ac._category', () => {
        window.dw = { ac: { _category: 'electronics' } };
        const ctx = SFCCProvider.extractContext();
        expect(ctx.category).toBe('electronics');
    });

    it('does not set category when dw.ac is absent', () => {
        const ctx = SFCCProvider.extractContext();
        expect(ctx.category).toBeUndefined();
    });

    it('detects Evergage', () => {
        window.Evergage = { getCurrentArticle: () => {} };
        const ctx = SFCCProvider.extractContext();
        expect(ctx.evergageActive).toBe(true);
    });

    it('detects BOOMR session', () => {
        window.BOOMR = { session: { id: 'boomr-sess-123' } };
        const ctx = SFCCProvider.extractContext();
        expect(ctx.boomrSession).toBe('boomr-sess-123');
    });

    it('has SCAPI commerce action patterns', () => {
        const actions = SFCCProvider.commerceActions.map(a => a.action);
        expect(actions).toEqual(['cart_add', 'cart_update', 'cart_remove', 'checkout', 'search']);
    });

    it('has SFCC page type patterns including /p/ for PDP', () => {
        const pdpPattern = SFCCProvider.pageTypes.find(([, type]) => type === 'PDP');
        expect(pdpPattern).toBeDefined();
        expect(pdpPattern[0].test('/p/blue-sneakers')).toBe(true);
    });

    it('has endpointFilter for SCAPI routes', () => {
        expect(SFCCProvider.endpointFilter.test('/baskets/abc/items')).toBe(true);
        expect(SFCCProvider.endpointFilter.test('/orders/123')).toBe(true);
        expect(SFCCProvider.endpointFilter.test('/shopper/auth')).toBe(true);
    });

    it('piiPatterns correctly redacts Customer-ID patterns', () => {
        const { pattern, replacement } = SFCCProvider.piiPatterns[0];
        const input = 'Error for abcCustomer-ID-12345 in request';
        const result = input.replace(pattern, replacement);
        expect(result).toBe('Error for [CUSTOMER_ID_REDACTED] in request');
    });

    it('getCookie returns null for missing cookie', () => {
        document.cookie = 'other=value';
        expect(getCookie('dwsid')).toBeNull();
    });

    it('getCookie returns value for existing cookie', () => {
        document.cookie = 'dwsid=test123';
        expect(getCookie('dwsid')).toBe('test123');
    });
});
