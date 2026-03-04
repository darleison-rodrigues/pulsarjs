/**
 * PulsarJS — Capture & Flush Pipeline
 * Queue management, deduplication, HMAC signing, beacon delivery, retry logic.
 *
 * PUL-030: flush() must NEVER call capture() — doing so creates infinite recursion.
 *          On exhausted retries, failed events are rescued back onto the queue.
 */
import { Sanitizers } from '../utils/sanitizers.js';

const MAX_QUEUE_SIZE = 50;

/**
 * Simple string hash for deduplication fingerprinting.
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
        // PUL-032: `debug` is now a parameter — safe regardless of module init order.
        if (debug) console.error('[Pulsar] HMAC generation failed', e);
        return null;
    }
}

// Module-level state reference (set by createCapturePipeline)
let state = null;

/**
 * Create the capture pipeline bound to shared SDK state.
 */
export function createCapturePipeline(sharedState) {
    state = sharedState;

    const _fingerprintCache = new Map();

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
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), state.config.beforeSendTimeout)
                );
                payload = await Promise.race([
                    Promise.resolve(state.config.beforeSend(payload)),
                    timeoutPromise
                ]);
            } catch (e) {
                if (e.message === 'timeout') {
                    if (state.config.debug) console.warn('[Pulsar] beforeSend timed out after ' + state.config.beforeSendTimeout + 'ms');
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
        flush();
    }

    async function flush() {
        if (state.queue.length === 0 && state.droppedSinceLastFlush === 0) return;

        // HMAC is the only auth mechanism now. No session token needed.
        if (!state.config.secret) {
            if (state.config.debug) console.warn('[Pulsar] No HMAC secret configured. Cannot flush.');
            return;
        }

        // Queue overflow synthetic event
        if (state.droppedSinceLastFlush > 0) {
            state.queue.unshift({
                client_id: state.config.clientId,
                storefront_type: state.config.storefrontType,
                site_id: state.config.siteId,
                session_id: state.sessionID,
                url: window.location.href,
                timestamp: new Date().toISOString(),
                error_type: "QUEUE_OVERFLOW",
                message: `Dropped ${state.droppedSinceLastFlush} events due to queue limits`,
                metadata: { dropped_count: state.droppedSinceLastFlush, first_drop_time: state.firstDropTimestamp },
                dropped_events: state.droppedEventsCount,
                severity: "warning",
                is_blocking: false
            });
            state.droppedSinceLastFlush = 0;
            state.firstDropTimestamp = null;
        }

        const payload = {
            pulsar_version: '1.0.0',
            client_id: state.config.clientId,
            site_id: state.config.siteId,
            timestamp: new Date().toISOString(),
            events: [...state.queue],
            dropped_events: state.droppedEventsCount
        };

        state.queue = [];

        const signature = await generateSignature(payload, state.config.secret, state.config.debug);
        const endpoint = state.config.endpoint;
        const nativeFetch = state.originalFetch || window.fetch;
        const payloadStr = JSON.stringify(payload);

        const headers = {
            'Content-Type': 'application/json',
            'X-Pulsar-Client-Id': state.config.clientId
        };
        if (signature) headers['X-Pulsar-Signature'] = signature;

        let success = false;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount <= maxRetries && !success) {
            try {
                if (retryCount === 0 && !signature && navigator.sendBeacon) {
                    const blob = new Blob([payloadStr], { type: 'text/plain' });
                    success = navigator.sendBeacon(endpoint, blob);
                }

                if (!success) {
                    const res = await nativeFetch(endpoint, {
                        method: 'POST',
                        headers: headers,
                        body: payloadStr,
                        keepalive: true
                    });
                    success = res.ok;
                }
            } catch (e) {
                // Network error — will retry
            }

            if (!success) {
                retryCount++;
                if (retryCount <= maxRetries) {
                    await new Promise(r => setTimeout(r, retryCount === 1 ? 500 : 1500));
                }
            }
        }

        if (!success) {
            // PUL-030: NEVER call capture() from inside flush() — it causes infinite recursion.
            // Strategy: log the failure, then rescue the failed batch back onto the front of the
            // queue so the events survive until the next flush attempt (page hide, next capture, etc.).
            if (state.config.debug) {
                console.error(
                    `[Pulsar] Failed to deliver event batch after ${maxRetries} retries. ` +
                    `${payload.events.length} event(s) rescued back onto queue.`
                );
            }

            // Rescue: prepend failed events back, honouring MAX_QUEUE_SIZE.
            // We do NOT re-queue the synthetic QUEUE_OVERFLOW event itself to avoid noise.
            const rescuable = payload.events.filter(e => e.error_type !== 'QUEUE_OVERFLOW');
            const combined = [...rescuable, ...state.queue];
            if (combined.length > MAX_QUEUE_SIZE) {
                const overflow = combined.length - MAX_QUEUE_SIZE;
                state.droppedEventsCount += overflow;
                state.queue = combined.slice(0, MAX_QUEUE_SIZE);
                if (state.config.debug) {
                    console.warn(`[Pulsar] Queue full during rescue — dropped ${overflow} oldest rescued event(s).`);
                }
            } else {
                state.queue = combined;
            }
        }
    }

    return { capture, flush };
}
