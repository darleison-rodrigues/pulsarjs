/**
 * PulsarJS — RUM Collector
 * Core Web Vitals: LCP, INP, CLS, TTFB, FCP via PerformanceObserver.
 */

/**
 * Set up PerformanceObserver for Web Vitals collection.
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
        loadTime: null
    };

    const vitals = state.webVitals;

    try {
        // LCP
        new PerformanceObserver((entryList) => {
            const entries = entryList.getEntries();
            if (entries.length > 0) vitals.lcp = entries[entries.length - 1].renderTime || entries[entries.length - 1].loadTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        // INP
        try {
            new PerformanceObserver((entryList) => {
                entryList.getEntries().forEach(entry => {
                    if (!entry.interactionId) return;
                    if (vitals.inp === null || entry.duration > vitals.inp) {
                        vitals.inp = entry.duration;
                        vitals.inp_interaction_id = entry.interactionId;
                    }
                });
            }).observe({ type: 'event', durationThreshold: 40, buffered: true });
        } catch (_e) {
            // Fallback to FID for older browsers
            new PerformanceObserver((entryList) => {
                entryList.getEntries().forEach(entry => {
                    if (vitals.inp === null) vitals.inp = entry.processingStart - entry.startTime;
                });
            }).observe({ type: 'first-input', buffered: true });
        }

        // CLS
        new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
                if (!entry.hadRecentInput) vitals.cls += entry.value;
            }
        }).observe({ type: 'layout-shift', buffered: true });

        // TTFB + Load Time (using PerformanceNavigationTiming)
        const navigationEntry = performance.getEntriesByType('navigation')[0];
        if (navigationEntry) {
            vitals.ttfb = Math.max(0, navigationEntry.responseStart);
            vitals.loadTime = Math.max(0, navigationEntry.loadEventEnd);
        } else if (window.performance && window.performance.timing) {
            // Legacy fallback if Navigation Timing V2 is missing
            const t = window.performance.timing;
            vitals.ttfb = Math.max(0, t.responseStart - t.navigationStart);
            vitals.loadTime = Math.max(0, t.loadEventEnd - t.navigationStart);
        }
    } catch (e) {
        if (state.config.debug) console.warn('[Pulsar] PerformanceObserver failed', e);
    }
}

/**
 * Capture RUM metrics and enqueue for flush.
 */
export function captureRUM(state) {
    if (!state.enabled || !state.isInitialized || !state.webVitals) return;

    let payload = {
        event_type: "RUM_METRICS",
        message: "RUM Metrics Recorded",
        metrics: { ...state.webVitals },
        severity: "info",
        metadata: state.extractSFCCContext(),
        environment: state.captureEnvironment()
    };
    state.capture(payload, state.globalScope, true); // Bypass dedupe for RUM
}
