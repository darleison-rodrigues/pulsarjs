/**
 * SentinelKit Privacy Sanitizers
 * Parity with backend specific logic in `models.py`
 */

export const Sanitizers = {
    /**
     * Remove PII patterns from error messages
     */
    sanitizeMessage(msg) {
        if (!msg) return "";
        let v = String(msg);

        // Email addresses
        v = v.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');

        // Credit cards (groupings of 4 digits)
        v = v.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_REDACTED]');

        // Phone numbers (simple US/International format 555-123-4567)
        v = v.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]');

        // SFCC customer IDs (format: abcdCustomer-ID-123456)
        v = v.replace(/\b\w+Customer-ID-\d+\b/gi, '[CUSTOMER_ID_REDACTED]');

        // Generic tokens (long alphanumeric strings 32+ chars)
        v = v.replace(/\b[A-Za-z0-9]{32,}\b/g, '[TOKEN_REDACTED]');

        return v.substring(0, 1000);
    },

    /**
     * Limit stack trace depth and remove file paths
     */
    sanitizeStack(stack) {
        if (!stack) return null;
        const v = String(stack);

        // Limit to 15 lines
        const lines = v.split('\n').slice(0, 15);

        return lines.map(line => {
            // Remove URL origins (keep path starting from /) or replace entirely? 
            // Backend approach: "@https://..." -> "@"

            // Remove full URL based paths
            let cleaned = line.replace(/@https?:\/\/[^\/]+\//g, '@');

            // Remove file:// paths
            cleaned = cleaned.replace(/@file:\/\/.*\//g, '@');

            // Remove local file paths (Windows C:\...)
            cleaned = cleaned.replace(/[A-Z]:\\[\w\\.]+\\/g, '');

            // Remove Unix paths (/Users/..., /home/...)
            cleaned = cleaned.replace(/\/Users\/[\w\/]+\//g, '');
            cleaned = cleaned.replace(/\/home\/[\w\/]+\//g, '');

            return cleaned;
        }).join('\n');
    },

    /**
     * Remove query params from URLs
     */
    sanitizeUrl(url) {
        if (!url) return "";
        try {
            const parsed = new URL(url, 'http://example.com'); // Base required for relative URLs
            // Return only origin + pathname. If relative, just pathname.
            if (url.startsWith('/')) {
                return parsed.pathname.substring(0, 500);
            }
            return (parsed.origin + parsed.pathname).substring(0, 500);
        } catch (e) {
            return String(url).substring(0, 500);
        }
    },

    /**
     * Remove IDs from API endpoints
     */
    sanitizeApiEndpoint(url) {
        if (!url) return null;
        let v = String(url);

        // UUIDs
        v = v.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '{uuid}');

        // Numeric IDs (6+ digits)
        v = v.replace(/\/\d{6,}/g, '/{id}');

        // SFCC Baskets/Orders
        v = v.replace(/\/baskets\/[a-z0-9]+/gi, '/baskets/{basket_id}');
        v = v.replace(/\/orders\/[a-z0-9]+/gi, '/orders/{order_id}');

        return v.substring(0, 200);
    }
};
