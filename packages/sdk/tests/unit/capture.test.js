import { describe, it, expect } from 'vitest';
import { hash } from '../../src/core/capture.js';

describe('Pulsar Capture Pipeline', () => {
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
});
