/**
 * PulsarJS — Environment & Campaign Utilities
 * Device context, DevTools detection, UTM extraction.
 */

// PERF: P6 — Shared envelope fields rebuilt on every flush
// reduces Intl.DateTimeFormat().resolvedOptions().timeZone invocations from 1 per event to 1 per session
let cachedEnvironment = null;

/**
 * Reset cached environment for testing.
 * @internal
 */
export function _resetCachedEnvironment() {
    cachedEnvironment = null;
}

/**
 * Capture browser environment context.
 */
export function captureEnvironment() {
    if (!cachedEnvironment) {
        cachedEnvironment = {
            screen_resolution: typeof window !== 'undefined' && window.screen ? `${window.screen.width}x${window.screen.height}` : 'unknown',
            timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'unknown',
            is_devtools_open: typeof window !== 'undefined' ? ((window.outerWidth - window.innerWidth > 160) || (window.outerHeight - window.innerHeight > 160)) : false
        };
    }

    return {
        ...cachedEnvironment,
        time_since_load_ms: typeof performance !== 'undefined' ? Math.round(performance.now()) : 0
    };
}

/**
 * Extract UTM and ad click parameters from the URL.
 */
export function extractCampaigns() {
    try {
        if (!window.location.search) return null;
        const params = new URLSearchParams(window.location.search);
        const campaignData = {};
        const trackingKeys = ['gclid', 'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'msclkid'];
        trackingKeys.forEach(key => {
            if (params.has(key)) campaignData[key] = params.get(key);
        });
        return Object.keys(campaignData).length > 0 ? campaignData : null;
    } catch {
        return null;
    }
}
