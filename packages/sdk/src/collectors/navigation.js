/**
 * PulsarJS — Navigation & Journey Collectors
 * Page views, SPA route changes, campaign entry, tab visibility.
 *
 * These are the primary ECKG nodes — the server builds
 * "preceded", "caused", and temporal edges from this stream.
 */
import { Sanitizers } from '../utils/sanitizers.js';

const PAGE_TYPES = [
    [/\/checkout/i, 'Checkout'],
    [/\/cart/i, 'Cart'],
    [/\/p\//i, 'PDP'],
    [/\/d\//i, 'PLP'],
    [/\/search/i, 'Search'],
    [/^\/$/,  'Home']
];

function inferPageType(path) {
    const p = (path || '/').toLowerCase();
    for (const [pattern, type] of PAGE_TYPES) {
        if (pattern.test(p)) return type;
    }
    return 'Other';
}

/**
 * Set up page view tracking, SPA navigation, campaign entry, and tab visibility.
 */
export function setupNavigationTracking(state) {
    let currentPath = window.location.pathname;
    let currentPageType = inferPageType(currentPath);

    // Initial page view
    emitPageView(state, currentPageType, classifyReferrer(), null);

    // Campaign entry — fire once per session if UTM/ad params present
    emitCampaignEntry(state);

    // Patch History API for SPA navigation (PWA Kit uses React Router → pushState)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    const onRouteChange = () => {
        const newPath = window.location.pathname;
        if (newPath === currentPath) return;

        const prevPageType = currentPageType;
        currentPath = newPath;
        currentPageType = inferPageType(newPath);

        emitPageView(state, currentPageType, 'internal', prevPageType);

        // Reset scroll depth milestones for new page
        if (state._scrollMilestones) state._scrollMilestones.clear();
    };

    history.pushState = function () {
        originalPushState.apply(this, arguments);
        onRouteChange();
    };

    history.replaceState = function () {
        originalReplaceState.apply(this, arguments);
        onRouteChange();
    };

    window.addEventListener('popstate', onRouteChange);

    // Tab visibility — reveals engagement gaps in the event stream
    const onVisibility = () => {
        state.capture({
            event_type: 'TAB_VISIBILITY',
            message: `Tab ${document.visibilityState}`,
            metadata: {
                visibility: document.visibilityState,
                page_type: currentPageType
            },
            severity: 'info',
            is_blocking: false
        });
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Store references for teardown
    state._navOriginalPushState = originalPushState;
    state._navOriginalReplaceState = originalReplaceState;
    state._navPopstateHandler = onRouteChange;
    state._navVisibilityHandler = onVisibility;
}

function emitPageView(state, pageType, referrerType, fromPageType) {
    state.capture({
        event_type: 'PAGE_VIEW',
        message: `Page: ${pageType}`,
        metadata: {
            page_type: pageType,
            referrer_type: referrerType,
            from_page_type: fromPageType,
            path: Sanitizers.sanitizeUrl(window.location.pathname)
        },
        severity: 'info',
        is_blocking: false
    });
}

function emitCampaignEntry(state) {
    if (!window.location.search) return;
    try {
        const params = new URLSearchParams(window.location.search);
        const keys = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            // Click IDs — platform attribution
            'gclid',      // Google Ads
            'gbraid',     // Google Ads (iOS privacy)
            'wbraid',     // Google Ads (web-to-app)
            'fbclid',     // Meta (Facebook / Instagram)
            'msclkid',    // Microsoft / Bing Ads
            'ttclid',     // TikTok Ads
            'twclid',     // X (Twitter) Ads
            'li_fat_id',  // LinkedIn Ads
            'pin_unauth', // Pinterest
            'sccid',      // Snapchat Ads
            'dclid',      // Google Display & Video 360
            // Affiliate networks
            'irclickid',  // Impact Radius
            'aff_id',     // Generic affiliate
            'clickid',    // Generic affiliate / CJ
        ];
        const data = {};

        for (const key of keys) {
            if (params.has(key)) data[key] = params.get(key);
        }

        if (Object.keys(data).length === 0) return;

        state.capture({
            event_type: 'CAMPAIGN_ENTRY',
            message: `Campaign: ${data.utm_source || 'paid'}`,
            metadata: data,
            severity: 'info',
            is_blocking: false
        });
    } catch { /* URLSearchParams not supported — rare */ }
}

/**
 * Classify the document referrer without leaking PII.
 * Returns: 'direct' | 'internal' | 'external' | 'campaign'
 */
function classifyReferrer() {
    if (window.location.search && /[?&](utm_|gclid|gbraid|wbraid|fbclid|msclkid|ttclid|twclid|li_fat_id|pin_unauth|sccid|dclid|irclickid|aff_id|clickid)/.test(window.location.search)) {
        return 'campaign';
    }
    if (!document.referrer) return 'direct';
    try {
        const ref = new URL(document.referrer);
        return ref.hostname === window.location.hostname ? 'internal' : 'external';
    } catch {
        return 'external';
    }
}

export { inferPageType };
