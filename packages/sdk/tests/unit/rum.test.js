import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupPerformanceObserver, resetWebVitals, webVitals } from '../../src/collectors/rum.js';

describe('RUM Collector', () => {
    let mockState;
    let observerCallbacks = {};
    let originalPerformanceObserver;

    beforeEach(() => {
        resetWebVitals();

        mockState = {
            config: { debug: false, clientId: 'test-client', storefrontType: 'custom', siteId: 'site-1' },
            sessionID: 'sess-123',
            enabled: true,
            isInitialized: true,
            queue: [],
            flush: vi.fn(),
            extractPlatformContext: vi.fn(() => ({})),
            captureEnvironment: vi.fn(() => ({})),
            nextEventId: vi.fn(() => 'sess-123:1')
        };

        // Mock PerformanceObserver
        originalPerformanceObserver = global.PerformanceObserver;
        global.PerformanceObserver = class {
            constructor(callback) {
                this.callback = callback;
            }
            observe(options) {
                observerCallbacks[options.type] = this.callback;
            }
        };

        // Mock addEventListener for routing and load
        vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
    });

    afterEach(() => {
        global.PerformanceObserver = originalPerformanceObserver;
        vi.restoreAllMocks();
        observerCallbacks = {};
    });

    it('should accumulate CLS correctly into webVitals', () => {
        setupPerformanceObserver(mockState);
        expect(observerCallbacks['layout-shift']).toBeDefined();

        const entryList = {
            getEntries: () => [
                { hadRecentInput: false, value: 0.1 },
                { hadRecentInput: true, value: 0.5 }, // ignored
                { hadRecentInput: false, value: 0.2 }
            ]
        };

        observerCallbacks['layout-shift'](entryList);

        expect(webVitals.cls).toBeCloseTo(0.3);
    });

    it('should set INP correctly into webVitals', () => {
        setupPerformanceObserver(mockState);
        expect(observerCallbacks['event']).toBeDefined();

        const entryList = {
            getEntries: () => [
                { interactionId: 1, duration: 50 },
                { interactionId: 2, duration: 120 },
                { interactionId: 3, duration: 30 }
            ]
        };

        observerCallbacks['event'](entryList);

        expect(webVitals.inp).toBe(120);
        expect(webVitals.inp_interaction_id).toBe(2);
    });

    it('resetWebVitals should zero out all metrics', () => {
        webVitals.lcp = 1500;
        webVitals.inp = 100;
        webVitals.cls = 0.5;

        resetWebVitals();

        expect(webVitals.lcp).toBeNull();
        expect(webVitals.inp).toBeNull();
        expect(webVitals.cls).toBe(0);
        expect(webVitals.inp_interaction_id).toBeNull();
    });
});
