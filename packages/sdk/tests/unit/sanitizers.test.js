import { describe, it, expect } from 'vitest';
import { Sanitizers } from '../../src/utils/sanitizers';

describe('Sanitizers', () => {
    describe('sanitizeApiEndpoint', () => {
        it('should remove UUIDs', () => {
            const url = 'https://api.example.com/v1/users/550e8400-e29b-41d4-a716-446655440000/profile';
            expect(Sanitizers.sanitizeApiEndpoint(url)).toBe('https://api.example.com/v1/users/{uuid}/profile');
        });

        it('should remove long numeric IDs', () => {
            const url = 'https://api.example.com/v1/posts/1234567';
            expect(Sanitizers.sanitizeApiEndpoint(url)).toBe('https://api.example.com/v1/posts/{id}');
        });

        it('should remove basket IDs', () => {
            const url = 'https://api.example.com/v1/baskets/abc123def';
            expect(Sanitizers.sanitizeApiEndpoint(url)).toBe('https://api.example.com/v1/baskets/{basket_id}');
        });

        it('should remove order IDs', () => {
            const url = 'https://api.example.com/v1/orders/order789';
            expect(Sanitizers.sanitizeApiEndpoint(url)).toBe('https://api.example.com/v1/orders/{order_id}');
        });

        it('should remove query parameters (VULNERABILITY REPRODUCTION)', () => {
            const url = 'https://api.example.com/v1/search?query=sensitive&user_email=test@example.com';
            const sanitized = Sanitizers.sanitizeApiEndpoint(url);
            expect(sanitized).not.toContain('query=sensitive');
            expect(sanitized).not.toContain('user_email=test@example.com');
            expect(sanitized).toBe('https://api.example.com/v1/search');
        });

        it('should handle URLs with query params and IDs', () => {
            const url = 'https://api.example.com/v1/orders/order123?token=secret';
            const sanitized = Sanitizers.sanitizeApiEndpoint(url);
            expect(sanitized).toBe('https://api.example.com/v1/orders/{order_id}');
        });
    });
});
