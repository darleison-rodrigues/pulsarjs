import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeDeviceCohort, collectDeviceHints, buildDeviceInfo } from '../../src/utils/device.js';

describe('computeDeviceCohort', () => {
    beforeEach(() => {
        // Standard global mocks
        vi.stubGlobal('window', {
            screen: { width: 1920, height: 1080 }
        });

        vi.stubGlobal('navigator', {
            hardwareConcurrency: 8,
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        });

        vi.stubGlobal('Intl', {
            DateTimeFormat: () => ({
                resolvedOptions: () => ({
                    timeZone: 'America/New_York'
                })
            })
        });

        // Mock WebGL context
        const mockGetExtension = vi.fn().mockImplementation((ext) => {
            if (ext === 'WEBGL_debug_renderer_info') {
                return { UNMASKED_RENDERER_WEBGL: 37446 };
            }
            if (ext === 'WEBGL_lose_context') {
                return { loseContext: vi.fn() };
            }
            return null;
        });

        const mockGetParameter = vi.fn().mockImplementation((param) => {
            if (param === 37446) return 'Apple M2';
            return null;
        });

        const mockGetContext = vi.fn().mockImplementation((type) => {
            if (type === 'webgl' || type === 'experimental-webgl') {
                return {
                    getExtension: mockGetExtension,
                    getParameter: mockGetParameter
                };
            }
            return null;
        });

        vi.stubGlobal('document', {
            createElement: vi.fn().mockImplementation((tag) => {
                if (tag === 'canvas') {
                    return { getContext: mockGetContext };
                }
                return {};
            })
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('computes a deterministic hash with all signals present', () => {
        const hash1 = computeDeviceCohort();
        const hash2 = computeDeviceCohort();
        expect(hash1).toBeDefined();
        expect(typeof hash1).toBe('string');
        expect(hash1).toBe(hash2); // Should be deterministic

        // Let's also verify it hashes correctly manually using the logic in core/capture if possible,
        // or just verify it doesn't return empty string
        expect(hash1.length).toBeGreaterThan(0);
    });

    it('handles missing window.screen', () => {
        vi.stubGlobal('window', { screen: undefined });
        const hash = computeDeviceCohort();
        expect(typeof hash).toBe('string');
    });

    it('handles missing navigator.hardwareConcurrency', () => {
        vi.stubGlobal('navigator', { hardwareConcurrency: undefined, userAgent: 'test' });
        const hash = computeDeviceCohort();
        expect(typeof hash).toBe('string');
    });

    it('handles missing Intl', () => {
        vi.stubGlobal('Intl', undefined);
        const hash = computeDeviceCohort();
        expect(typeof hash).toBe('string');
    });

    it('handles missing WebGL context', () => {
        vi.stubGlobal('document', {
            createElement: vi.fn().mockImplementation(() => ({
                getContext: () => null
            }))
        });
        const hash = computeDeviceCohort();
        expect(typeof hash).toBe('string');
    });

    it('handles exceptions during WebGL canvas creation', () => {
        vi.stubGlobal('document', {
            createElement: vi.fn().mockImplementation(() => {
                throw new Error('Canvas not supported');
            })
        });
        const hash = computeDeviceCohort();
        expect(typeof hash).toBe('string');
    });
});

describe('collectDeviceHints', () => {
    beforeEach(() => {
        vi.stubGlobal('navigator', {
            deviceMemory: 8,
            userAgentData: {
                platform: 'macOS',
                mobile: false
            }
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('collects hints when available', () => {
        const hints = collectDeviceHints();
        expect(hints).toEqual({
            device_memory: 8,
            ua_platform: 'macOS',
            ua_mobile: false
        });
    });

    it('returns null when hints are unavailable', () => {
        vi.stubGlobal('navigator', {
            deviceMemory: undefined,
            userAgentData: undefined
        });
        const hints = collectDeviceHints();
        expect(hints).toBeNull();
    });

    it('handles partial hints (only memory)', () => {
        vi.stubGlobal('navigator', {
            deviceMemory: 4,
            userAgentData: undefined
        });
        const hints = collectDeviceHints();
        expect(hints).toEqual({
            device_memory: 4,
            ua_platform: null,
            ua_mobile: null
        });
    });

    it('handles partial hints (only ua data)', () => {
        vi.stubGlobal('navigator', {
            deviceMemory: undefined,
            userAgentData: {
                platform: 'Windows',
                mobile: false
            }
        });
        const hints = collectDeviceHints();
        expect(hints).toEqual({
            device_memory: null,
            ua_platform: 'Windows',
            ua_mobile: false
        });
    });
});

describe('buildDeviceInfo', () => {
    beforeEach(() => {
        vi.stubGlobal('window', {
            screen: { width: 1920, height: 1080 }
        });
        vi.stubGlobal('navigator', {
            hardwareConcurrency: 8,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            deviceMemory: 16,
            userAgentData: { platform: 'Windows', mobile: false }
        });
        vi.stubGlobal('Intl', {
            DateTimeFormat: () => ({
                resolvedOptions: () => ({ timeZone: 'UTC' })
            })
        });
        vi.stubGlobal('document', {
            createElement: vi.fn().mockImplementation(() => ({
                getContext: () => null
            }))
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('builds full device info for desktop', () => {
        const info = buildDeviceInfo();
        expect(info.device_type).toBe('desktop');
        expect(info.device_cohort).toBeDefined();
        expect(typeof info.device_cohort).toBe('string');
        expect(info.hints).toEqual({
            device_memory: 16,
            ua_platform: 'Windows',
            ua_mobile: false
        });
    });

    it('detects mobile device type from user agent', () => {
        vi.stubGlobal('navigator', {
            hardwareConcurrency: 4,
            userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36',
            deviceMemory: 4,
            userAgentData: { platform: 'Android', mobile: true }
        });
        const info = buildDeviceInfo();
        expect(info.device_type).toBe('mobile');
    });

    it('detects iPhone mobile device type', () => {
        vi.stubGlobal('navigator', {
            hardwareConcurrency: 4,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1',
            deviceMemory: undefined,
            userAgentData: undefined
        });
        const info = buildDeviceInfo();
        expect(info.device_type).toBe('mobile');
        expect(info.hints).toBeNull();
    });
});