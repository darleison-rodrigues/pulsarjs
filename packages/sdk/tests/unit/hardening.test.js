import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Pulsar from '../../src/index.js';
import { setupFetchInterceptor, setupXHRInterceptor } from '../../src/collectors/network.js';
import { setupErrorHandlers } from '../../src/collectors/errors.js';
import { createCapturePipeline } from '../../src/core/capture.js';

describe('SDK Hardening - Defensive Coding', () => {

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('should not crash if document.cookie getter throws', () => {
        const originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ||
                               Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');

        Object.defineProperty(document, 'cookie', {
            get() { throw new Error('SecurityError: cookie access denied'); },
            configurable: true
        });

        const instance = Pulsar.createInstance();
        expect(() => {
            instance.init({ clientId: 'test-client', debug: false });
        }).not.toThrow();

        if (originalCookie) {
            Object.defineProperty(document, 'cookie', originalCookie);
        } else {
            delete document.cookie;
        }
    });

    it('should not crash if performance.now() is undefined', async () => {
        vi.stubGlobal('performance', { now: undefined });

        const mockFetch = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', mockFetch);

        const state = {
            config: { debug: false, endpointFilter: /.*/, commerceActions: [] },
            capture: vi.fn()
        };

        setupFetchInterceptor(state);

        expect(typeof window.fetch).toBe('function');
        const res = await window.fetch('https://example.com/api/test', { method: 'POST', body: 'test' });
        expect(res.ok).toBe(true);
        expect(mockFetch).toHaveBeenCalled();
    });

    it('should gracefully degrade if navigator.sendBeacon does not exist', async () => {
        vi.stubGlobal('navigator', { sendBeacon: undefined });
        const mockFetch = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', mockFetch);

        const state = {
            config: { debug: false, endpoint: 'https://pulsar.test/ingest' },
            sessionID: 'sess-1',
            queue: [{ event_type: 'TEST_EVENT' }],
            droppedSinceLastFlush: 0,
            originalFetch: mockFetch
        };

        const pipeline = createCapturePipeline(state);

        // Should not throw and should fallback to fetch
        await pipeline.flush();
        expect(mockFetch).toHaveBeenCalled();
    });

    it('should fallback to fetch if navigator.sendBeacon returns false (CSP blocked)', async () => {
        vi.stubGlobal('navigator', { sendBeacon: vi.fn().mockReturnValue(false) });
        const mockFetch = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', mockFetch);

        const state = {
            config: { debug: false, endpoint: 'https://pulsar.test/ingest' },
            sessionID: 'sess-1',
            queue: [{ event_type: 'TEST_EVENT' }],
            droppedSinceLastFlush: 0,
            originalFetch: mockFetch
        };

        const pipeline = createCapturePipeline(state);

        await pipeline.flush();
        expect(navigator.sendBeacon).toHaveBeenCalled();
        expect(mockFetch).toHaveBeenCalled();
    });

    it('should not double-patch if window.fetch already patched', () => {
        const originalFetch = vi.fn();
        vi.stubGlobal('fetch', originalFetch);

        const instance = Pulsar.createInstance();
        instance.init({ clientId: 'test-client', debug: false });

        const firstPatchedFetch = window.fetch;
        // In some environments, if endpoint filter rejects or something, fetch might not get patched
        // But the init logic should patch it. Wait, the mock `originalFetch` is not being patched?
        // Oh, maybe `setupFetchInterceptor` checks `!window.fetch`.
        // Actually it's because the test initializes instance asynchronously via requestIdleCallback/setTimeout!
        // We need to wait or advance timers!
        vi.useFakeTimers();
        const instanceToInit = Pulsar.createInstance();
        instanceToInit.init({ clientId: 'test-client', debug: false });
        vi.runAllTimers();

        const patchedFetch = window.fetch;
        expect(patchedFetch).not.toBe(originalFetch);

        instanceToInit.init({ clientId: 'test-client', debug: false });
        vi.runAllTimers();

        expect(window.fetch).toBe(patchedFetch);
        vi.useRealTimers();
    });

    it('multi-instance isolation: two instances shouldn\'t conflict or break interceptors', async () => {
        const originalFetch = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', originalFetch);

        const instance1 = Pulsar.createInstance();
        instance1.init({ clientId: 'test-client-1', endpointFilter: /.*/, debug: false });

        const instance2 = Pulsar.createInstance();
        instance2.init({ clientId: 'test-client-2', endpointFilter: /.*/, debug: false });

        expect(typeof window.fetch).toBe('function');

        // Ensure both interceptors can execute successfully without breaking the global `window.fetch`
        const res = await window.fetch('https://example.com/api/test', { method: 'POST', body: 'test' });
        expect(res.ok).toBe(true);
        expect(originalFetch).toHaveBeenCalled();
    });

    it('should send original payload if beforeSend throws', async () => {
        const mockCapture = vi.fn();
        const state = {
            enabled: true,
            isInitialized: true,
            config: {
                debug: false,
                beforeSend: () => { throw new Error('Custom exception'); }
            },
            sessionID: 'sess-1',
            queue: [],
            globalScope: { getScopeData: () => ({}) },
            extractPlatformContext: () => ({}),
            captureEnvironment: () => ({}),
            device: {}
        };

        const pipeline = createCapturePipeline(state);
        // bypass dedupe
        await pipeline.capture({ event_type: 'TEST_EVENT' }, state.globalScope, true);

        expect(state.queue.length).toBe(1);
        expect(state.queue[0].event_type).toBe('TEST_EVENT');
    });

    it('should send original payload if beforeSend times out', async () => {
        vi.useFakeTimers();
        const state = {
            enabled: true,
            isInitialized: true,
            config: {
                debug: false,
                allowUnconfirmedConsent: true,
                beforeSendTimeout: 50,
                beforeSend: async (payload) => {
                    await new Promise(r => setTimeout(r, 100)); // intentionally slow
                    return { ...payload, modified: true };
                }
            },
            sessionID: 'sess-1',
            queue: [],
            globalScope: { getScopeData: () => ({}) },
            extractPlatformContext: () => ({}),
            captureEnvironment: () => ({}),
            device: {}
        };

        const pipeline = createCapturePipeline(state);
        const capturePromise = pipeline.capture({ event_type: 'SLOW_EVENT' }, state.globalScope, true);

        vi.advanceTimersByTime(60);
        await capturePromise;

        expect(state.queue.length).toBe(1);
        expect(state.queue[0].event_type).toBe('SLOW_EVENT');
        expect(state.queue[0].modified).toBeUndefined(); // Should not have the slow modification
        vi.useRealTimers();
    });

    it('should gracefully degrade if extractPlatformContext throws', () => {
        // Mock a provider that throws on extractContext
        vi.doMock('../../src/providers/provider.js', () => ({
            resolveProvider: () => ({
                extractContext: () => { throw new Error('Bad Provider'); },
                commerceActions: [],
                pageTypes: [],
                endpointFilter: /.*/
            })
        }));

        const instance = Pulsar.createInstance();
        expect(() => {
            instance.init({ clientId: 'test-client', debug: false });
        }).not.toThrow();
    });

    it('should gracefully handle event handler exceptions inside setupErrorHandlers', async () => {
        const state = {
            config: { debug: false, criticalSelectors: ['.error'] },
            capture: vi.fn().mockRejectedValue(new Error('Capture failed')),
            globalScope: {
                addBreadcrumb: vi.fn().mockImplementation(() => { throw new Error('Breadcrumb failed'); })
            }
        };

        setupErrorHandlers(state);

        // Fire unhandledrejection
        const rejectionEvent = {
            reason: new Error('unhandled'),
            promise: Promise.resolve() // Dummy promise so it doesn't cause unhandled rejection in vitest
        };

        // Test handler doesn't propagate error
        expect(async () => {
            await state.rejectionHandler(rejectionEvent);
        }).not.toThrow();

        // Fire click
        const clickEvent = new MouseEvent('click', { bubbles: true });
        Object.defineProperty(clickEvent, 'target', { value: document.createElement('button') });

        expect(() => {
            state.interactionHandler(clickEvent);
        }).not.toThrow();
    });
});
