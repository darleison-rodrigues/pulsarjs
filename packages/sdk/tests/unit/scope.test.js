import { describe, it, expect } from 'vitest';
import { Scope } from '../../src/core/scope.js';

describe('Scope', () => {
    it('should sanitize user.email', () => {
        const scope = new Scope();
        scope.setUser({ id: '123', email: 'test@example.com' });
        const data = scope.getScopeData();
        expect(data.user.id).toBe('123');
        expect(data.user.email).toBe('[EMAIL_REDACTED]');
    });

    it('should preserve other user fields', () => {
        const scope = new Scope();
        scope.setUser({ id: '123', username: 'testuser' });
        const data = scope.getScopeData();
        expect(data.user.username).toBe('testuser');
        expect(data.user.email).toBeUndefined();
    });

    it('should handle undefined or null user', () => {
        const scope = new Scope();
        scope.setUser(null);
        expect(scope.getScopeData().user).toBeNull();
    });
});
