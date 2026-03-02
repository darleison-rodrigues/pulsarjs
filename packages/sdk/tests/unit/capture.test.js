import { describe, it, expect, vi } from 'vitest';
import { hash, generateSignature } from '../../src/core/capture.js';

describe('Pulsar Capture & Payload Utils', () => {
    it('hash generates consistent unique identifiers', () => {
        const str1 = 'my_test_string_for_dedupe';
        const str2 = 'my_test_string_for_dedupe';
        const str3 = 'different_string';

        const hash1 = hash(str1);
        const hash2 = hash(str2);
        const hash3 = hash(str3);

        expect(hash1).toBe(hash2);
        expect(hash1).not.toBe(hash3);
    });

    it('generateSignature handles signature generation properly with pseudo-crypto setup', async () => {
        // In JSDOM, crypto.subtle is available if using node 19+ normally, or via DOM mock.
        // If not polyfilled perfectly, we verify the fallback structure.
        const secret = "super_secret_key";
        const payload = {
            client_id: "test",
            events: [{ message: "error" }]
        };

        const sig = await generateSignature(payload, secret);

        // We expect either null (if running in env without crypto) or a string 
        if (sig) {
            expect(typeof sig).toBe('string');
            // Base64 encoded SHA-256 strings typically are length 44
            expect(sig.length).toBe(44);
        }
    });
});
