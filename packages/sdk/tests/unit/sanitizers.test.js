import { describe, it, expect, afterEach } from 'vitest';
import { Sanitizers } from '../../src/utils/sanitizers.js';

describe('Sanitizers', () => {
    describe('sanitizeMessage', () => {
        afterEach(() => {
            Sanitizers._resetPiiPatterns();
        });

        it('should handle falsy values', () => {
            expect(Sanitizers.sanitizeMessage(null)).toBe("");
            expect(Sanitizers.sanitizeMessage(undefined)).toBe("");
            expect(Sanitizers.sanitizeMessage("")).toBe("");
        });

        it('should convert non-strings to strings', () => {
            expect(Sanitizers.sanitizeMessage(12345)).toBe("12345");
            expect(Sanitizers.sanitizeMessage(true)).toBe("true");
            expect(Sanitizers.sanitizeMessage({})).toBe("[object Object]");
        });

        it('should redact email addresses', () => {
            const msg1 = "Contact me at user@example.com for info.";
            expect(Sanitizers.sanitizeMessage(msg1)).toBe("Contact me at [EMAIL_REDACTED] for info.");

            const msg2 = "My emails are a.b@c.co.uk and test+123@gmail.com";
            expect(Sanitizers.sanitizeMessage(msg2)).toBe("My emails are [EMAIL_REDACTED] and [EMAIL_REDACTED]");
        });

        it('should redact credit card numbers', () => {
            const msg1 = "Paid with 1234-5678-9012-3456";
            expect(Sanitizers.sanitizeMessage(msg1)).toBe("Paid with [CARD_REDACTED]");

            const msg2 = "Cards: 1234 5678 9012 3456 and 1234567890123456";
            expect(Sanitizers.sanitizeMessage(msg2)).toBe("Cards: [CARD_REDACTED] and [CARD_REDACTED]");
        });

        it('should redact phone numbers', () => {
            const msg1 = "Call 555-123-4567 or 555.987.6543";
            expect(Sanitizers.sanitizeMessage(msg1)).toBe("Call [PHONE_REDACTED] or [PHONE_REDACTED]");
        });

        it('should redact generic tokens', () => {
            const msg1 = "Token: abcdefghijklmnopqrstuvwxyz123456";
            expect(Sanitizers.sanitizeMessage(msg1)).toBe("Token: [TOKEN_REDACTED]");

            const msg2 = "Short token: abcdefg123";
            expect(Sanitizers.sanitizeMessage(msg2)).toBe("Short token: abcdefg123");
        });

        it('should redact custom PII patterns', () => {
            Sanitizers.registerPiiPatterns([
                { pattern: /SSN:\s*\d{3}-\d{2}-\d{4}/g, replacement: '[SSN_REDACTED]' }
            ]);
            const msg = "My SSN: 123-45-6789 is private.";
            expect(Sanitizers.sanitizeMessage(msg)).toBe("My [SSN_REDACTED] is private.");
        });

        it('should truncate messages longer than 1000 characters', () => {
            // Need a non-token string to avoid generic token regex triggering
            // since A{1500} will match [A-Za-z0-9]{32,} and be replaced with [TOKEN_REDACTED]
            const longMsg = "A ".repeat(750);
            const sanitized = Sanitizers.sanitizeMessage(longMsg);
            expect(sanitized.length).toBe(1000);
            expect(sanitized).toBe(longMsg.substring(0, 1000));
        });
    });

    describe('redactPII alias', () => {
        it('should alias sanitizeMessage', () => {
            const msg = "Contact me at user@example.com";
            expect(Sanitizers.redactPII(msg)).toBe("Contact me at [EMAIL_REDACTED]");
        });
    });

    describe('sanitizeStack', () => {
        it('should sanitize web urls', () => {
            const stack = "Error: something went wrong\n    at <anonymous> (https://example.com/assets/js/main.js:10:20)\n    at @https://cdn.com/lib.js:5:5";
            const sanitized = Sanitizers.sanitizeStack(stack);
            expect(sanitized).toContain('at <anonymous> (https://example.com/assets/js/main.js:10:20)');
            expect(sanitized).toContain('at @lib.js:5:5');
        });

        it('should sanitize file urls', () => {
            const stack = "at @file:///Users/jdoe/project/src/index.js:10:5";
            const sanitized = Sanitizers.sanitizeStack(stack);
            expect(sanitized).toBe("at @index.js:10:5");
        });

        it('should sanitize Windows paths', () => {
            const stack = "at C:\\Users\\Admin\\AppData\\Local\\Temp\\test.js:1:1";
            const sanitized = Sanitizers.sanitizeStack(stack);
            expect(sanitized).toBe("at test.js:1:1");
        });

        it('should sanitize Unix home paths', () => {
            const stack = "at /Users/jdoe/work/app.js:10:10\nat /home/ubuntu/app.js:5:5";
            const sanitized = Sanitizers.sanitizeStack(stack);
            expect(sanitized).toBe("at app.js:10:10\nat app.js:5:5");
        });

        it('should limit to 15 lines', () => {
            const manyLines = Array(20).fill('line').join('\n');
            const sanitized = Sanitizers.sanitizeStack(manyLines);
            expect(sanitized.split('\n')).toHaveLength(15);
        });

        it('should handle null/undefined', () => {
            expect(Sanitizers.sanitizeStack(null)).toBeNull();
            expect(Sanitizers.sanitizeStack(undefined)).toBeNull();
        });
    });
});
