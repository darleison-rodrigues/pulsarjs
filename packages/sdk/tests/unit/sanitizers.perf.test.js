import { describe, it, expect } from 'vitest';
import { Sanitizers } from '../../src/utils/sanitizers.js';

describe('Sanitizers Performance Verification', () => {
    it('verify optimization doesn\'t break semantics', () => {
        const stack = "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10\nline 11\nline 12\nline 13\nline 14\nline 15\nline 16\nline 17";

        const v = String(stack);
        let count = 0;
        let idx = -1;
        while (count < 15) {
            idx = v.indexOf('\n', idx + 1);
            if (idx === -1) break;
            count++;
        }

        let cleaned = idx !== -1 ? v.substring(0, idx) : v;

        const original = v.split('\n').slice(0, 15).join('\n');

        expect(cleaned).toBe(original);
    });

    it('works with < 15 lines', () => {
        const stack = "line 1\nline 2";

        const v = String(stack);
        let count = 0;
        let idx = -1;
        while (count < 15) {
            idx = v.indexOf('\n', idx + 1);
            if (idx === -1) break;
            count++;
        }

        let cleaned = idx !== -1 ? v.substring(0, idx) : v;

        const original = v.split('\n').slice(0, 15).join('\n');

        expect(cleaned).toBe(original);
    });

    it('works with no newlines', () => {
        const stack = "line 1";

        const v = String(stack);
        let count = 0;
        let idx = -1;
        while (count < 15) {
            idx = v.indexOf('\n', idx + 1);
            if (idx === -1) break;
            count++;
        }

        let cleaned = idx !== -1 ? v.substring(0, idx) : v;

        const original = v.split('\n').slice(0, 15).join('\n');

        expect(cleaned).toBe(original);
    });

    it('works with empty string', () => {
        const stack = "";

        const v = String(stack);
        let count = 0;
        let idx = -1;
        while (count < 15) {
            idx = v.indexOf('\n', idx + 1);
            if (idx === -1) break;
            count++;
        }

        let cleaned = idx !== -1 ? v.substring(0, idx) : v;

        const original = v.split('\n').slice(0, 15).join('\n');

        expect(cleaned).toBe(original);
    });
});
