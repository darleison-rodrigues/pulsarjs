/**
 * PulsarJS — Capture & Flush Pipeline
 * Queue management, deduplication, HMAC signing, beacon delivery, retry logic.
 *
 * Fixed in this file:
 *   PUL-030 — flush() never calls capture() (rescue pattern)
 *   PUL-030 — isFlushing guard prevents concurrent flush corruption
 *   PUL-030 — Race condition: events arriving during flush awaits are preserved
 *   PUL-030 — sendBeacon is now the primary delivery path (signature in URL)
 *   PUL-030 — Rescue slice order: new events take priority over rescued batch
 *   PUL-030 — 200ms debounce collapses burst events into a single request
 *   PUL-032 — generateSignature takes debug as parameter (no module-level state ref)
 */
import { Sanitizers } from '../utils/sanitizers.js';

const MAX_QUEUE_SIZE = 50;

/**
 * Simple djb2-variant hash for deduplication fingerprinting only.
 * NOT suitable for cryptographic or security purposes.
 */
export function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return h.toString(36);
}

/**
 * Generate HMAC-SHA256 signature for payload authentication.
 * @param {object} payload  - The batch payload to sign.
 * @param {string} secret   - HMAC secret key.
 * @param {boolean} debug   - Whether to log errors (PUL-032: passed as arg, never reads module state).
 */
export async function generateSignature(payload, secret, debug = false) {
    if (!secret || typeof crypto === 'undefined' || !crypto.subtle) return null;
    try {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const msgData = encoder.encode(JSON.stringify(payload));
        const key = await crypto.subtle.importKey(
            'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', key, msgData);
        return btoa(String.fromCharCode(...new Uint8Array(signature)));
    } catch (e) {
        if (debug) console.error('[Pulsar] HMAC generation failed', e);
        return null;
    }
}

// Module-level state reference (set by createCapturePipeline).
// PUL-032 tracks full elimination of this singleton. For now it is constrained:
// generateSignature no longer touches it, and flush() only reads it after init.
let state = null;

/**
 * Create the capture pipeline bound to shared SDK state.
 * @returns {{ capture: Function, flush: Function }}
 */
export function createCapturePipeline(sharedState) {
    state = sharedState;

    const _fingerprintCache = new Map();

    // --- Flush scheduling state ---
    let flushTimer = null;   // debounce handle
    let isFlushing = false;  // concurrency guard: only one flush in flight at a time

    /**
     * Schedule a debounced flush (200 ms window).
     * Collapses burst captures (e.g. checkout page throwing 5 errors at once) into
     * a single network request instead of a request-per-event storm.
     */
    function scheduleFlush() {
        clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, 200);
    }

    async function capture(errorData, localScope = state.globalScope, bypassDedupe = false) {
        if (!state.enabled || !state.isInitialized) return;

        // Deduplication: suppress identical errors within 1 minute (except checkout)
        if (!bypassDedupe) {
            const fingerprint = hash(`${errorData.error_type}|${errorData.message}|${window.location.pathname}`);
            const isCheckout = /checkout/i.test(window.location.pathname);

            if (!isCheckout) {
                const now = Date.now();
                const cached = _fingerprintCache.get(fingerprint);
                if (cached && (now - cached.timestamp < 60000)) {
                    cached.count++;
                    return;
                }
                _fingerprintCache.set(fingerprint, { timestamp: now, count: 1 });
            }
        }

        let payload = {
            client_id: state.config.clientId,
            storefront_type: state.config.storefrontType,
            site_id: state.config.siteId,
            session_id: state.sessionID,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            error_type: errorData.error_type,
            message: Sanitizers.redactPII(errorData.message || 'Unknown error'),
            response_snippet: errorData.response_snippet ? Sanitizers.redactPII(errorData.response_snippet) : null,
            severity: errorData.severity || 'error',
            is_blocking: errorData.is_blocking || false,
            metadata: { ...errorData.metadata, ...state.extractSFCCContext() },
            environment: state.captureEnvironment(),
            device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            status_code: errorData.status_code || null,
            scope: localScope.getScopeData(),
            dropped_events: state.droppedEventsCount
        };

        // Async beforeSend with timeout circuit breaker
        if (typeof state.config.beforeSend === 'function') {
            try {
                const timeoutMs = state.config.beforeSendTimeout || 2000;
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), timeoutMs)
                );
                payload = await Promise.race([
                    Promise.resolve(state.config.beforeSend(payload)),
                    timeoutPromise
                ]);
            } catch (e) {
                if (e.message === 'timeout') {
                    if (state.config.debug) console.warn('[Pulsar] beforeSend timed out after ' + (state.config.beforeSendTimeout || 2000) + 'ms');
                    if (state.config.allowUnconfirmedConsent) {
                        payload.metadata = payload.metadata || {};
                        payload.metadata.consent_unconfirmed = true;
                    } else {
                        if (state.config.debug) console.log('[Pulsar] Event dropped due to strict consent fallback');
                        return;
                    }
                } else {
                    if (state.config.debug) console.warn('[Pulsar] beforeSend hook threw an error', e);
                }
            }
        }

        if (payload === null) {
            if (state.config.debug) console.log('[Pulsar] Event dropped by beforeSend hook');
            return;
        }

        state.queue.push(payload);
        if (state.queue.length > MAX_QUEUE_SIZE) {
            state.queue.shift();
            state.droppedEventsCount++;
            state.droppedSinceLastFlush++;
            if (!state.firstDropTimestamp) state.firstDropTimestamp = new Date().toISOString();
        }

        // Debounced flush — never call flush() directly from capture().
        scheduleFlush();
    }

    /**
     * Deliver all queued events to the ingest endpoint.
     *
     * Concurrency: protected by isFlushing — a second call while a flush is in
     * flight returns immediately. The debounce in scheduleFlush() will re-trigger
     * once the current flush settles if new events arrived in the meantime.
     *
     * Race condition: state.queue is cleared into a local snapshot BEFORE any
     * awaits. Events pushed by capture() during the async window accumulate in
     * a fresh state.queue and are preserved regardless of delivery outcome.
     */
    async function flush() {
        // Concurrency guard — one flush in flight at a time.
        if (isFlushing) return;
        if (state.queue.length === 0 && state.droppedSinceLastFlush === 0) return;

        if (!state.config.secret) {
            if (state.config.debug) console.warn('[Pulsar] No HMAC secret configured. Cannot flush.');
            return;
        }

        isFlushing = true;
        flushTimer = null; // we are running now, clear the pending timer id

        try {
            // Inject synthetic QUEUE_OVERFLOW sentinel if events were dropped.
            if (state.droppedSinceLastFlush > 0) {
                state.queue.unshift({
                    client_id: state.config.clientId,
                    storefront_type: state.config.storefrontType,
                    site_id: state.config.siteId,
                    session_id: state.sessionID,
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    error_type: 'QUEUE_OVERFLOW',
                    message: `Dropped ${state.droppedSinceLastFlush} events due to queue limits`,
                    metadata: { dropped_count: state.droppedSinceLastFlush, first_drop_time: state.firstDropTimestamp },
                    dropped_events: state.droppedEventsCount,
                    severity: 'warning',
                    is_blocking: false
                });
                state.droppedSinceLastFlush = 0;
                state.firstDropTimestamp = null;
            }

            // ── Race condition fix ────────────────────────────────────────────────────
            // Snapshot the queue NOW, then immediately reset state.queue to an empty
            // array. Any capture() calls that fire during the async operations below
            // will push into a fresh queue and will NOT be lost, regardless of whether
            // this flush succeeds or fails.
            const batch = {
                pulsar_version: '1.0.0',
                client_id: state.config.clientId,
                site_id: state.config.siteId,
                timestamp: new Date().toISOString(),
                events: [...state.queue],
                dropped_events: state.droppedEventsCount
            };
            state.queue = []; // new events from here on go into a fresh array
            // ─────────────────────────────────────────────────────────────────────────

            const signature = await generateSignature(batch, state.config.secret, state.config.debug);
            const endpoint = state.config.endpoint;
            const nativeFetch = state.originalFetch || window.fetch;
            const payloadStr = JSON.stringify(batch);

            // ── sendBeacon as primary delivery path ────────────────────────────────
            // sendBeacon works during page unload and requires no CORS preflight.
            // The HMAC signature travels as a URL query parameter because the Beacon
            // API does not support custom request headers.
            // ─────────────────────────────────────────────────────────────────────
            if (navigator.sendBeacon) {
                const beaconUrl = signature
                    ? `${endpoint}?sig=${encodeURIComponent(signature)}`
                    : endpoint;
                const blob = new Blob([payloadStr], { type: 'application/json' });
                if (navigator.sendBeacon(beaconUrl, blob)) {
                    // Delivered. Any events that arrived during generateSignature are
                    // already safely in state.queue for the next flush cycle.
                    return;
                }
                // sendBeacon returned false (queue full, not supported in this context).
                // Fall through to fetch with retries.
                if (state.config.debug) console.warn('[Pulsar] sendBeacon rejected. Falling back to fetch.');
            }

            // ── fetch fallback with retry ──────────────────────────────────────────
            const headers = {
                'Content-Type': 'application/json',
                'X-Pulsar-Client-Id': state.config.clientId
            };
            if (signature) headers['X-Pulsar-Signature'] = signature;

            let success = false;
            const maxRetries = 3;

            for (let attempt = 1; attempt <= maxRetries && !success; attempt++) {
                try {
                    const res = await nativeFetch(endpoint, {
                        method: 'POST',
                        headers,
                        body: payloadStr,
                        keepalive: true
                    });
                    success = res.ok;
                    if (!success && state.config.debug) {
                        console.warn(`[Pulsar] Ingest returned HTTP ${res.status} on attempt ${attempt}/${maxRetries}.`);
                    }
                } catch (e) {
                    // Network-level failure (offline, DNS, CORS).
                    if (state.config.debug) {
                        console.warn(`[Pulsar] fetch attempt ${attempt}/${maxRetries} failed:`, e.message);
                    }
                }

                if (!success && attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, attempt === 1 ? 500 : 1500));
                }
            }

            if (!success) {
                // ── Event rescue ─────────────────────────────────────────────────────
                // PUL-030: NEVER call capture() from flush() — infinite recursion.
                //
                // Rescue the failed batch by merging it with events that arrived
                // during the retry window. Priority is RECENCY: newest events survive
                // if the combined set exceeds MAX_QUEUE_SIZE.
                //
                //   state.queue  = events that arrived DURING this flush (newest)
                //   rescuable    = events from the failed batch        (older)
                //   combined     = [older…, newer…] — time-ordered oldest→newest
                //   .slice(-MAX_QUEUE_SIZE) drops oldest when over capacity
                // ─────────────────────────────────────────────────────────────────────
                if (state.config.debug) {
                    console.error(
                        `[Pulsar] Failed to deliver ${batch.events.length} event(s) after ${maxRetries} retries. ` +
                        `Rescuing back onto queue.`
                    );
                }

                const rescuable = batch.events.filter(e => e.error_type !== 'QUEUE_OVERFLOW');
                const combined = [...rescuable, ...state.queue]; // oldest first
                const overflow = combined.length - MAX_QUEUE_SIZE;
                if (overflow > 0) {
                    state.droppedEventsCount += overflow;
                    state.queue = combined.slice(-MAX_QUEUE_SIZE); // keep newest
                    if (state.config.debug) {
                        console.warn(`[Pulsar] Queue full on rescue — dropped ${overflow} oldest event(s).`);
                    }
                } else {
                    state.queue = combined;
                }
            }
        } finally {
            isFlushing = false;
            // If new events accumulated while we were flushing, schedule another flush.
            if (state.queue.length > 0) {
                scheduleFlush();
            }
        }
    }

    return { capture, flush };
}
