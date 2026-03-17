import { describe, it, expect, vi } from 'vitest';
import { hash, createCapturePipeline } from '../../src/core/capture.js';

describe('Pulsar Capture Pipeline', () => {
    // ... existing hash tests ...

    it('hash produces consistent output for identical strings', () => {
        const a = hash('PAGE_VIEW|Home|/home');
        const b = hash('PAGE_VIEW|Home|/home');
        expect(a).toBe(b);
    });

    it('hash produces different output for different strings', () => {
        const a = hash('PAGE_VIEW|Home|/home');
        const b = hash('JS_CRASH|TypeError|/checkout');
        expect(a).not.toBe(b);
    });

    it('hash returns a string', () => {
        expect(typeof hash('test')).toBe('string');
    });

    it('includes product_refs in batch and resets them after flush', async () => {
        const mockState = {
            enabled: true,
            isInitialized: true,
            config: { endpoint: 'https://pulsar.test/ingest', clientId: 'test-client' },
            sessionID: 'sess-123',
            queue: [{ event_type: 'PAGE_VIEW' }],
            productRefs: ['prod-1', 'prod-2'],
            droppedEventsCount: 0,
            droppedSinceLastFlush: 0,
            extractPlatformContext: () => ({}),
            captureEnvironment: () => ({}),
            device: {}
        };

        const pipeline = createCapturePipeline(mockState);
        
        // Mock sendBeacon
        const sendBeaconSpy = vi.fn().mockReturnValue(true);
        vi.stubGlobal('navigator', { sendBeacon: sendBeaconSpy });

        // @ts-expect-error - internal method - pipeline.flush is technically private/internal
        await pipeline.flush();

        expect(sendBeaconSpy).toHaveBeenCalled();
        const blob = sendBeaconSpy.mock.calls[0][1];
        const batch = JSON.parse(await blob.text());
        
        expect(batch.product_refs).toEqual(['prod-1', 'prod-2']);
        expect(mockState.productRefs).toEqual([]);
    });

    it('includes product_refs in flushOnHide', async () => {
        const mockState = {
            config: { endpoint: 'https://pulsar.test/ingest', clientId: 'test-client' },
            queue: [{ event_type: 'PAGE_VIEW' }],
            productRefs: ['prod-3'],
            droppedEventsCount: 0,
            droppedSinceLastFlush: 0
        };

        const pipeline = createCapturePipeline(mockState);
        
        const sendBeaconSpy = vi.fn().mockReturnValue(true);
        vi.stubGlobal('navigator', { sendBeacon: sendBeaconSpy });

        pipeline.flushOnHide();

        expect(sendBeaconSpy).toHaveBeenCalled();
        const blob = sendBeaconSpy.mock.calls[0][1];
        const batch = JSON.parse(await blob.text());
        
        expect(batch.product_refs).toEqual(['prod-3']);
        expect(mockState.productRefs).toEqual([]);
    });
});
