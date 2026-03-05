/**
 * PulsarJS — RUM Collector
 * Core Web Vitals: LCP, INP, CLS, TTFB, FCP via PerformanceObserver.
 *
 * PUL-034: resetWebVitals() added. SPA navigation hook (pushState / replaceState
 * / popstate) flushes the departing page's metrics then resets accumulators so
 * the next route starts clean. Without this, CLS accumulates across all routes
 * and LCP/INP never reset in PWA Kit (React SPA, no full page reload).
 */

/**
 * Web Vitals accumulator — values are per-navigation.
 * Never read this reference directly from outside this module;
 * use captureRUM() which snapshots it safely.
 */
export const webVitals = {
    lcp: null,
    inp: null,
    inp_interaction_id: null,
    cls: 0,
    ttfb: null,
    loadTime: null
};

/**
 * Reset all Web Vitals to their initial (pre-navigation) state.
 *
 * Must be called on every SPA navigation AFTER flushing the departing page's
 * metrics. Calling it before captureRUM() would send zeros — always flush first.
 */
export function resetWebVitals() {
    webVitals.lcp = null;
    webVitals.inp = null;
    webVitals.inp_interaction_id = null;
    webVitals.cls = 0;
    webVitals.ttfb = null;
    webVitals.loadTime = null;
}

/**
 * Set up PerformanceObserver for Web Vitals collection and install the SPA
 * navigation hook (PUL-034).
 *
 * @param {object} state - Shared SDK state
 */
export function setupPerformanceObserver(state) {
    if (typeof PerformanceObserver === 'undefined') return;

    try {
        // LCP — always take the latest entry (browser may emit several)
        new PerformanceObserver((entryList) => {
            const entries = entryList.getEntries();
            if (entries.length > 0) {
                webVitals.lcp = entries[entries.length - 1].renderTime
                    || entries[entries.length - 1].loadTime;
            }
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        // INP (replaces deprecated FID) — track worst interaction
        try {
            new PerformanceObserver((entryList) => {
                entryList.getEntries().forEach(entry => {
                    if (!entry.interactionId) return;
                    if (webVitals.inp === null || entry.duration > webVitals.inp) {
                        webVitals.inp = entry.duration;
                        webVitals.inp_interaction_id = entry.interactionId;
                    }
                });
            }).observe({ type: 'event', durationThreshold: 40, buffered: true });
        } catch (_) {
            // Fallback to FID for browsers without INP support
            new PerformanceObserver((entryList) => {
                entryList.getEntries().forEach(entry => {
                    if (webVitals.inp === null) {
                        webVitals.inp = entry.processingStart - entry.startTime;
                    }
                });
            }).observe({ type: 'first-input', buffered: true });
        }

        // CLS — accumulate all non-user-initiated layout shifts
        new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
                if (!entry.hadRecentInput) webVitals.cls += entry.value;
            }
        }).observe({ type: 'layout-shift', buffered: true });

        // TTFB + Load Time (initial page load only — SPA navigations handled by hook)
        window.addEventListener('load', () => {
            setTimeout(() => {
                if (window.performance && window.performance.timing) {
                    const t = window.performance.timing;
                    webVitals.ttfb = Math.max(0, t.responseStart - t.navigationStart);
                    webVitals.loadTime = Math.max(0, t.loadEventEnd - t.navigationStart);
                }
            }, 0);
        });

    } catch (e) {
        if (state.config.debug) console.warn('[Pulsar] PerformanceObserver setup failed', e);
    }

    // Install the SPA navigation hook after observers are live (PUL-034).
    _installSpaNavigationHook(state);
}

/**
 * Monkey-patch history.pushState / history.replaceState and listen to popstate
 * so every client-side route change is detected.
 *
 * On each navigation:
 *   1. captureRUM(state)  — flush the departing page's accumulated metrics
 *   2. resetWebVitals()   — zero accumulators so the next page starts clean
 *
 * Order matters: flush THEN reset. Resetting first would send zeros.
 *
 * All patched references are stored on state so disable() can restore them.
 *
 * @param {object} state - Shared SDK state
 */
function _installSpaNavigationHook(state) {
    // Guard: prevent double-patching if setupPerformanceObserver is called again.
    if (state.originalPushState) return;

    function onSpaNavigate() {
        captureRUM(state);   // flush departing page — must run before reset
        resetWebVitals();    // clean slate for incoming page
        if (state.config.debug) {
            console.log('[Pulsar] SPA navigation — web vitals flushed and reset.');
        }
    }

    // Store originals bound to history so calling them later preserves context.
    state.originalPushState = history.pushState.bind(history);
    state.originalReplaceState = history.replaceState.bind(history);
    state.spaNavigationHandler = onSpaNavigate;

    // pushState and replaceState fire on programmatic navigation (React Router,
    // Next.js router, etc.). They do NOT fire a native event — patch is required.
    history.pushState = function (...args) {
        state.originalPushState(...args);
        onSpaNavigate();
    };

    history.replaceState = function (...args) {
        state.originalReplaceState(...args);
        onSpaNavigate();
    };

    // popstate fires on back/forward button navigation.
    window.addEventListener('popstate', state.spaNavigationHandler);
}

/**
 * Capture a snapshot of current Web Vitals and enqueue for delivery.
 *
 * Spreads webVitals into a plain object so a concurrent resetWebVitals() call
 * (e.g. from a rapid navigation) cannot mutate the payload mid-flight.
 *
 * @param {object} state - Shared SDK state
 */
export function captureRUM(state) {
    if (!state.enabled || !state.isInitialized) return;

    const payload = {
        client_id: state.config.clientId,
        storefront_type: state.config.storefrontType,
        site_id: state.config.siteId,
        session_id: state.sessionID,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        event_type: 'RUM_METRICS',
        metrics: { ...webVitals }, // snapshot — immune to post-call resets
        metadata: state.extractSFCCContext(),
        environment: state.captureEnvironment(),
        device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        dropped_events: state.droppedEventsCount
    };

    state.capture(payload, state.globalScope, true); // bypass dedupe for RUM
}
