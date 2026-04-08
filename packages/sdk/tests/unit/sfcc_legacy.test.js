import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractPlatformContext } from '../../src/integrations/sfcc.js';
import { SFCCProvider } from '../../src/providers/sfcc.js';

describe('SFCC Legacy Integration: extractPlatformContext', () => {
    beforeEach(() => {
        vi.stubGlobal('window', {
            location: {
                pathname: '/p/test-product'
            }
        });
        vi.stubGlobal('document', {
            cookie: ''
        });
    });

    it('successfully extracts context with provided arguments', () => {
        const pageTypes = [[/\/p\/([^/?]+)/i, 'PDP']];
        const extractCampaigns = () => ({ utm_source: 'test' });

        const context = extractPlatformContext(extractCampaigns, pageTypes);

        expect(context.pageType).toBe('PDP');
        expect(context.campaign).toEqual({ utm_source: 'test' });
    });

    it('uses "Other" for unknown page types', () => {
        window.location.pathname = '/unknown';
        const pageTypes = [[/\/p\/([^/?]+)/i, 'PDP']];

        const context = extractPlatformContext(null, pageTypes);

        expect(context.pageType).toBeNull(); // 'Other' maps to null in current implementation
    });

    it('handles missing extractCampaigns function', () => {
        const pageTypes = [[/\/p\/([^/?]+)/i, 'PDP']];

        const context = extractPlatformContext(null, pageTypes);

        expect(context.pageType).toBe('PDP');
        expect(context.campaign).toBeUndefined();
    });

    it('handles missing pageTypes by falling back to provider defaults', () => {
        const context = extractPlatformContext(null, null);
        // /p/test-product matches PDP in SFCCProvider defaults
        expect(context.pageType).toBe('PDP');
    });

    it('returns empty object and does not throw when extractCampaigns throws', () => {
        const pageTypes = [[/\/p\/([^/?]+)/i, 'PDP']];
        const extractCampaigns = () => { throw new Error('fail'); };

        const context = extractPlatformContext(extractCampaigns, pageTypes);
        expect(context).toEqual({});
    });
});
