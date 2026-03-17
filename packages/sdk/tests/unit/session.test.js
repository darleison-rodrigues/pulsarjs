import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSessionID } from '../../src/core/session.js';

describe('generateSessionID', () => {
    let consoleWarnSpy;

    beforeEach(() => {
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        consoleWarnSpy.mockRestore();
    });

    it('returns crypto.randomUUID when available', () => {
        vi.stubGlobal('crypto', {
            randomUUID: () => 'mocked-uuid'
        });

        const id = generateSessionID();
        expect(id).toBe('mocked-uuid');
        expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('returns uuid generated using crypto.getRandomValues when randomUUID is unavailable', () => {
        vi.stubGlobal('crypto', {
            randomUUID: undefined,
            getRandomValues: (array) => {
                for (let i = 0; i < array.length; i++) {
                    array[i] = 4; // Mock a fixed value for deterministic testing
                }
                return array;
            }
        });

        const id = generateSessionID();
        // With a fixed value of 4:
        // 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ...)
        // 'x' -> 4.toString(16) -> '4'
        // 'y' -> (4 & 0x3 | 0x8).toString(16) -> (0 | 8).toString(16) -> '8'
        expect(id).toBe('44444444-4444-4444-8444-444444444444');
        expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('returns null and warns when crypto is undefined', () => {
        vi.stubGlobal('crypto', undefined);

        const id = generateSessionID();
        expect(id).toBeNull();
        expect(consoleWarnSpy).toHaveBeenCalledWith('[Pulsar] Secure crypto unavailable for Session ID');
    });

    it('returns null and warns when crypto methods are unavailable', () => {
        vi.stubGlobal('crypto', {});

        const id = generateSessionID();
        expect(id).toBeNull();
        expect(consoleWarnSpy).toHaveBeenCalledWith('[Pulsar] Secure crypto unavailable for Session ID');
    });
});
