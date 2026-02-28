import { secureHeaders } from 'hono/secure-headers';

// 1. Headers
export const securityHeadersMiddleware = secureHeaders({
    contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "https://challenges.cloudflare.com", "https://api.mosaique.ltd", "https://mosaique.ltd"],
        scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
        styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        frameAncestors: ["'none'"],
    },
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
});
