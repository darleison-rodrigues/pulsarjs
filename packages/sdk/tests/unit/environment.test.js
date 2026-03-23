import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureEnvironment, extractCampaigns, _resetCachedEnvironment } from '../../src/utils/environment.js';

describe('captureEnvironment', () => {
    beforeEach(() => {
        _resetCachedEnvironment();
        vi.stubGlobal('performance', {
            now: vi.fn().mockReturnValue(123.456)
        });

        // Mock window properties
        vi.stubGlobal('window', {
            screen: {
                width: 1920,
                height: 1080
            },
            innerWidth: 1000,
            outerWidth: 1000,
            innerHeight: 800,
            outerHeight: 800
        });

        vi.stubGlobal('Intl', {
            DateTimeFormat: () => ({
                resolvedOptions: () => ({
                    timeZone: 'UTC'
                })
            })
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('captures environment details correctly', () => {
        const env = captureEnvironment();
        expect(env.time_since_load_ms).toBe(123);
        expect(env.screen_resolution).toBe('1920x1080');
        expect(env.timezone).toBe('UTC');
        expect(env.is_devtools_open).toBe(false);
    });

    it('detects when devtools are open (horizontal)', () => {
        vi.stubGlobal('window', {
            screen: { width: 1920, height: 1080 },
            innerWidth: 800,
            outerWidth: 1000,
            innerHeight: 800,
            outerHeight: 800
        });
        const env = captureEnvironment();
        expect(env.is_devtools_open).toBe(true);
    });

    it('detects when devtools are open (vertical)', () => {
        vi.stubGlobal('window', {
            screen: { width: 1920, height: 1080 },
            innerWidth: 1000,
            outerWidth: 1000,
            innerHeight: 600,
            outerHeight: 800
        });
        const env = captureEnvironment();
        expect(env.is_devtools_open).toBe(true);
    });

    it('handles missing performance global', () => {
        vi.stubGlobal('performance', undefined);
        const env = captureEnvironment();
        expect(env.time_since_load_ms).toBe(0);
    });

    it('handles missing window.screen', () => {
        vi.stubGlobal('window', {
            screen: undefined,
            innerWidth: 1000,
            outerWidth: 1000,
            innerHeight: 800,
            outerHeight: 800
        });
        const env = captureEnvironment();
        expect(env.screen_resolution).toBe('unknown');
    });

    it('handles missing Intl global', () => {
        vi.stubGlobal('Intl', undefined);
        const env = captureEnvironment();
        expect(env.timezone).toBe('unknown');
    });
});

describe('extractCampaigns', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns null when window.location.search is empty', () => {
        vi.stubGlobal('window', { location: { search: '' } });
        expect(extractCampaigns()).toBeNull();
    });

    it('returns null when window is not defined (throws error)', () => {
        vi.stubGlobal('window', undefined);
        expect(extractCampaigns()).toBeNull();
    });

    it('returns null when no campaign keys are present', () => {
        vi.stubGlobal('window', { location: { search: '?other=123&test=abc' } });
        expect(extractCampaigns()).toBeNull();
    });

    it('extracts valid campaign keys correctly', () => {
        vi.stubGlobal('window', {
            location: { search: '?utm_source=google&utm_medium=cpc&utm_campaign=summer_sale&gclid=12345&fbclid=abcde&msclkid=xyz' }
        });
        const campaigns = extractCampaigns();
        expect(campaigns).toEqual({
            utm_source: 'google',
            utm_medium: 'cpc',
            utm_campaign: 'summer_sale',
            gclid: '12345',
            fbclid: 'abcde',
            msclkid: 'xyz'
        });
    });

    it('ignores non-campaign keys', () => {
        vi.stubGlobal('window', {
            location: { search: '?utm_source=newsletter&ignore_me=true&another_param=123' }
        });
        const campaigns = extractCampaigns();
        expect(campaigns).toEqual({
            utm_source: 'newsletter'
        });
    });

    it('handles malformed URL search strings gracefully', () => {
        vi.stubGlobal('window', { location: { search: '?%malformed=string&utm_source=valid' } });
        const campaigns = extractCampaigns();
        expect(campaigns).toEqual({
            utm_source: 'valid'
        });
    });
});
