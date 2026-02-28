import { Env } from '../types';

export async function streamToBigQuery(env: Env, datasetId: string, tableId: string, rows: any[]) {
    // Note: This requires a Google Cloud Service Account with BigQuery Data Editor role.
    // For the soft launch, we'll use a simplified fetch. 
    // In production, you'd use an OAuth2 token generated from a Service Account JSON.

    const projectId = 'pulsarjs-project-id'; // TODO: Move to Env
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables/${tableId}/insertAll`;

    const payload = {
        kind: "bigquery#tableDataInsertAllRequest",
        rows: rows.map(row => ({
            json: row,
            insertId: crypto.randomUUID()
        }))
    };

    // We expect a GOOGLE_OAUTH_TOKEN to be provided or managed via a separate service/middleware
    // For now, we'll log the intention.
    if (!env.ADMIN_SECRET) {
        console.warn('[Storage] BigQuery sync skipped: Missing credentials');
        return;
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.ADMIN_SECRET}` // placeholder for OAuth token
        },
        body: JSON.stringify(payload)
    });

    return res.ok;
}
