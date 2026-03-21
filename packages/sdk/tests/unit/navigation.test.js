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
