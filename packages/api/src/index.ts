import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { cors } from 'hono/cors';

import { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import { firewallMiddleware } from './middleware/firewall';
import { securityHeadersMiddleware } from './middleware/security';
import { ingestHandler } from './routes/ingest';
import { ingestionSecurityMiddleware } from './middleware/ingestion-security';
import type { Env } from './types';

// Workflows
export { AlertWorkflow } from './workflows/AlertWorkflow';
export { StorageWorkflow } from './workflows/StorageWorkflow';


import { createLogger } from './lib/logger';
import { Variables } from './types';
import { sendSlackAlert } from './lib/slack';

export const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Logger & Request ID (Must be first)
app.use('*', async (c, next) => {
    const requestId = c.req.header('cf-ray') || crypto.randomUUID();
    c.set('requestId', requestId);
    c.set('logger', createLogger(requestId));
    c.header('X-Request-Id', requestId);
    await next();
});

// Subdomain Segregation (Enforce api.* for API routes)
app.use('/v1/*', async (c, next) => {
    const url = new URL(c.req.url);
    if (c.env.ENVIRONMENT === 'production' && !url.hostname.startsWith('api.')) {
        const logger = c.get('logger');
        logger.warn('API route accessed via non-API subdomain', { hostname: url.hostname });
        return c.text('Not Found', 404);
    }
    await next();
});

// CORS
app.use('/v1/*', cors({
    origin: (origin, c) => {
        const logger = c.get('logger');
        // Pixel ingestion and session handshake: Enforce allowed origins
        if (c.req.path === '/v1/ingest' || c.req.path === '/v1/session') {
            const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || [];
            if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
                return origin;
            }
            logger.warn('CORS blocked ingestion origin', { origin, path: c.req.path });
            return null;
        }



        // Local development
        if (c.env.ENVIRONMENT === 'development' && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
            return origin;
        }

        logger.warn('CORS blocked', { origin, path: c.req.path });
        return null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Pulsar-Client-Id', 'Idempotency-Key'],
    maxAge: 86400,
}));

// Security layers
app.use('*', firewallMiddleware);
app.use('*', securityHeadersMiddleware);

// Health check
app.get('/v1/health', (c) => c.json({ status: 'ok', service: 'pulsarjs' }));


// Pixel Handshake and JWT Generation (SKA-024)
app.post('/v1/session', async (c) => {
    const logger = c.get('logger');

    const clientId = c.req.header('X-Pulsar-Client-Id');
    if (!clientId) {
        return c.json({ error: 'Missing clientId' }, 400);
    }

    const ip = c.req.header('cf-connecting-ip') || 'unknown';
    const exp = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours

    const payload = {
        sub: clientId,
        ip,
        exp,
        iat: Math.floor(Date.now() / 1000),
    };

    const secret = c.env.SESSION_SECRET;
    if (!secret) {
        logger.error('Missing SESSION_SECRET in environment');
        return c.json({ error: 'Internal Server Error' }, 500);
    }

    try {
        const token = await sign(payload, secret);
        logger.info('Generated SDK Session JWT', { clientId });
        return c.json({ token, expires_at: exp });
    } catch (err) {
        logger.error('Failed to sign JWT', { error: String(err) });
        return c.json({ error: 'Internal Server Error' }, 500);
    }
});

// Pixel ingestion (SK-101)
app.post('/v1/ingest', ingestionSecurityMiddleware, ingestHandler);

// API Subdomain Catch-All (Mimic Stripe)
app.all('*', async (c, next) => {
    const url = new URL(c.req.url);
    if (url.hostname.startsWith('api.')) {
        return c.json({
            error: {
                message: `Unrecognized request URL (${c.req.method}: ${url.pathname}). If you are trying to list objects, remove the trailing slash. If you are trying to retrieve an object, make sure you passed a valid (non-empty) identifier in your code.`,
                type: "invalid_request_error"
            }
        }, 404);
    }
    await next();
});

export default {
    fetch: app.fetch,
    async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
        const logger = createLogger(`queue-batch-${crypto.randomUUID()}`);
        logger.info('Queue consumer triggered', { queueName: batch.queue, batchSize: batch.messages.length });

        // DLQ Fallback Processing (SKA-023)
        if (batch.queue === 'pulsarjs-ingestion-dlq') {
            logger.warn('Processing Dead Letter Queue', { batchSize: batch.messages.length });
            const failures = [];

            for (const msg of batch.messages) {
                const body = msg.body;
                const incidentId = body.incidentId || crypto.randomUUID();
                const key = `inbound-failures/${new Date().toISOString().split('T')[0]}/${incidentId}.json`;

                failures.push({
                    id: incidentId,
                    classification: body.classification_pattern,
                    error: body.error_type
                });

                ctx.waitUntil(
                    env.DLQ_BUCKET.put(key, JSON.stringify({
                        timestamp: new Date().toISOString(),
                        originalBody: body
                    })).catch((err) => {
                        logger.error('Failed to write dead letter to DLQ Bucket', { key, error: String(err) });
                    })
                );
            }

            // Consolidate Slack Alert for DLQ
            if (env.SLACK_WEBHOOK_URL && failures.length > 0) {
                // Determine severity based on payload, default to high since it's a DLQ event
                const isCritical = failures.some(f => ['critical', 'high'].includes(f.classification));

                ctx.waitUntil(
                    sendSlackAlert(env, {
                        pattern: 'DLQ_SYSTEM_FAILURE',
                        severity: isCritical ? 'critical' : 'high',
                        message: `PulsarJS failed to process ${failures.length} ingestion payloads into D1. They have been routed to DLQ_BUCKET for manual recovery.`,
                        url: 'system://dlq',
                        reasoning: 'System failure in ingestion pipeline. Check DLQ_BUCKET logs.',
                        clientId: 'SYSTEM',
                    }).catch((err) => {
                        logger.error('Slack alert failed from DLQ queue', { error: String(err) });
                    })
                );
            }

            return; // Exit D1 logic
        }

        // Primary Queue Processing
        const instanceId = `batch-${crypto.randomUUID()}`;
        const payloads = batch.messages.map(msg => msg.body);

        if (payloads.length === 0) return;

        try {
            logger.info('Forwarding batch to durable workflows', { instanceId, batchSize: payloads.length });

            // Spawn downstream Durable Workflows
            await Promise.all([
                env.STORAGE_WORKFLOW.create({ id: `storage-${instanceId}`, params: payloads }),
                env.ALERT_WORKFLOW.create({ id: `alert-${instanceId}`, params: payloads })
            ]);

        } catch (error) {
            logger.error('Failed to dispatch workflows', { error: String(error) });
            throw error; // Throwing triggers automatic Cloudflare Queue retry
        }
    }
};
