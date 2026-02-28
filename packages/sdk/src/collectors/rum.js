/**
 * PulsarJS — RUM Collector
 * Core Web Vitals: LCP, INP, CLS, TTFB, FCP via PerformanceObserver.
 */

/**
 * Web Vitals accumulator.
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
 * Set up PerformanceObserver for Web Vitals collection.
 */
export function setupPerformanceObserver(state) {
    if (typeof PerformanceObserver === 'undefined') return;

    try {
        // LCP
        new PerformanceObserver((entryList) => {
            const entries = entryList.getEntries();
            if (entries.length > 0) webVitals.lcp = entries[entries.length - 1].renderTime || entries[entries.length - 1].loadTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        // INP (replaces deprecated FID)
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
        } catch (e) {
            // Fallback to FID for older browsers
            new PerformanceObserver((entryList) => {
                entryList.getEntries().forEach(entry => {
                    if (webVitals.inp === null) webVitals.inp = entry.processingStart - entry.startTime;
                });
            }).observe({ type: 'first-input', buffered: true });
        }

        // CLS
        new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
                if (!entry.hadRecentInput) webVitals.cls += entry.value;
            }
        }).observe({ type: 'layout-shift', buffered: true });

        // TTFB + Load Time
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
        if (state.config.debug) console.warn('[Pulsar] PerformanceObserver failed', e);
    }
}

/**
 * Capture RUM metrics and enqueue for flush.
 */
export function captureRUM(state) {
    if (!state.enabled || !state.isInitialized) return;

    let payload = {
        client_id: state.config.clientId,
        storefront_type: state.config.storefrontType,
        site_id: state.config.siteId,
        session_id: state.sessionID,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        event_type: "RUM_METRICS",
        metrics: webVitals,
        metadata: state.extractSFCCContext(),
        environment: state.captureEnvironment(),
        device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        dropped_events: state.droppedEventsCount
    };
    state.capture(payload, state.globalScope, true); // Bypass dedupe for RUM
}
