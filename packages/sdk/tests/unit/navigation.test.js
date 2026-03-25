import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inferPageType } from '../../src/collectors/navigation.js';

describe('Product View Tracking (PUL-030)', () => {
    let mockState;

    beforeEach(() => {
        mockState = {
            config: {
                pageTypes: [
                    [/\/p\/([^/?]+)/i, 'PDP'],
                    [/^\/$/, 'Home']
                ],
                enabled: true,
                isInitialized: true
            },
            productRefs: [],
            globalScope: {
                getScopeData: () => ({})
            },
            capture: vi.fn().mockResolvedValue('event-123'),
            extractPlatformContext: () => ({})
        };

        // Mock window.location
        delete window.location;
        window.location = {
            pathname: '/',
            href: 'https://example.com/',
            search: ''
        };
    });

    it('extracts product_ref from PDP URL', () => {
        const path = '/p/blue-sneakers-123';
        const pageTypes = [[/\/p\/([^/?]+)/i, 'PDP']];
        const pageInfo = inferPageType(path, pageTypes);
        
        expect(pageInfo.type).toBe('PDP');
        expect(pageInfo.product_ref).toBe('blue-sneakers-123');
    });

    it('returns null product_ref if no capture group in pattern', () => {
        const path = '/p/blue-sneakers-123';
        const pageTypes = [[/\/p\//i, 'PDP']];
        const pageInfo = inferPageType(path, pageTypes);
        
        expect(pageInfo.type).toBe('PDP');
        expect(pageInfo.product_ref).toBeNull();
    });

    it('deduplicates product_refs in state', async () => {
        // We need to trigger emitPageView implicitly via setup or test it directly if exported
        // Since setupNavigationTracking is async and emits initial page view, let's test a mock emission
        
        const { emitPageView } = await import('../../src/collectors/navigation.js');
        const { createSanitizer } = await import('../../src/utils/sanitizers.js');
        mockState.sanitizer = createSanitizer();
        
        const pageInfo = { type: 'PDP', product_ref: 'item-1' };
        
        // First view
        // @ts-expect-error - internal method
        await emitPageView(mockState, pageInfo, 'direct', null);
        expect(mockState.productRefs).toEqual(['item-1']);
        
        // Second view of same item
        // @ts-expect-error - internal method
        await emitPageView(mockState, pageInfo, 'internal', 'PDP');
        expect(mockState.productRefs).toEqual(['item-1']);
        
        // Third view of different item
        const pageInfo2 = { type: 'PDP', product_ref: 'item-2' };
        // @ts-expect-error - internal method
        await emitPageView(mockState, pageInfo2, 'internal', 'PDP');
        expect(mockState.productRefs).toEqual(['item-1', 'item-2']);
    });

    it('redacts PII from product_ref', async () => {
        const { emitPageView } = await import('../../src/collectors/navigation.js');
        const { createSanitizer } = await import('../../src/utils/sanitizers.js');
        mockState.sanitizer = createSanitizer();

        const pageInfo = { type: 'PDP', product_ref: 'user@example.com' };
        
        // @ts-expect-error - internal method
        await emitPageView(mockState, pageInfo, 'direct', null);
        expect(mockState.productRefs).toEqual(['[EMAIL_REDACTED]']);
        
        const lastCall = mockState.capture.mock.calls[0][0];
        expect(lastCall.metadata.product_ref).toBe('[EMAIL_REDACTED]');
    });
});

describe('Campaign Entry Tracking (PUL-003)', () => {
    let mockState;
    let setupNavigationTracking;

    beforeEach(async () => {
        mockState = {
            config: {
                pageTypes: [],
                enabled: true,
                isInitialized: true
            },
            capture: vi.fn().mockResolvedValue('event-123'),
            pageCount: 0,
            sanitizer: {
                sanitizeUrl: (url) => url,
                redactPII: (val) => val
            }
        };

        const nav = await import('../../src/collectors/navigation.js');
        setupNavigationTracking = nav.setupNavigationTracking;

        // Reset window.location
        delete window.location;
        window.location = {
            pathname: '/',
            href: 'https://example.com/',
            search: ''
        };
    });

    it('captures utm parameters and default click IDs correctly', async () => {
        window.location.search = '?utm_source=newsletter&gclid=12345';

        setupNavigationTracking(mockState);
        // Wait for async execution
        await new Promise(resolve => setTimeout(resolve, 0));

        // Find the CAMPAIGN_ENTRY call
        const campaignCall = mockState.capture.mock.calls.find(call => call[0].event_type === 'CAMPAIGN_ENTRY');
        expect(campaignCall).toBeDefined();

        const payload = campaignCall[0];
        expect(payload.metadata.utm_source).toBe('newsletter');
        expect(payload.metadata.gclid).toBe('12345');
        expect(mockState.entryCampaignSource).toBe('newsletter');
    });

    it('truncates values exceeding 128 characters', async () => {
        const longValue = 'a'.repeat(150);
        window.location.search = `?gclid=${longValue}`;

        setupNavigationTracking(mockState);
        await new Promise(resolve => setTimeout(resolve, 0));

        const campaignCall = mockState.capture.mock.calls.find(call => call[0].event_type === 'CAMPAIGN_ENTRY');
        expect(campaignCall[0].metadata.gclid.length).toBe(128);
        expect(campaignCall[0].metadata.gclid).toBe('a'.repeat(128));
    });

    it('classifies entryCampaignSource as social when fbclid is present', async () => {
        window.location.search = '?fbclid=abc_social';

        setupNavigationTracking(mockState);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockState.entryCampaignSource).toBe('social');
    });

    it('classifies entryCampaignSource as affiliate when irclickid is present', async () => {
        window.location.search = '?irclickid=abc_affiliate';

        setupNavigationTracking(mockState);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockState.entryCampaignSource).toBe('affiliate');
    });

    it('defaults entryCampaignSource to paid when no match is found but param exists', async () => {
        window.location.search = '?utm_medium=cpc';

        setupNavigationTracking(mockState);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockState.entryCampaignSource).toBe('paid');
    });

    it('links CAMPAIGN_ENTRY to firstPageViewEventId if available', async () => {
        window.location.search = '?utm_source=google';

        setupNavigationTracking(mockState);
        await new Promise(resolve => setTimeout(resolve, 0));

        const campaignCall = mockState.capture.mock.calls.find(call => call[0].event_type === 'CAMPAIGN_ENTRY');
        expect(campaignCall[0].caused_by).toBe('event-123');
        expect(campaignCall[0].edge_hint).toBe('caused');
    });

    it('does not capture unknown parameters', async () => {
        window.location.search = '?unknown_param=true&gclid=123';

        setupNavigationTracking(mockState);
        await new Promise(resolve => setTimeout(resolve, 0));

        const campaignCall = mockState.capture.mock.calls.find(call => call[0].event_type === 'CAMPAIGN_ENTRY');
        expect(campaignCall[0].metadata.unknown_param).toBeUndefined();
        expect(campaignCall[0].metadata.gclid).toBe('123');
    });

    it('emits no event for empty search string', async () => {
        window.location.search = '';

        setupNavigationTracking(mockState);
        await new Promise(resolve => setTimeout(resolve, 0));

        const campaignCall = mockState.capture.mock.calls.find(call => call[0].event_type === 'CAMPAIGN_ENTRY');
        expect(campaignCall).toBeUndefined();
    });

    it('classifyReferrer returns campaign for known click ids', async () => {
        // Need to extract the non-exported classifyReferrer method, but we can test the PAGE_VIEW referrer_type
        window.location.search = '?irclickid=123';

        setupNavigationTracking(mockState);
        await new Promise(resolve => setTimeout(resolve, 0));

        const pageViewCall = mockState.capture.mock.calls.find(call => call[0].event_type === 'PAGE_VIEW');
        expect(pageViewCall[0].metadata.referrer_type).toBe('campaign');
    });
});
