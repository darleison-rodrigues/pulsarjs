/**
 * PulsarJS — Capture & Flush Pipeline
 * Queue management, deduplication, beacon delivery, retry logic.
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
 * Create the capture pipeline bound to shared SDK state.
 */
export function createCapturePipeline(state) {
    const _fingerprintCache = new Map();
    let _flushTimer = null;
    let _eventSeq = 0;

    /**
     * Periodic cleanup of fingerprint cache to prevent memory leaks (H1)
     */
    function _cleanupFingerprintCache() {
        if (_fingerprintCache.size > 1000) {
            const now = Date.now();
            for (const [key, val] of _fingerprintCache.entries()) {
                if (now - val.timestamp > 300000) { // 5 minutes TTL
                    _fingerprintCache.delete(key);
                }
            }
        }
    }

    async function capture(errorData, localScope = state.globalScope, bypassDedupe = false, bypassFlush = false) {
        if (!state.enabled || !state.isInitialized) return;

        _cleanupFingerprintCache();

        // Deduplication: suppress identical errors within 1 minute (except checkout)
        if (!bypassDedupe) {
            const fingerprint = hash(`${errorData.event_type}|${errorData.message}|${window.location.pathname}`);
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
            event_id: `${state.sessionID}:${++_eventSeq}`,
            client_id: state.config.clientId,
            storefront_type: state.config.storefrontType,
            site_id: state.config.siteId,
            session_id: state.sessionID,
            url: Sanitizers.sanitizeUrl(window.location.href),
            timestamp: new Date().toISOString(),
            event_type: errorData.event_type || errorData.error_type || 'UNKNOWN',
            message: Sanitizers.redactPII(errorData.message || 'Unknown error'),
            response_snippet: errorData.response_snippet ? Sanitizers.redactPII(errorData.response_snippet) : null,
            severity: errorData.severity || 'info',
            is_blocking: errorData.is_blocking || false,
            metrics: errorData.metrics || null,
            metadata: { ...errorData.metadata, ...state.extractSFCCContext() },
            environment: state.captureEnvironment(),
            device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            status_code: errorData.status_code || null,
            scope: localScope.getScopeData(),
            dropped_events: state.droppedEventsCount
        };

        // Async beforeSend with timeout circuit breaker
        if (typeof state.config.beforeSend === 'function') {
            let timeoutId;
            try {
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('timeout')), state.config.beforeSendTimeout);
                });
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
            } finally {
                clearTimeout(timeoutId); // H3: Clear timeout to prevent leak
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

        if (!bypassFlush) {
            // H2: Debounced flush
            if (_flushTimer) clearTimeout(_flushTimer);
            _flushTimer = setTimeout(() => flush(), 2000);
        }
    }

    async function flush() {
        if (_flushTimer) {
            clearTimeout(_flushTimer);
            _flushTimer = null;
        }

        if (state.queue.length === 0 && state.droppedSinceLastFlush === 0) return;

        // Queue overflow synthetic event
        if (state.droppedSinceLastFlush > 0) {
            state.queue.unshift({
                client_id: state.config.clientId,
                storefront_type: state.config.storefrontType,
                site_id: state.config.siteId,
                session_id: state.sessionID,
                url: Sanitizers.sanitizeUrl(window.location.href),
                timestamp: new Date().toISOString(),
                event_type: "QUEUE_OVERFLOW",
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
            pulsar_version: '1.0.0', // M8: Should be injected at build time, but for now kept as is
            client_id: state.config.clientId,
            site_id: state.config.siteId,
            timestamp: new Date().toISOString(),
            events: [...state.queue],
            dropped_events: state.droppedEventsCount
        };

        state.queue = [];

        const endpoint = state.config.endpoint;
        const nativeFetch = state.originalFetch || window.fetch;
        const payloadStr = JSON.stringify(payload);

        const headers = {
            'Content-Type': 'application/json',
            'X-Pulsar-Client-Id': state.config.clientId
        };

        let success = false;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount <= maxRetries && !success) {
            try {
                // If it's the first attempt and Beacon API is available, try it for redundancy
                // Note: Beacon doesn't support custom headers, but client_id is in the body.
                if (retryCount === 0 && navigator.sendBeacon) {
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
            } catch (_e) {
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
            if (state.config.debug) console.error('[Pulsar] Failed to deliver event batch after ' + maxRetries + ' retries');
            // C2: Prevent infinite recursion by passing bypassFlush = true
            capture({
                event_type: "FLUSH_FAILED",
                message: `Failed to deliver event batch`,
                severity: "error",
                is_blocking: false
            }, state.globalScope, true, true);
        }
    }

    return { capture, flush };
}
