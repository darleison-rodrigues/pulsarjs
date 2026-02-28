import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { Env, Variables } from '../types';

async function verifyHMAC(payload: any, signature: string, secret: string): Promise<boolean> {
    try {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const msgData = encoder.encode(JSON.stringify(payload));
        const key = await crypto.subtle.importKey(
            'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
        );
        const sigData = new Uint8Array(atob(signature).split('').map(c => c.charCodeAt(0)));
        return await crypto.subtle.verify('HMAC', key, sigData, msgData);
    } catch (e) {
        return false;
    }
}

export async function ingestionSecurityMiddleware(c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) {
    const ip = c.req.header('cf-connecting-ip') || 'unknown';
    const logger = c.get('logger');

    // 1. Content-Type (Cheapest check first)
    const contentType = c.req.header('content-type') || '';
    if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
        return c.text('Unsupported Media Type', 415);
    }

    const authHeader = c.req.header('Authorization');
    const queryToken = c.req.query('token');
    const signature = c.req.header('X-Pulsar-Signature');

    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (queryToken) {
        token = queryToken;
    }

    let isAuthorized = false;

    if (token) {
        if (!c.env.SESSION_SECRET) {
            logger.error('Missing SESSION_SECRET in environment binding');
            return c.text('Internal Server Error', 500);
        }
        try {
            await verify(token, c.env.SESSION_SECRET, 'HS256');
            isAuthorized = true;
        } catch (err) {
            logger.warn('Invalid or expired JWT', { ip, error: String(err) });
        }
    }

    // Origin Validation (Strict Allowlist)
    const origin = c.req.header('origin');
    const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || [];

    if (origin && allowedOrigins.length > 0) {
        if (!allowedOrigins.includes(origin)) {
            logger.warn('Unauthorized origin', { ip, origin });
            return c.text('Forbidden', 403);
        }
    }

    // Parse JSON
    let body: any;
    try {
        if (contentType.includes('text/plain')) {
            const rawText = await c.req.text();
            body = JSON.parse(rawText);
        } else {
            body = await c.req.json();
        }
    } catch {
        logger.warn('Invalid JSON', { ip });
        return c.text('Bad Request', 400);
    }

    // HMAC Signature Validation (SKF-015) - If not already JWT authorized
    const clientId = c.req.header('X-Pulsar-Client-Id');

    if (!isAuthorized && signature && clientId) {
        // Try to get secret from D1 registry
        const tenant = await c.env.DB.prepare(
            'SELECT ingest_secret FROM tenants WHERE client_id = ?'
        ).bind(clientId).first<{ ingest_secret: string }>();

        const secret = tenant?.ingest_secret || c.env.PULSAR_INGEST_SECRET;

        if (secret) {
            isAuthorized = await verifyHMAC(body, signature, secret);
            if (!isAuthorized) {
                logger.warn('Invalid HMAC signature', { ip, clientId });
            }
        } else {
            logger.warn('No ingest secret found for client', { ip, clientId });
        }
    }

    if (!isAuthorized && c.env.ENVIRONMENT === 'production') {
        const logger = c.get('logger');
        logger.warn('Unauthorized request blocked', { ip, clientId });
        return c.text('Unauthorized', 401);
    }

    // 6. Native Shape & Length Validation
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return c.text('Payload must be a JSON object', 400);
    }

    const payload = body as Record<string, unknown>;

    // Check strict length bounds to prevent memory allocation attacks
    if (payload.message && (typeof payload.message !== 'string' || payload.message.length > 2000)) {
        logger.warn('Malformed or oversized message string', { ip });
        return c.text('Bad Request: Invalid message length', 400);
    }
    if (payload.stack && (typeof payload.stack !== 'string' || payload.stack.length > 5000)) {
        logger.warn('Malformed or oversized stack string', { ip });
        return c.text('Bad Request: Invalid stack length', 400);
    }

    c.set('validatedBody', payload);

    await next();
}
