import { Context, Next } from 'hono';
import { Env, Variables } from '../types';

/**
 * Security Configuration
 */
const CONFIG = {
    // ASN Blocklist
    blockedASNs: new Set([
        48090,  // TECHOFF SRV LIMITED
        211590, // FBW NETWORKS SAS (Major attacker)
        210558, // 1337 Services GmbH
        135377, // UCLOUD INFORMATION TECHNOLOGY
    ]),

    // IP Blocklist
    blockedIPs: new Set([
        '185.177.72.49',
        '195.178.110.132',
        '45.148.10.246',
        '45.94.31.224',
        '2.58.56.62',
        '206.189.225.181',
        '45.148.10.238',
    ]),

    // Exact path matches (Normalized)
    exactBlockPaths: new Set([
        '/.env', '/.env.bak', '/.env.local', '/.env.production',
        '/.aws/credentials', '/.aws/config',
        '/.git/config', '/.git/head',
        '/wp-login.php', '/wp-admin', '/xmlrpc.php',
        '/config.php', '/config.json', '/config.js',
        '/phpmyadmin', '/admin.php', '/admin', '/index.php',
        '/composer.json', '/package.json',
        '/debug', '/console',
    ]),

    // Regex patterns (Reduced due to better normalization)
    regexBlockPatterns: [
        /\.php$/i,                    // Most common
        /\/\.env($|\.)/i,             // Common
        /\.(bak|backup|old|swp|sql|dump)$/i,
        /\/\.(git|svn|hg)\//i,
        /config.*\.(json|yaml|yml)$/i,
    ],

    // Blocked User Agents
    blockedUserAgents: [
        /l9scan/i, /nikto/i, /sqlmap/i, /nmap/i, /masscan/i,
        /acunetix/i, /nessus/i, /metasploit/i, /burp/i,
        /dirbuster/i, /gobuster/i, /shodan/i,
    ],

    // Rate Limiting Policy (Default Fallback)
    rateLimit: {
        maxRequests: 100,
        windowSeconds: 60,
    },

    // Limits
    maxPathLength: 2048,
    maxUserAgentLength: 512,
};

/**
 * Normalizes the path to prevent bypasses.
 * Handles double-encoding and path traversal resolution.
 * Returns null if the path is invalid/malformed.
 */
function normalizePath(url: string): string | null {
    try {
        const urlObj = new URL(url);
        let path = urlObj.pathname || '/';

        // Decode multiple times to handle double encoding
        let iterations = 0;
        let prev = '';

        while (path !== prev && iterations < 5) {
            prev = path;
            try {
                path = decodeURIComponent(path);
            } catch (_e) {
                // Ignore malformed URL
                // If decoding fails, break and use what we have (or fail? Safe to fail closed)
                // If it's malformed encoding, it's likely an attack.
                return null;
            }
            iterations++;
        }

        // Normalize to lowercase and convert backslashes
        path = path.toLowerCase().replace(/\\/g, '/');

        // Resolve path traversal manually
        const segments = path.split('/');
        const resolved: string[] = [];

        for (const segment of segments) {
            if (segment === '.' || segment === '') continue;
            if (segment === '..') {
                if (resolved.length > 0) resolved.pop();
            } else {
                resolved.push(segment);
            }
        }

        return '/' + resolved.join('/');
    } catch (_e) {
        return null;
    }
}

/**
 * Validates IP address format.
 */
function isValidIP(ip: string): boolean {
    // IPv4: standard dotted-decimal
    const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    // IPv6: allow any combination of hex groups, ::, and IPv4-mapped suffixes
    // Covers compressed (::), full, and mixed (::ffff:1.2.3.4) formats
    const ipv6 = /^[0-9a-fA-F:]+$/;
    if (ipv4.test(ip)) return true;
    if (ipv6.test(ip) && ip.includes(':')) return true;
    return false;
}

// Minimal interface for Cloudflare Request CF properties
interface RequestCF {
    asn?: number;
    [key: string]: unknown;
}

export async function firewallMiddleware(c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) {
    const ip = c.req.header('CF-Connecting-IP');
    const userAgent = c.req.header('User-Agent') || '';
    const rawUrl = c.req.url;
    const logger = c.get('logger');

    // 1. Validate IP
    if (!ip || !isValidIP(ip)) {
        logger.warn('Firewall blocked - invalid IP', { ip: ip || 'MISSING' });
        return c.text('Not Found', 404);
    }

    // 2. DoS Protection (Length Checks)
    if (rawUrl.length > CONFIG.maxPathLength || userAgent.length > CONFIG.maxUserAgentLength) {
        return c.text('Not Found', 404);
    }

    // 3. Normalize Path
    const path = normalizePath(rawUrl);
    if (path === null) {
        logger.warn('Invalid Path URL', { rawUrl, ip });
        return c.text('Not Found', 404);
    }

    // 4. ASN Block
    const cf = (c.req.raw as unknown as { cf: RequestCF }).cf;
    const asn = cf?.asn;

    if (asn && CONFIG.blockedASNs.has(asn)) {
        logger.warn('Blocked ASN', { asn, ip });
        return c.text('Not Found', 404);
    }

    // 5. IP Block
    if (CONFIG.blockedIPs.has(ip)) {
        logger.warn('Blocked IP', { ip });
        return c.text('Not Found', 404);
    }

    // 6. Path Block (Exact)
    if (CONFIG.exactBlockPaths.has(path)) {
        logger.warn('Blocked Path', { path, ip });
        return c.text('Not Found', 404);
    }

    // 7. User Agent Block
    for (const pattern of CONFIG.blockedUserAgents) {
        if (pattern.test(userAgent)) {
            logger.warn('Blocked UA', { userAgent, ip });
            return c.text('Not Found', 404);
        }
    }

    // Skip Durable Object for invalid paths completely
    if (!path.startsWith('/v1/')) {
        logger.warn('Invalid path outside API scope', { ip, path });
        return new Response('Not Found', { status: 404 });
    }

    // 8. Path Block (Regex)
    for (const pattern of CONFIG.regexBlockPatterns) {
        if (pattern.test(path)) {
            logger.warn('Blocked Pattern', { pattern: pattern.toString(), ip });
            return c.text('Not Found', 404);
        }
    }

    await next();
}
