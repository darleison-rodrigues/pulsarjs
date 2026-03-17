import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureEnvironment } from '../../src/utils/environment.js';

describe('captureEnvironment', () => {
    beforeEach(() => {
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
