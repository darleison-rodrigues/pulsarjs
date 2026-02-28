import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { Env, TelemetryEvent } from '../types';
import { streamToBigQuery } from '../lib/bigquery';

export class StorageWorkflow extends WorkflowEntrypoint<Env, TelemetryEvent[]> {
    async run(event: WorkflowEvent<TelemetryEvent[]>, step: WorkflowStep) {
        const events = event.payload;

        for (const ev of events) {
            const instanceId = crypto.randomUUID();

            await step.do(`persist-event-${instanceId}`, async () => {
                // Look up tenant routing
                const tenant = await this.env.DB.prepare(
                    'SELECT bq_dataset_id, r2_prefix FROM tenants WHERE client_id = ?'
                ).bind(ev.client_id).first<{ bq_dataset_id: string; r2_prefix: string }>();

                const datasetId = tenant?.bq_dataset_id || `tenant_${ev.client_id.replace(/-/g, '_')}`;
                const r2Prefix = tenant?.r2_prefix || `blobs/${ev.site_id}`;

                const results = await Promise.allSettled([
                    // Step 1: Write Gzip Blob to R2
                    (async () => {
                        const blob = new Blob([JSON.stringify(ev)], { type: 'application/json' });
                        const gzipStream = blob.stream().pipeThrough(new CompressionStream('gzip'));
                        await this.env.DLQ_BUCKET.put(`${r2Prefix}/${ev.timestamp}/${instanceId}.json.gz`, gzipStream);
                    })(),

                    // Step 2: Stream Metadata to BigQuery
                    (async () => {
                        await streamToBigQuery(this.env, datasetId, 'events', [ev]);
                    })(),

                    // Step 3: Sync Hot Metadata to D1 (Session tracking)
                    (async () => {
                        await this.env.DB.prepare(
                            'INSERT INTO sessions (session_id, client_id, site_id, last_event_at) VALUES (?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET last_event_at = excluded.last_event_at'
                        ).bind(
                            ev.session_id,
                            ev.client_id,
                            ev.site_id,
                            ev.timestamp
                        ).run();
                    })()
                ]);

                const failures = results.filter(r => r.status === 'rejected');
                if (failures.length > 0) {
                    console.error('[StorageWorkflow] Parallel persistence partial failure', failures);
                    throw new Error('Persistence failed');
                }
            });
        }
    }
}
