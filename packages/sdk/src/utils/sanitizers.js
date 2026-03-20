/**
 * PulsarJS Privacy Sanitizers
 * PII redaction at capture time — before data enters the queue.
 * Provider-extensible via registerPiiPatterns().
 */

let _extraPatterns = [];

export const Sanitizers = {
    /**
     * Register additional PII patterns from a platform provider.
     * @param {Array<{pattern: RegExp, replacement: string}>} patterns
     */
    registerPiiPatterns(patterns) {
        _extraPatterns = _extraPatterns.concat(patterns);
    },

    /**
     * Remove PII patterns from error messages.
     */
    sanitizeMessage(msg) {
        if (!msg) return "";
        let v = String(msg);

        // Email addresses
        v = v.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');

        // Credit cards (groupings of 4 digits)
        v = v.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_REDACTED]');

        // Phone numbers (simple US/International format)
        v = v.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]');

        // Generic tokens (long alphanumeric strings 32+ chars)
        v = v.replace(/\b[A-Za-z0-9]{32,}\b/g, '[TOKEN_REDACTED]');

        // Provider-registered PII patterns
        for (const { pattern, replacement } of _extraPatterns) {
            v = v.replace(pattern, replacement);
        }

        return v.substring(0, 1000);
    },

    /**
     * Alias for backward compatibility — capture.js calls redactPII.
     */
    redactPII(msg) {
        return this.sanitizeMessage(msg);
    },

    /**
     * Limit stack trace depth and remove file paths.
     */
    sanitizeStack(stack) {
        if (!stack) return null;
        const v = String(stack);

        let count = 0;
        let idx = -1;
        while (count < 15) {
            idx = v.indexOf('\n', idx + 1);
            if (idx === -1) break;
            count++;
        }

        let cleaned = idx !== -1 ? v.substring(0, idx) : v;

        let lastIndex = -1;
        for (let i = 0; i < 15; i++) {
            lastIndex = v.indexOf('\n', lastIndex + 1);
            if (lastIndex === -1) break;
        }

        let cleaned = lastIndex === -1 ? v : v.substring(0, lastIndex);

        cleaned = cleaned
            .replace(/@https?:\/\/[^\/]+\//g, '@')
            .replace(/@file:\/\/.*\//g, '@')
            .replace(/[A-Z]:\\[\w\\.]+\\/g, '')
            .replace(/\/Users\/[\w\/]+\//g, '')
            .replace(/\/home\/[\w\/]+\//g, '');

        return cleaned;
    },

    /**
     * Remove query params from URLs.
     */
    sanitizeUrl(url) {
        if (!url) return "";
        try {
            const parsed = new URL(url, 'http://example.com');
            if (url.startsWith('/')) {
                return parsed.pathname.substring(0, 500);
            }
            return (parsed.origin + parsed.pathname).substring(0, 500);
        } catch (_e) {
            return String(url).substring(0, 500);
        }
    },

    /**
     * Remove IDs from API endpoints for grouping.
     */
    sanitizeApiEndpoint(url) {
        if (!url) return null;
        let v = String(url).split(/[?#]/)[0];
        v = v.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '{uuid}');
        v = v.replace(/\/\d{6,}/g, '/{id}');
        v = v.replace(/\/baskets\/[a-z0-9]+/gi, '/baskets/{basket_id}');
        v = v.replace(/\/orders\/[a-z0-9]+/gi, '/orders/{order_id}');
        return v.substring(0, 200);
    },

    /**
     * Reset extra patterns — used in tests.
     * @internal
     */
    _resetPiiPatterns() {
        _extraPatterns = [];
    }
};
