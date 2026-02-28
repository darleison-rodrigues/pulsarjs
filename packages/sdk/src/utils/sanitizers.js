/**
 * PulsarJS Privacy Sanitizers
 * PII redaction at capture time — before data enters the queue.
 */

export const Sanitizers = {
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

        // SFCC customer IDs
        v = v.replace(/\b\w+Customer-ID-\d+\b/gi, '[CUSTOMER_ID_REDACTED]');

        // Generic tokens (long alphanumeric strings 32+ chars)
        v = v.replace(/\b[A-Za-z0-9]{32,}\b/g, '[TOKEN_REDACTED]');

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
        const lines = v.split('\n').slice(0, 15);

        return lines.map(line => {
            let cleaned = line.replace(/@https?:\/\/[^\/]+\//g, '@');
            cleaned = cleaned.replace(/@file:\/\/.*\//g, '@');
            cleaned = cleaned.replace(/[A-Z]:\\[\w\\.]+\\/g, '');
            cleaned = cleaned.replace(/\/Users\/[\w\/]+\//g, '');
            cleaned = cleaned.replace(/\/home\/[\w\/]+\//g, '');
            return cleaned;
        }).join('\n');
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
        } catch (e) {
            return String(url).substring(0, 500);
        }
    },

    /**
     * Remove IDs from API endpoints for grouping.
     */
    sanitizeApiEndpoint(url) {
        if (!url) return null;
        let v = String(url);
        v = v.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '{uuid}');
        v = v.replace(/\/\d{6,}/g, '/{id}');
        v = v.replace(/\/baskets\/[a-z0-9]+/gi, '/baskets/{basket_id}');
        v = v.replace(/\/orders\/[a-z0-9]+/gi, '/orders/{order_id}');
        return v.substring(0, 200);
    }
};
