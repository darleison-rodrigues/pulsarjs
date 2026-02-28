import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestionSecurityMiddleware } from '../../src/middleware/ingestion-security';
import { sign } from 'hono/jwt';

describe('Ingestion Security Middleware', () => {
    let mockEnv: {
        ENVIRONMENT: string;
        SESSION_SECRET?: string;
        ALLOWED_ORIGINS: string;
        LIMITER: {
            idFromName: () => string;
            get: () => {
                fetch: () => Promise<Response>;
            };
        };
    };
    const SECRET = 'test-secret';

    const mockContext = (headers: Record<string, string>, queryObj: Record<string, string> = {}) => ({
        req: {
            header: (name: string) => headers[name.toLowerCase()],
            query: (key: string) => queryObj[key],
            json: async () => ({
                message: 'test error',
                stack: 'Error at /app/foo'
            }),
            raw: {
                clone: () => ({
                    text: async () => '{}', // Empty body for test
                    json: async () => ({})
                })
            }
        },
        env: mockEnv,
        text: vi.fn((msg, status) => ({ msg, status })),
        get: vi.fn((key) => {
            if (key === 'logger') {
                return {
                    warn: vi.fn(),
                    error: vi.fn(),
                    info: vi.fn(),
                };
            }
            return null;
        }),
        set: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const next = vi.fn();

    beforeEach(() => {
        mockEnv = {
            ENVIRONMENT: 'development',
            SESSION_SECRET: SECRET,
            ALLOWED_ORIGINS: 'https://shop.com,https://dashboard.shop.com',
            LIMITER: { // Mock DO stub
                idFromName: () => 'id',
                get: () => ({
                    fetch: async () => new Response(JSON.stringify({ allowed: true }))
                })
            }
        };
        // Mock global crypto if running in node env without web crypto
        if (!(globalThis as unknown as { crypto: unknown }).crypto) {
            // Setup mock or polyfill if needed. Vitest w/ Cloudflare pool handles this usually.
        }
    });

    it('accepts requests without signature headers (SKA-015)', async () => {
        const c = mockContext({
            'cf-connecting-ip': '1.2.3.4',
            'user-agent': 'MyAgent/1.0',
            'content-type': 'application/json',
            'origin': 'https://shop.com'
        });
        // Call middleware
        await ingestionSecurityMiddleware(c, next);

        // Should call next()
        expect(next).toHaveBeenCalled();
        // Should NOT return an error response
        // In this mock setup, if it returns, it returns an object.
        // We can't easily check return value if it calls next(), but we can spy on next.
    });



    it('rejects invalid content-type', async () => {
        const c = mockContext({
            'cf-connecting-ip': '1.2.3.4',
            'user-agent': 'ValidBrowser/1.0',
            'content-type': 'application/x-www-form-urlencoded',
            'origin': 'https://shop.com'
        });
        // Remove secret to skip signature check for this test
        c.env.SESSION_SECRET = undefined;

        const result = await ingestionSecurityMiddleware(c, next);
        // Expect 415 or 403 depending on implementation order
        // In our code: IP -> UA -> Sig -> Rate -> ContentType
        expect(result).toEqual({ msg: 'Unsupported Media Type', status: 415 });
    });
    it('accepts missing Origin header (mobile/server-to-server)', async () => {
        const c = mockContext({
            'cf-connecting-ip': '1.2.3.4',
            'user-agent': 'MyAgent/1.0',
            'content-type': 'application/json',
            'cf-ray': 'xyz'
            // Missing Origin
        });
        await ingestionSecurityMiddleware(c, next);
        expect(next).toHaveBeenCalled();
    });

    it('rejects unauthorized origin', async () => {
        const c = mockContext({
            'cf-connecting-ip': '1.2.3.4',
            'user-agent': 'MyAgent/1.0',
            'origin': 'https://evil.com',
            'content-type': 'application/json'
        });
        const result = await ingestionSecurityMiddleware(c, next);
        expect(result).toEqual({ msg: 'Forbidden', status: 403 });
    });

    it('rejects in production when missing JWT Token (SKA-024)', async () => {
        const c = mockContext({
            'cf-connecting-ip': '1.2.3.4',
            'user-agent': 'MyAgent/1.0',
            'origin': 'https://shop.com',
            'content-type': 'application/json'
            // No Authorization header
        });
        c.env.ENVIRONMENT = 'production';

        const result = await ingestionSecurityMiddleware(c, next);
        expect(result).toEqual({ msg: 'Unauthorized', status: 401 });
    });

    it('rejects invalid JWT Token signature', async () => {
        const c = mockContext({
            'cf-connecting-ip': '1.2.3.4',
            'user-agent': 'MyAgent/1.0',
            'origin': 'https://shop.com',
            'content-type': 'application/json',
            'authorization': 'Bearer fake-token-123'
        });
        c.env.ENVIRONMENT = 'production';

        const result = await ingestionSecurityMiddleware(c, next);
        expect(result).toEqual({ msg: 'Unauthorized', status: 401 });
    });

    it('accepts valid JWT signed with correct secret and matching IP', async () => {
        const validToken = await sign({
            sub: 'test-client',
            exp: Math.floor(Date.now() / 1000) + 3600
        }, SECRET);

        const c = mockContext({
            'cf-connecting-ip': '1.2.3.4',
            'user-agent': 'MyAgent/1.0',
            'origin': 'https://shop.com',
            'content-type': 'application/json',
            'authorization': `Bearer ${validToken}`
        });
        c.env.ENVIRONMENT = 'production';

        await ingestionSecurityMiddleware(c, next);
        expect(next).toHaveBeenCalled();
    });

});
