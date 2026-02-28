/**
 * PulsarJS — Environment & Campaign Utilities
 * Device context, DevTools detection, UTM extraction.
 */

/**
 * Capture browser environment context.
 */
export function captureEnvironment() {
    return {
        time_since_load: typeof performance !== 'undefined' ? Math.floor(performance.now()) : 0,
        screen_resolution: window.screen ? `${window.screen.width}x${window.screen.height}` : 'unknown',
        timezone_offset: new Date().getTimezoneOffset(),
        is_devtools_open: (window.outerWidth - window.innerWidth > 160) || (window.outerHeight - window.innerHeight > 160)
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
