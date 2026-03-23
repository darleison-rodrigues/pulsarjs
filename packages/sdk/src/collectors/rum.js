/**
 * PulsarJS — RUM Collector
 * Core Web Vitals: LCP, INP, CLS, TTFB, FCP via PerformanceObserver.
 *
 * PUL-034: resetWebVitals() + SPA navigation hook for per-route accuracy.
 *   Fixes in this revision:
 *   (a) Wrong pipeline — captureRUM now pushes directly to state.queue; the
 *       error capture pipeline (state.capture) has incompatible semantics and
 *       was discarding all metric fields in favour of 'Unknown error'.
 *   (b) Wrong URL — pushState updates window.location synchronously before any
 *       callback fires; departingUrl is now captured before the state change so
 *       RUM payloads are attributed to the page whose metrics were measured.
 *   (c) isRouteChange compared against already-updated window.location.pathname;
 *       now compares against the tracked currentHref (the pre-navigation path).
 */

/**
 * Web Vitals accumulator — values are per-navigation.
 * Use captureRUM() to read; it snapshots safely before any reset can race it.
 */
export const webVitals = {
    lcp: null,
    inp: null,
    inp_interaction_id: null,
    cls: 0,
    ttfb: null,
    load_time_ms: null
};

/**
 * Reset all Web Vitals to initial state.
 * Always call AFTER captureRUM(), never before — resetting first sends zeros.
 */
export function resetWebVitals() {
    webVitals.lcp = null;
    webVitals.inp = null;
    webVitals.inp_interaction_id = null;
    webVitals.cls = 0;
    webVitals.ttfb = null;
    webVitals.load_time_ms = null;
}

/**
 * Set up PerformanceObserver for Web Vitals collection and install the SPA
 * navigation hook (PUL-034).
 *
 * @param {object} state - Shared SDK state
 */
export function setupPerformanceObserver(state) {
    if (typeof PerformanceObserver === 'undefined') return;

    // Initialize metrics in state if not present
    state.webVitals = state.webVitals || {
        lcp: null,
        inp: null,
        inp_interaction_id: null,
        cls: 0,
        ttfb: null,
        load_time_ms: null
    };

    const vitals = state.webVitals;

    try {
        // LCP — always take the latest entry (browser may emit several)
        new PerformanceObserver((entryList) => {
            try {
                const entries = entryList.getEntries();
                if (entries.length > 0) {
                    webVitals.lcp = entries[entries.length - 1].renderTime
                        || entries[entries.length - 1].loadTime;
                }
            } catch (e) {
                if (state.config?.debug) console.warn('[Pulsar] LCP observer failed', e);
            }
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        // INP — track worst interaction per navigation
        try {
            new PerformanceObserver((entryList) => {
                try {
                    entryList.getEntries().forEach(entry => {
                        if (!entry.interactionId) return;
                        if (vitals.inp === null || entry.duration > vitals.inp) {
                            vitals.inp = entry.duration;
                            vitals.inp_interaction_id = entry.interactionId;
                        }
                    });
                } catch (e) {
                    if (state.config?.debug) console.warn('[Pulsar] INP observer failed', e);
                }
            }).observe({ type: 'event', durationThreshold: 40, buffered: true });
        } catch (_) {
            // Fallback to FID for browsers without INP support
            new PerformanceObserver((entryList) => {
                try {
                    entryList.getEntries().forEach(entry => {
                        if (webVitals.inp === null) {
                            webVitals.inp = entry.processingStart - entry.startTime;
                        }
                    });
                } catch (e) {
                    if (state.config?.debug) console.warn('[Pulsar] FID observer failed', e);
                }
            }).observe({ type: 'first-input', buffered: true });
        }

        // CLS — accumulate all non-user-initiated layout shifts
        new PerformanceObserver((entryList) => {
            try {
                for (const entry of entryList.getEntries()) {
                    if (!entry.hadRecentInput) vitals.cls += entry.value;
                }
            } catch (e) {
                if (state.config?.debug) console.warn('[Pulsar] CLS observer failed', e);
            }
        }).observe({ type: 'layout-shift', buffered: true });

        // TTFB + Load Time (initial hard load only — SPA navigations via hook)
        window.addEventListener('load', () => {
            setTimeout(() => {
                try {
                    if (window.performance && window.performance.timing) {
                        const t = window.performance.timing;
                        webVitals.ttfb = Math.max(0, t.responseStart - t.navigationStart);
                        webVitals.load_time_ms = Math.max(0, t.loadEventEnd - t.navigationStart);
                    }
                } catch (e) {
                    if (state.config?.debug) console.warn('[Pulsar] load timing failed', e);
                }
            }, 0);
        });

    } catch (e) {
        // eslint-disable-next-line no-console
        if (state.config.debug) console.warn('[Pulsar] PerformanceObserver setup failed', e);
    }

    _installSpaNavigationHook(state);
}

/**
 * Listen to pulsar:route-change to detect client-side route changes.
 *
 * On each qualifying navigation:
 *   1. captureRUM(state, departingUrl) — flush departing page's metrics
 *   2. resetWebVitals()               — zero accumulators for next page
 *
 * Note: The pathname guard (which prevents spurious flushes for query/hash changes)
 * lives in `navigation.js`. This creates an implicit coupling with the
 * `pulsar:route-change` pattern.
 *
 * @param {object} state - Shared SDK state
 */
function _installSpaNavigationHook(state) {
    if (state.spaNavigationHandler) return; // idempotent

    function onSpaNavigate(event) {
        try {
            const { departingUrl } = event.detail;

            captureRUM(state, departingUrl); // attributed to the page we are leaving
            resetWebVitals();

            if (state.config.debug) {
                // eslint-disable-next-line no-console
                console.log('[Pulsar] SPA navigation — web vitals flushed and reset.');
            }
        } catch (e) {
            if (state.config?.debug) console.warn('[Pulsar] onSpaNavigate failed', e);
        }
    }

    state.spaNavigationHandler = onSpaNavigate;
    window.addEventListener('pulsar:route-change', state.spaNavigationHandler);
}

/**
 * Snapshot current Web Vitals and push directly onto the delivery queue.
 *
 * @param {object} state              - Shared SDK state
 * @param {string} [url]              - URL to attribute this payload to.
 *                                      Defaults to window.location.href (correct
 *                                      for the visibilitychange path where the
 *                                      page hasn't navigated yet).
 *                                      Pass departingUrl from the SPA hook to
 *                                      attribute metrics to the page they belong to.
 *
 * PIPELINE NOTE: this function pushes DIRECTLY to state.queue and calls
 * state.flush(). It does NOT go through state.capture() (the error pipeline).
 * Reason: state.capture() rebuilds an error-shaped payload from errorData.*
 * fields — it discards event_type, metrics, environment, and injects
 * 'Unknown error' as the message. RUM events routed through that pipeline
 * produce entirely malformed records on the backend.
 */
export function captureRUM(state, url = window.location.href) {
    try {
        if (!state.enabled || !state.isInitialized) return;

        const payload = {
            client_id: state.config.clientId,
            storefront_type: state.config.storefrontType,
            site_id: state.config.siteId,
            session_id: state.sessionID,
            url,                                    // attributed to departing page
            timestamp: new Date().toISOString(),
            event_type: 'RUM_METRICS',
            metrics: { ...webVitals },       // snapshot — not live reference
            metadata: state.extractPlatformContext(),
            environment: state.captureEnvironment()
        };

        state.queue.push(payload);

        // Trigger delivery. state.flush() is guarded by isFlushing — if a flush is
        // already in-flight, the finally block in capture.js schedules a follow-up.
        if (state.flush) state.flush();
    } catch (e) {
        if (state.config?.debug) console.warn('[Pulsar] captureRUM failed', e);
    }
}
