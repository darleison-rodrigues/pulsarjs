import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupFetchInterceptor } from '../../../src/collectors/network.js';
import * as SanitizersModule from '../../../src/utils/sanitizers.js';

const { Sanitizers } = SanitizersModule;

describe('setupFetchInterceptor', () => {
    let mockState;
    let originalFetch;

    beforeEach(() => {
        originalFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            url: 'https://api.example.com/data'
        });
        vi.stubGlobal('fetch', originalFetch);

        mockState = {
            config: {
                endpoint: 'https://ingest.pulsar.test/v1/events',
                endpointFilter: /^https:\/\/api\.example\.com/,
                slowApiThreshold: 1000,
                commerceActions: [
                    { pattern: /checkout/i, method: 'POST', action: 'checkout' }
                ],
                debug: false
            },
            capture: vi.fn().mockResolvedValue('test-event-id'),
            lastFailedCommerceAction: {},
            lastCommerceEventId: null,
            lastCommerceAction: null
        };

        let time = 100;
        vi.stubGlobal('performance', {
            now: vi.fn(() => { time += 50; return time; })
        });

        Sanitizers._resetPiiPatterns();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should do nothing if window.fetch is not defined', () => {
        vi.stubGlobal('fetch', undefined);
        setupFetchInterceptor(mockState);
        expect(mockState.originalFetch).toBeUndefined();
    });

    it('should override window.fetch if present', () => {
        setupFetchInterceptor(mockState);
        expect(mockState.originalFetch).toBe(originalFetch);
        expect(window.fetch).not.toBe(originalFetch);
    });

    it('should call original fetch and return response', async () => {
        setupFetchInterceptor(mockState);
        const response = await window.fetch('https://api.example.com/data');

        expect(originalFetch).toHaveBeenCalledWith('https://api.example.com/data');
        expect(response.status).toBe(200);
        expect(mockState.capture).not.toHaveBeenCalled();
    });

    it('should bypass internal route requests (endpoint)', async () => {
        setupFetchInterceptor(mockState);
        await window.fetch('https://ingest.pulsar.test/v1/events');

        expect(originalFetch).toHaveBeenCalledWith('https://ingest.pulsar.test/v1/events');
        expect(mockState.capture).not.toHaveBeenCalled();
    });

    it('should bypass non-monitored routes', async () => {
        setupFetchInterceptor(mockState);
        await window.fetch('https://other-domain.com/data');

        expect(originalFetch).toHaveBeenCalledWith('https://other-domain.com/data');
        expect(mockState.capture).not.toHaveBeenCalled();
    });

    it('should capture NETWORK_ERROR if fetch throws an error', async () => {
        const error = new Error('Failed to fetch');
        originalFetch.mockRejectedValue(error);
        setupFetchInterceptor(mockState);

        await expect(window.fetch('https://api.example.com/data', { method: 'GET' })).rejects.toThrow('Failed to fetch');

        expect(mockState.capture).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'NETWORK_ERROR',
            message: 'Failed to fetch',
            metadata: expect.objectContaining({
                endpoint: 'https://api.example.com/data',
                method: 'GET'
            }),
            severity: 'error',
            is_blocking: true
        }));

        // Ensure processedErrors Set is created and prevents duplicate capture
        expect(mockState.processedErrors.has(error)).toBe(true);
        await expect(window.fetch('https://api.example.com/data', { method: 'GET' })).rejects.toThrow('Failed to fetch');
        expect(mockState.capture).toHaveBeenCalledTimes(1);
    });

    it('should capture API_FAILURE on non-ok HTTP status', async () => {
        originalFetch.mockResolvedValue({
            ok: false,
            status: 404,
            url: 'https://api.example.com/data'
        });
        setupFetchInterceptor(mockState);

        await window.fetch('https://api.example.com/data', { method: 'GET' });

        expect(mockState.capture).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'API_FAILURE',
            message: 'API HTTP 404: https://api.example.com/data',
            severity: 'warning',
            metadata: expect.objectContaining({
                status: 404,
                endpoint: 'https://api.example.com/data',
                method: 'GET'
            })
        }));
    });

    it('should set severity to error for 500+ status codes', async () => {
        originalFetch.mockResolvedValue({
            ok: false,
            status: 500,
            url: 'https://api.example.com/data'
        });
        setupFetchInterceptor(mockState);

        await window.fetch('https://api.example.com/data');

        expect(mockState.capture).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'API_FAILURE',
            severity: 'error'
        }));
    });

    it('should capture COMMERCE_ACTION on matched commerce API calls', async () => {
        setupFetchInterceptor(mockState);

        await window.fetch('https://api.example.com/checkout', { method: 'POST' });

        expect(mockState.capture).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'COMMERCE_ACTION',
            message: 'Commerce: checkout',
            severity: 'info',
            metadata: expect.objectContaining({
                action: 'checkout',
                endpoint: 'https://api.example.com/checkout',
                method: 'POST'
            })
        }));
        expect(mockState.lastCommerceEventId).toBe('test-event-id');
        expect(mockState.lastCommerceAction).toEqual({ action: 'checkout', event_id: 'test-event-id' });
    });

    it('should capture API_LATENCY if duration exceeds slowApiThreshold', async () => {
        // Adjust performance mock so duration is > 1000
        vi.stubGlobal('performance', {
            now: vi.fn()
                .mockReturnValueOnce(100) // startTime
                .mockReturnValueOnce(1200) // endTime (duration = 1100)
        });

        setupFetchInterceptor(mockState);
        await window.fetch('https://api.example.com/data', { method: 'GET' });

        expect(mockState.capture).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'API_LATENCY',
            message: 'Slow API: https://api.example.com/data',
            severity: 'info',
            metadata: expect.objectContaining({
                endpoint: 'https://api.example.com/data',
                method: 'GET',
                duration_ms: 1100
            })
        }));
    });

    it('should redact PII in response_snippet from request body on API failure', async () => {
        originalFetch.mockResolvedValue({
            ok: false,
            status: 400,
            url: 'https://api.example.com/data'
        });
        setupFetchInterceptor(mockState);

        const body = JSON.stringify({ email: 'test@example.com', name: 'John Doe' });
        await window.fetch('https://api.example.com/data', { method: 'POST', body });

        expect(mockState.capture).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'API_FAILURE',
            response_snippet: '{"email":"[EMAIL_REDACTED]","name":"John Doe"}'
        }));
    });

    it('should correctly extract URL if args[0] is a Request object', async () => {
        setupFetchInterceptor(mockState);

        const requestMock = { url: 'https://api.example.com/data' };
        await window.fetch(requestMock, { method: 'GET' });

        expect(originalFetch).toHaveBeenCalledWith(requestMock, { method: 'GET' });
    });

    it('should correctly establish blocked_by edge hint', async () => {
        originalFetch.mockResolvedValue({
            ok: false,
            status: 500,
            url: 'https://api.example.com/checkout'
        });
        mockState.lastCommerceEventId = 'prev-commerce-id';
        setupFetchInterceptor(mockState);

        await window.fetch('https://api.example.com/checkout', { method: 'POST' });

        expect(mockState.capture).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'API_FAILURE',
            caused_by: 'prev-commerce-id',
            edge_hint: 'blocked_by'
        }));

        expect(mockState.lastFailedCommerceAction['checkout']).toEqual({ event_id: 'test-event-id' });
    });

    it('should correctly establish retried_after edge hint', async () => {
        mockState.lastFailedCommerceAction['checkout'] = { event_id: 'failed-commerce-id' };
        setupFetchInterceptor(mockState);

        await window.fetch('https://api.example.com/checkout', { method: 'POST' });

        expect(mockState.capture).toHaveBeenCalledWith(expect.objectContaining({
            event_type: 'COMMERCE_ACTION',
            caused_by: 'failed-commerce-id',
            edge_hint: 'retried_after'
        }));

        expect(mockState.lastFailedCommerceAction['checkout']).toBeUndefined();
    });

    it('should correctly establish degraded_by edge hint', async () => {
        vi.stubGlobal('performance', {
            now: vi.fn()
                .mockReturnValueOnce(100) // startTime
                .mockReturnValueOnce(1200) // endTime (duration = 1100)
        });
        setupFetchInterceptor(mockState);

        await window.fetch('https://api.example.com/checkout', { method: 'POST' });

        // This should capture both COMMERCE_ACTION and API_LATENCY
        expect(mockState.capture).toHaveBeenCalledTimes(2);

        expect(mockState.capture).toHaveBeenNthCalledWith(1, expect.objectContaining({
            event_type: 'COMMERCE_ACTION'
        }));

        expect(mockState.capture).toHaveBeenNthCalledWith(2, expect.objectContaining({
            event_type: 'API_LATENCY',
            caused_by: 'test-event-id', // the mocked response of capture
            edge_hint: 'degraded_by'
        }));
    });

    it('should recover gracefully if URL extraction fails', async () => {
        setupFetchInterceptor(mockState);

        // passing an object that throws when accessing url
        const badRequest = Object.defineProperty({}, 'url', {
            get() { throw new Error('Cannot access url'); }
        });

        await window.fetch(badRequest);

        // Should proceed silently using original fetch
        expect(originalFetch).toHaveBeenCalled();
        expect(mockState.capture).not.toHaveBeenCalled();
    });

});
