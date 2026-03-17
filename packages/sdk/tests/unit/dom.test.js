import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { injectScript } from '../../src/utils/dom.js';
import { JSDOM } from 'jsdom';

describe('injectScript Utility', () => {
    let dom;
    let originalDocument;
    let originalWindow;

    beforeEach(() => {
        dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
        originalDocument = global.document;
        originalWindow = global.window;
        global.document = dom.window.document;
        global.window = dom.window;
    });

    afterEach(() => {
        global.document = originalDocument;
        global.window = originalWindow;
    });

    it('injects a script with a nonce', () => {
        const state = {
            config: { nonce: 'test-nonce' }
        };
        const src = 'https://example.com/script.js';
        const script = injectScript(state, src);

        expect(script.tagName).toBe('SCRIPT');
        expect(script.src).toBe(src);
        expect(script.getAttribute('nonce')).toBe('test-nonce');
        expect(script.nonce).toBe('test-nonce');
        expect(document.head.contains(script)).toBe(true);
    });

    it('injects a script without a nonce if config is missing', () => {
        const state = { config: {} };
        const src = 'https://example.com/script.js';
        const script = injectScript(state, src);

        expect(script.getAttribute('nonce')).toBeNull();
        expect(script.nonce).toBe(''); // JSDOM default for empty nonce
    });

    it('applies additional attributes', () => {
        const state = { config: {} };
        const src = 'https://example.com/script.js';
        const attrs = { 'data-test': 'value', 'defer': 'true' };
        const script = injectScript(state, src, attrs);

        expect(script.getAttribute('data-test')).toBe('value');
        expect(script.getAttribute('defer')).toBe('true');
    });

    it('defaults to async true', () => {
        const state = { config: {} };
        const src = 'https://example.com/script.js';
        const script = injectScript(state, src);

        expect(script.async).toBe(true);
    });

    it('allows overriding async', () => {
        const state = { config: {} };
        const src = 'https://example.com/script.js';
        const script = injectScript(state, src, { async: 'false' });

        expect(script.getAttribute('async')).toBe('false');
    });

    it('rejects script injection with javascript: protocol', () => {
        const state = { config: {} };
        const src = 'javascript:alert(1)';
        expect(() => injectScript(state, src)).toThrow('Insecure script source protocol: javascript:');
    });

    it('rejects script injection with data: protocol', () => {
        const state = { config: {} };
        const src = 'data:text/javascript,alert(1)';
        expect(() => injectScript(state, src)).toThrow('Insecure script source protocol: data:');
    });

    it('rejects script injection with http: protocol', () => {
        const state = { config: {} };
        const src = 'http://example.com/script.js';
        expect(() => injectScript(state, src)).toThrow('Insecure script source protocol: http:');
    });

    it('rejects invalid urls', () => {
        const state = { config: {} };
        const src = 'http://[]/';
        expect(() => injectScript(state, src)).toThrow('Invalid script source: http://[]/');
    });

    it('allows script injection with relative paths', () => {
        const state = { config: {} };
        const src = '/path/to/script.js';
        const script = injectScript(state, src);

        expect(script.tagName).toBe('SCRIPT');
        expect(script.src).toBe(src);
    });
});
