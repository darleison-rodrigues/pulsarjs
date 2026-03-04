/**
 * PulsarJS — Capture & Flush Pipeline
 * Queue management, deduplication, HMAC signing, beacon delivery, retry logic.
 *
 * Change log (PUL-030 series):
 *   - flush() never calls capture() — recursive FLUSH_FAILED eliminated (rescue pattern)
 *   - isFlushing guard — one flush in flight at a time (concurrency safety)
 *   - Queue snapshot before awaits — events arriving during flush are not lost
 *   - sendBeacon primary transport — HMAC signature wrapped inside body, NOT in URL
 *   - flushOnHide() — page-hide path bypasses isFlushing (tab-close delivery)
 *   - 200 ms debounce — burst events collapse into one request
 *   - Rescue slice order — newest events survive capacity overflow
 *   - beforeSendTimeout uses ?? (not ||) — 0 is a valid caller-supplied value
 *   - QUEUE_OVERFLOW context captured at drop time, not flush time
 *   - generateSignature takes debug param — no module-level state reference
 */
import { Sanitizers } from '../utils/sanitizers.js';

const MAX_QUEUE_SIZE = 50;

/**
 * Simple djb2-variant hash for deduplication fingerprinting only.
 * NOT suitable for cryptographic or security purposes.
 *
 * @param {string} str
 * @returns {string}
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
 * Generate HMAC-SHA256 signature over a payload object.
 *
 * Takes `debug` as an explicit argument (never reads module-level `state`) so
 * it is safe to call before createCapturePipeline has initialised.
 *
 * @param {object}  payload
 * @param {string}  secret
 * @param {boolean} [debug=false]
 * @returns {Promise<string|null>}
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
        const sig = await crypto.subtle.sign('HMAC', key, msgData);
        return btoa(String.fromCharCode(...new Uint8Array(sig)));
    } catch (e) {
        if (debug) console.error('[Pulsar] HMAC generation failed', e);
        return null;
    }
}

// Module-level state reference — set once by createCapturePipeline.
// PUL-032 tracks elimination of this singleton (multi-tenant correctness).
// For now: generateSignature does NOT touch it; all other uses are post-init.
let state = null;

/**
 * Build a sendBeacon-compatible Blob.
 * The HMAC signature is wrapped inside the body — NEVER in the URL — to prevent
 * it appearing in server/CDN access logs, Referer headers, or browser history,
 * and to eliminate replay-attack surface from static URL+signature pairs.
 *
 * Wire format: { sig: string|null, payload: BatchObject }
 * The ingest worker extracts `sig`, re-computes HMAC over `payload`, and rejects
 * on mismatch before touching any event data.
 *
 * @param {object}      batch
 * @param {string|null} signature
 * @returns {Blob}
 */
function buildBeaconBlob(batch, signature) {
    return new Blob(
        [JSON.stringify({ sig: signature, payload: batch })],
        { type: 'application/json' }
    );
}

/**
 * Create the capture pipeline bound to shared SDK state.
 *
 * @param {object} sharedState
 * @returns {{ capture: Function, flush: Function, flushOnHide: Function }}
 */
export function createCapturePipeline(sharedState) {
    state = sharedState;

    const _fingerprintCache = new Map();

    // --- Flush scheduling ---
    let flushTimer = null;
    let isFlushing = false;

    /**
     * Schedule a debounced flush (200 ms).
     * Collapses burst captures — e.g. a broken checkout page emitting 5 errors
     * in one tick — into a single network request.
     */
    function scheduleFlush() {
        clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, 200);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // capture()
    // ─────────────────────────────────────────────────────────────────────────
    async function capture(errorData, localScope = state.globalScope, bypassDedupe = false) {
        if (!state.enabled || !state.isInitialized) return;

        // ── Deduplication ────────────────────────────────────────────────────
        // INVARIANT: fingerprint slot is claimed BEFORE any await so that
        // concurrent calls entering capture() simultaneously (e.g. identical
        // errors thrown in a promise storm) all see the cached slot and short-
        // circuit. There is no await between the cache check and the cache set.
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
                // Claim the slot synchronously — before any await below.
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
            response_snippet: errorData.response_snippet
                ? Sanitizers.redactPII(errorData.response_snippet)
                : null,
            severity: errorData.severity || 'error',
            is_blocking: errorData.is_blocking || false,
            metadata: { ...errorData.metadata, ...state.extractSFCCContext() },
            environment: state.captureEnvironment(),
            device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            status_code: errorData.status_code || null,
            scope: localScope.getScopeData(),
            dropped_events: state.droppedEventsCount
        };

        // ── beforeSend hook ──────────────────────────────────────────────────
        if (typeof state.config.beforeSend === 'function') {
            try {
                // ?? not || — callers may legitimately pass 0 to disable the timeout
                const timeoutMs = state.config.beforeSendTimeout ?? 2000;
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), timeoutMs)
                );
                payload = await Promise.race([
                    Promise.resolve(state.config.beforeSend(payload)),
                    timeoutPromise
                ]);
            } catch (e) {
                if (e.message === 'timeout') {
                    const ms = state.config.beforeSendTimeout ?? 2000;
                    if (state.config.debug) console.warn(`[Pulsar] beforeSend timed out after ${ms}ms`);
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

        // ── Enqueue ──────────────────────────────────────────────────────────
        state.queue.push(payload);
        if (state.queue.length > MAX_QUEUE_SIZE) {
            state.queue.shift();
            state.droppedEventsCount++;
            state.droppedSinceLastFlush++;
            // Snapshot drop context at the moment of overflow — URL and session
            // may differ by flush time in SPA navigations.
            if (!state.firstDropTimestamp) state.firstDropTimestamp = new Date().toISOString();
            if (!state.firstDropUrl) state.firstDropUrl = window.location.href;
            if (!state.firstDropSessionId) state.firstDropSessionId = state.sessionID;
        }

        scheduleFlush();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // flush()  — normal path, protected by isFlushing
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Deliver all queued events.
     *
     * Concurrency: isFlushing prevents overlapping executions. The finally block
     * calls scheduleFlush() if new events arrived while this flush was running,
     * ensuring they are not stranded.
     *
     * Race condition: queue is snapshotted and cleared BEFORE any await. Events
     * pushed during async operations go into a fresh state.queue and survive
     * regardless of delivery outcome.
     */
    async function flush() {
        if (isFlushing) return;
        if (state.queue.length === 0 && state.droppedSinceLastFlush === 0) return;
        if (!state.config.secret) {
            if (state.config.debug) console.warn('[Pulsar] No HMAC secret configured. Cannot flush.');
            return;
        }

        isFlushing = true;
        flushTimer = null;

        try {
            await _doFlush();
        } finally {
            isFlushing = false;
            // Drain any events that accumulated during the async flush window.
            if (state.queue.length > 0) scheduleFlush();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // flushOnHide()  — page-hide path, bypasses isFlushing
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * ONLY for use in a visibilitychange → hidden handler.
     *
     * Why this exists: sendBeacon is the entire point of the page-hide path.
     * If a normal flush is in-flight (isFlushing = true), events that arrived
     * during its retry window sit in state.queue with no scheduled flush — the
     * debounce timer either fired already or was cleared. On tab close, those
     * events are lost. This function bypasses the guard and fires a best-effort
     * beacon synchronously.
     *
     * Limitations:
     *  - generateSignature is async (crypto.subtle). By the time it resolves,
     *    the browser may have already torn down the context. We therefore send
     *    WITHOUT a signature on page hide and mark the batch with _unload: true
     *    so the ingest layer can apply an appropriate trust level.
     *  - If sendBeacon is unavailable, events are silently lost (expected: there
     *    is no reliable synchronous delivery alternative on unload).
     */
    function flushOnHide() {
        if (!navigator.sendBeacon) return;
        if (!state.config.endpoint) return;
        if (state.queue.length === 0 && state.droppedSinceLastFlush === 0) return;

        clearTimeout(flushTimer);
        flushTimer = null;

        const snapshot = [...state.queue];
        state.queue = [];
        state.droppedSinceLastFlush = 0;
        state.firstDropTimestamp = null;
        state.firstDropUrl = null;
        state.firstDropSessionId = null;

        const batch = {
            pulsar_version: '1.0.0',
            client_id: state.config.clientId,
            site_id: state.config.siteId,
            timestamp: new Date().toISOString(),
            events: snapshot,
            dropped_events: state.droppedEventsCount,
            _unload: true  // signals ingest: unsigned page-hide beacon
        };

        // sig: null — cannot await crypto.subtle in an unload handler
        navigator.sendBeacon(state.config.endpoint, buildBeaconBlob(batch, null));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // _doFlush()  — inner implementation, called by flush() inside try/finally
    // ─────────────────────────────────────────────────────────────────────────
    async function _doFlush() {
        // Inject QUEUE_OVERFLOW sentinel with context captured at drop time.
        if (state.droppedSinceLastFlush > 0) {
            state.queue.unshift({
                client_id: state.config.clientId,
                storefront_type: state.config.storefrontType,
                site_id: state.config.siteId,
                // Use the session and URL from when the drop occurred, not now.
                session_id: state.firstDropSessionId || state.sessionID,
                url: state.firstDropUrl || window.location.href,
                timestamp: new Date().toISOString(),
                error_type: 'QUEUE_OVERFLOW',
                message: `Dropped ${state.droppedSinceLastFlush} events due to queue limits`,
                metadata: {
                    dropped_count: state.droppedSinceLastFlush,
                    first_drop_time: state.firstDropTimestamp,
                    first_drop_url: state.firstDropUrl,
                },
                dropped_events: state.droppedEventsCount,
                severity: 'warning',
                is_blocking: false
            });
            state.droppedSinceLastFlush = 0;
            state.firstDropTimestamp = null;
            state.firstDropUrl = null;
            state.firstDropSessionId = null;
        }

        // ── Race condition fix ────────────────────────────────────────────────
        // Snapshot + clear BEFORE any await. Captures that fire during the async
        // operations below push into a fresh state.queue and are preserved
        // regardless of this flush's outcome.
        const batch = {
            pulsar_version: '1.0.0',
            client_id: state.config.clientId,
            site_id: state.config.siteId,
            timestamp: new Date().toISOString(),
            events: [...state.queue],
            dropped_events: state.droppedEventsCount
        };
        state.queue = [];
        // ─────────────────────────────────────────────────────────────────────

        const signature = await generateSignature(batch, state.config.secret, state.config.debug);
        const endpoint = state.config.endpoint;
        const nativeFetch = state.originalFetch || window.fetch;

        // ── sendBeacon — primary transport ────────────────────────────────────
        // Works during page unload, no CORS preflight, fire-and-forget.
        // HMAC signature is wrapped inside the body — never in the URL — to
        // prevent it appearing in access logs, Referer headers, or browser
        // history (which would enable replay attacks with a static URL+sig pair).
        if (navigator.sendBeacon) {
            if (navigator.sendBeacon(endpoint, buildBeaconBlob(batch, signature))) {
                return; // delivered
            }
            // sendBeacon returned false — browser queue full or context restricted.
            // Fall through to fetch with retries.
            if (state.config.debug) console.warn('[Pulsar] sendBeacon rejected. Falling back to fetch.');
        }

        // ── fetch fallback with retry ─────────────────────────────────────────
        const headers = {
            'Content-Type': 'application/json',
            'X-Pulsar-Client-Id': state.config.clientId
        };
        if (signature) headers['X-Pulsar-Signature'] = signature;

        let success = false;
        const maxRetries = 3;
        const payloadStr = JSON.stringify(batch);

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
                if (state.config.debug) {
                    console.warn(`[Pulsar] fetch attempt ${attempt}/${maxRetries} failed:`, e.message);
                }
            }

            if (!success && attempt < maxRetries) {
                await new Promise(r => setTimeout(r, attempt === 1 ? 500 : 1500));
            }
        }

        if (!success) {
            // ── Event rescue ──────────────────────────────────────────────────
            // NEVER call capture() from inside flush() — infinite recursion.
            //
            //   state.queue  = events that arrived DURING this flush (newest)
            //   rescuable    = events from the failed batch        (older)
            //   combined     = [older … newer]  (time-ordered oldest→newest)
            //   .slice(-N)   = keep the newest N — oldest are dropped first
            if (state.config.debug) {
                console.error(
                    `[Pulsar] Failed to deliver ${batch.events.length} event(s) after ${maxRetries} retries. ` +
                    `Rescuing back onto queue.`
                );
            }

            const rescuable = batch.events.filter(e => e.error_type !== 'QUEUE_OVERFLOW');
            const combined = [...rescuable, ...state.queue]; // oldest → newest
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
    }

    return { capture, flush, flushOnHide };
}
