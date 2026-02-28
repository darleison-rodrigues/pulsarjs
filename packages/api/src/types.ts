import {
    KVNamespace,
    D1Database,
    Queue,
    R2Bucket
} from '@cloudflare/workers-types';
import { Logger } from './lib/logger';

export interface Env {
    // Services
    DLQ_BUCKET: R2Bucket;
    INGESTION_QUEUE: Queue<any>;

    // Workflows
    ALERT_WORKFLOW: any;
    STORAGE_WORKFLOW: any;
    // QUARANTINE_WORKFLOW is no longer used; remove binding if not required

    // KV Namespaces
    // CACHE is defined in wrangler but currently unused in code
    // SESSIONS KV was removed; keep declaration commented for future
    // SESSIONS: KVNamespace;
    // SECURITY_KV: KVNamespace; // Pending creation in wrangler

    // Database
    DB: D1Database;

    // Variables
    ENVIRONMENT: string;

    // Feature Flags & Secrets
    SESSION_SECRET?: string;
    PULSAR_INGEST_SECRET?: string; // PUL-014: HMAC Ingest Secret
    WEBHOOK_SECRET?: string;
    ENABLE_IP_ALLOWLIST?: string;
    ALLOWED_ORIGINS?: string;
    ADMIN_SECRET?: string;
    SLACK_WEBHOOK_URL?: string;
}

export interface WebVitals {
    lcp: number | null;
    inp: number | null;
    inp_interaction_id: number | null;
    cls: number | null;
    ttfb: number | null;
    loadTime: number | null;
}

export interface TelemetryEvent {
    client_id: string;
    site_id: string;
    storefront_type: string;
    session_id: string;
    timestamp: string;
    url: string;
    error_type: 'JS_CRASH' | 'API_FAILURE' | 'API_LATENCY' | 'UI_FAILURE' | 'RUM_METRICS' | 'QUEUE_OVERFLOW' | 'FLUSH_FAILED';
    severity: 'critical' | 'high' | 'warning' | 'low' | 'info';
    message: string;
    response_snippet?: string | null;
    status_code?: number | null;
    api_endpoint?: string | null;
    is_blocking?: boolean;
    device_type: 'mobile' | 'desktop';
    environment: {
        time_since_load: number;
        screen_resolution: string;
        timezone_offset: number;
        is_devtools_open: boolean;
    };
    metrics?: WebVitals;
    metadata?: Record<string, any>;
    scope?: {
        user: Record<string, any>;
        tags: Record<string, any>;
        extra: Record<string, any>;
        breadcrumbs: any[];
    };
    dropped_events?: number;
}

export interface Variables {
    requestId: string;
    logger: Logger;
    validatedBody?: TelemetryEvent; // Formalized
}
