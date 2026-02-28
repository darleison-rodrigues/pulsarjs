import { Context } from 'hono';
import { Env, Variables, TelemetryEvent } from '../types';


/**
 * POST /v1/ingest
 * Receives error payloads from the JS pixel, classifies them,
 * stores in D1, and returns 202 Accepted.
 */
export async function ingestHandler(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const logger = c.get('logger');
    const body = await c.req.json() as TelemetryEvent;
    const clientId = c.req.header('x-pulsar-client-id');

    if (!clientId) {
        return c.json({ error: 'Missing X-Pulsar-Client-Id header' }, 401);
    }

    // Basic Validation
    if (!body.error_type || !body.message || !body.session_id) {
        return c.json({ error: 'Missing required fields: error_type, message, session_id' }, 400);
    }

    const incidentId = crypto.randomUUID();
    const cfCountry = c.req.header('cf-ipcountry') || null;

    // We store the full body in the queue so StorageWorkflow has everything for R2
    c.executionCtx.waitUntil(
        c.env.INGESTION_QUEUE.send({
            ...body,
            incidentId,
            client_id: clientId,
            ip_country: cfCountry,
            timestamp: body.timestamp || new Date().toISOString()
        }).catch((err) => {
            logger.error('Queue send failed', { incidentId, error: String(err) });
        })
    );

    return c.json({
        status: 'accepted',
        incident_id: incidentId,
        classification: 'pending',
    }, 202);
}
