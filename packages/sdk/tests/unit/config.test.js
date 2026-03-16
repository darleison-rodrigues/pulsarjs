import { describe, it, expect } from 'vitest';
import { validateConfig, DEFAULT_CONFIG } from '../../src/core/config.js';

describe('Configuration Validation', () => {
    it('accepts null nonce', () => {
        const config = { ...DEFAULT_CONFIG, clientId: 'test-client', nonce: null };
        const errors = validateConfig(config);
        expect(errors).toEqual([]);
    });

    it('accepts string nonce', () => {
        const config = { ...DEFAULT_CONFIG, clientId: 'test-client', nonce: 'rAnd0m123' };
        const errors = validateConfig(config);
        expect(errors).toEqual([]);
    });

    it('rejects non-string nonce', () => {
        const config = { ...DEFAULT_CONFIG, clientId: 'test-client', nonce: 12345 };
        const errors = validateConfig(config);
        expect(errors).toContain('nonce must be a string.');
    });

    it('rejects object nonce', () => {
        const config = { ...DEFAULT_CONFIG, clientId: 'test-client', nonce: {} };
        const errors = validateConfig(config);
        expect(errors).toContain('nonce must be a string.');
    });
});
