/**
 * PulsarJS — Capture & Flush Pipeline
 * Queue management, deduplication, beacon delivery, retry logic.
 *
 * Change log:
 *   PUL-030 — flush() never calls capture() — recursive FLUSH_FAILED eliminated (rescue pattern)
 *   PUL-030 — isFlushing guard — one flush in flight at a time (concurrency safety)
 *   PUL-030 — Queue snapshot before awaits — events arriving during flush are not lost
 *   PUL-030 — sendBeacon primary transport
 *   PUL-030 — flushOnHide() — page-hide path bypasses isFlushing (tab-close delivery)
 *   PUL-030 — 200 ms debounce — burst events collapse into one request
 *   PUL-030 — Rescue slice order — newest events survive capacity overflow
 *   PUL-030 — beforeSendTimeout uses ?? (not ||) — 0 is a valid caller-supplied value
 *   PUL-030 — QUEUE_OVERFLOW context captured at drop time, not flush time
 *   PUL-032 — module-level `state` singleton eliminated; each pipeline owns its closure
 */

import { Sanitizers as _Sanitizers } from '../utils/sanitizers.js';

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
 * Create the capture pipeline bound to shared SDK state.
 *
 * Each call returns an independent pipeline with its own closure — calling this
 * twice no longer overwrites a shared module-level variable (PUL-032).
 *
 * @param {object} sharedState
 * @returns {{ capture: Function, flush: Function, flushOnHide: Function }}
 */
const SEVERITY_RANK = { info: 0, warning: 1, error: 2 };
const ERROR_TYPES = new Set(['JS_CRASH', 'API_FAILURE', 'NETWORK_ERROR', 'UI_FAILURE']);

/**
 * PUL-029: Build session context and manifest from a batch of events.
 * Single pass over events — satisfies the "no double iteration" acceptance criterion.
 *
 * @param {Array} events - Snapshot of events to flush
 * @param {object} state - Shared SDK state
 * @returns {{ session: object, manifest: object }}
 */
function buildEnvelopeContext(events, state) {
    let minSeq = Infinity;
    let maxSeq = -Infinity;
    let maxSeverity = 'info';
    let hasErrors = false;
    let hasCommerce = false;
    let hasFrustration = false;
    let hasAbandonment = false;
    let hasDegradation = false;
    let hasProduct = false;
    const commerceActions = new Set();
    const productRefs = new Set();
    const pageTypesVisited = new Set();

    for (const event of events) {
        // seq_range — extract seq number from event_id (format: sessionID:seq)
        if (event.event_id) {
            const seq = parseInt(event.event_id.split(':').pop(), 10);
            if (seq < minSeq) minSeq = seq;
            if (seq > maxSeq) maxSeq = seq;
        }

        // max_severity
        if ((SEVERITY_RANK[event.severity] || 0) > SEVERITY_RANK[maxSeverity]) {
            maxSeverity = event.severity;
        }

        // type-specific predicates
        if (ERROR_TYPES.has(event.event_type)) {
            hasErrors = true;
        } else if (event.event_type === 'COMMERCE_ACTION') {
            hasCommerce = true;
            if (event.metadata?.action) commerceActions.add(event.metadata.action);
        } else if (event.event_type === 'RAGE_CLICK') {
            hasFrustration = true;
        } else if (event.event_type === 'PAGE_VIEW') {
            if (event.metadata?.page_type) pageTypesVisited.add(event.metadata.page_type);
            if (event.metadata?.product_ref) {
                hasProduct = true;
                productRefs.add(event.metadata.product_ref);
            }
        }

        // edge-hint-based predicates
        if (event.edge_hint === 'abandoned_at') hasAbandonment = true;
        if (event.edge_hint === 'degraded_by') hasDegradation = true;
    }

    // PERF: P6 — Shared envelope fields rebuilt on every flush
    // Cache static session fields on the state object during initialization/first-flush
    // to prevent reconstructing them on every flush. Reduces object allocation and GC churn per beacon.
    if (!state._cachedSessionBase) {
        state._cachedSessionBase = {
            session_id: state.sessionID,
            device_cohort: state.device?.device_cohort || null,
            started_at: state.sessionStartedAt,
            entry: {
                page_type: state.entryPageType,
                referrer_type: state.entryReferrerType,
                campaign_source: state.entryCampaignSource
            }
        };
    }

    const session = {
        ...state._cachedSessionBase,
        seq_range: minSeq <= maxSeq ? [minSeq, maxSeq] : null,
        page_count: state.pageCount
    };

    const manifest = {
        has_errors: hasErrors,
        has_commerce: hasCommerce,
        has_frustration: hasFrustration,
        has_abandonment: hasAbandonment,
        has_degradation: hasDegradation,
        has_product: hasProduct,
        commerce_actions: [...commerceActions],
        product_refs: [...productRefs],
        max_severity: maxSeverity,
        page_types_visited: [...pageTypesVisited]
    };

    return { session, manifest };
}

export function createCapturePipeline(sharedState) {
    // PUL-032: closure-scoped const — immutable per instance, no module singleton.
    const state = sharedState;

    const _fingerprintCache = new Map();
    let _eventSeq = 0;

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
        if (!state.enabled || !state.isInitialized) return null;

        // ── Deduplication ────────────────────────────────────────────────────
        // INVARIANT: fingerprint slot is claimed BEFORE any await so that
        // concurrent calls entering capture() simultaneously (e.g. identical
        // errors thrown in a promise storm) all see the cached slot and short-
        // circuit. There is no await between the cache check and the cache set.
        if (!bypassDedupe) {
            const fingerprint = hash(`${errorData.event_type}|${errorData.message}|${window.location.pathname}`);
            const isCheckout = /checkout/i.test(window.location.pathname);

            if (!isCheckout) {
                const now = Date.now();
                const cached = _fingerprintCache.get(fingerprint);
                if (cached && (now - cached.timestamp < 60000)) {
                    cached.count++;
                    return null;
                }
                // Claim the slot synchronously — before any await below.
                _fingerprintCache.set(fingerprint, { timestamp: now, count: 1 });
            }
        }

        const eventId = `${state.sessionID}:${++_eventSeq}`;
        let payload = {
            event_id: eventId,
            client_id: state.config.clientId,
            storefront_type: state.config.storefrontType,
            site_id: state.config.siteId,
            session_id: state.sessionID,
            url: state.sanitizer.sanitizeUrl(window.location.href),
            timestamp: new Date().toISOString(),
            event_type: errorData.event_type || errorData.error_type || 'UNKNOWN',
            message: state.sanitizer.redactPII(errorData.message || 'Unknown error'),
            response_snippet: errorData.response_snippet
                ? state.sanitizer.redactPII(errorData.response_snippet)
                : null,
            severity: errorData.severity || 'error',
            is_blocking: errorData.is_blocking || false,
            metrics: errorData.metrics || null,
            metadata: { ...errorData.metadata, ...state.extractPlatformContext() },
            environment: state.captureEnvironment(),
            device: state.device,
            status_code: errorData.status_code || null,
            scope: localScope.getScopeData(),
            dropped_events: state.droppedEventsCount
        };

        // PUL-028: edge hints — only include when present (not null)
        if (errorData.caused_by) {
            payload.caused_by = errorData.caused_by;
            payload.edge_hint = errorData.edge_hint;
        }

        // ── beforeSend hook ──────────────────────────────────────────────────
        const originalPayload = { ...payload }; // Snapshot in case of hook error
        if (typeof state.config.beforeSend === 'function') {
            let timeoutId;
            try {
                // ?? not || — callers may legitimately pass 0 to disable the timeout
                const timeoutMs = state.config.beforeSendTimeout ?? 2000;
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
                });
                payload = await Promise.race([
                    Promise.resolve(state.config.beforeSend(payload)),
                    timeoutPromise
                ]);
            } catch (e) {
                if (e.message === 'timeout') {
                    const ms = state.config.beforeSendTimeout ?? 2000;
                    // eslint-disable-next-line no-console
                        if (state.config?.debug) console.warn(`[Pulsar] beforeSend timed out after ${ms}ms`);
                    payload = originalPayload; // Fallback to original payload
                    if (state.config.allowUnconfirmedConsent) {
                        payload.metadata = payload.metadata || {};
                        payload.metadata.consent_unconfirmed = true;
                    } else {
                            if (state.config?.debug) {
                            // eslint-disable-next-line no-console
                            console.log('[Pulsar] Event dropped due to strict consent fallback');
                            return null;
                        }
                        return null;
                    }
                } else {
                    // eslint-disable-next-line no-console
                        if (state.config?.debug) console.warn('[Pulsar] beforeSend hook threw an error', e);
                    payload = originalPayload; // Fallback to original payload on throw
                }
            } finally {
                if (timeoutId) clearTimeout(timeoutId); // H3: Clear timeout to prevent leak
            }
        }

        if (payload === null) {
            // eslint-disable-next-line no-console
                if (state.config?.debug) console.log('[Pulsar] Event dropped by beforeSend hook');
            return null;
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

        return eventId;
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

        const { session, manifest } = buildEnvelopeContext(snapshot, state);
        const batch = {
            pulsar_version: __VERSION__,
            client_id: state.config.clientId,
            site_id: state.config.siteId,
            flushed_at: new Date().toISOString(),
            session,
            manifest,
            events: snapshot,
            product_refs: [...(state.productRefs || [])],
            dropped_events: state.droppedEventsCount,
            _unload: true  // signals ingest: page-hide beacon
        };
        state.productRefs = [];

        // SECURITY: C2
        const sanitizedBatch = state.sanitizer.sanitize(batch);
        if (!sanitizedBatch) return;
        const blob = new Blob([JSON.stringify(sanitizedBatch)], { type: 'application/json' });
        navigator.sendBeacon(state.config.endpoint, blob);
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
                event_type: 'QUEUE_OVERFLOW',
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
        const snapshot = [...state.queue];
        state.queue = [];
        const productSnapshot = [...(state.productRefs || [])];
        state.productRefs = [];

        const { session, manifest } = buildEnvelopeContext(snapshot, state);
        const batch = {
            pulsar_version: __VERSION__,
            client_id: state.config.clientId,
            site_id: state.config.siteId,
            flushed_at: new Date().toISOString(),
            session,
            manifest,
            events: snapshot,
            product_refs: productSnapshot,
            dropped_events: state.droppedEventsCount
        };
        state.productRefs = [];
        // ─────────────────────────────────────────────────────────────────────

        const endpoint = state.config.endpoint;
        const nativeFetch = state.originalFetch || window.fetch;
        // SECURITY: C2
        const sanitizedBatch = state.sanitizer.sanitize(batch);
        if (!sanitizedBatch) return;
        const payloadStr = JSON.stringify(sanitizedBatch);

        // ── sendBeacon — primary transport ────────────────────────────────────
        // Works during page unload, no CORS preflight, fire-and-forget.
        if (navigator.sendBeacon) {
            const blob = new Blob([payloadStr], { type: 'application/json' });
            if (navigator.sendBeacon(endpoint, blob)) {
                return; // delivered
            }
            // sendBeacon returned false — browser queue full or context restricted.
            // Fall through to fetch with retries.
            // eslint-disable-next-line no-console
            if (state.config?.debug) console.warn('[Pulsar] sendBeacon rejected. Falling back to fetch.');
        }

        // ── fetch fallback with retry ─────────────────────────────────────────
        const headers = {
            'Content-Type': 'application/json',
            'X-Pulsar-Client-Id': state.config.clientId
        };

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
                if (!success && state.config?.debug) {
                    // eslint-disable-next-line no-console
                    console.warn(`[Pulsar] Ingest returned HTTP ${res.status} on attempt ${attempt}/${maxRetries}.`);
                }
            } catch (e) {
                if (state.config?.debug) {
                    // eslint-disable-next-line no-console
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
            if (state.config?.debug) {
                // eslint-disable-next-line no-console
                console.error(
                    `[Pulsar] Failed to deliver ${batch.events.length} event(s) after ${maxRetries} retries. ` +
                    `Rescuing back onto queue.`
                );
            }

            const rescuable = batch.events.filter(e => e.event_type !== 'QUEUE_OVERFLOW');
            const combined = [...rescuable, ...state.queue]; // oldest → newest
            const overflow = combined.length - MAX_QUEUE_SIZE;
            if (overflow > 0) {
                state.droppedEventsCount += overflow;
                state.queue = combined.slice(-MAX_QUEUE_SIZE); // keep newest
                if (state.config?.debug) {
                    // eslint-disable-next-line no-console
                    console.warn(`[Pulsar] Queue full on rescue — dropped ${overflow} oldest event(s).`);
                }
            } else {
                state.queue = combined;
            }
        }
    }

    return { capture, flush, flushOnHide };
}
