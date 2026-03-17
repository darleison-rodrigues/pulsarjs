import { describe, it, expect } from 'vitest';
import { Sanitizers } from '../../src/utils/sanitizers.js';

describe('Sanitizers', () => {
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
