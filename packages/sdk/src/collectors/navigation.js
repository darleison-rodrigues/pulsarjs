/**
 * PulsarJS — Navigation & Journey Collectors
 * Page views, SPA route changes, campaign entry, tab visibility.
 *
 * These are the primary ECKG nodes — the server builds
 * "preceded", "caused", and temporal edges from this stream.
 */
import { Sanitizers } from '../utils/sanitizers.js';

/**
 * Infer page type from URL path using config-driven patterns.
 * PUL-027: reads from config.pageTypes instead of hardcoded patterns.
 *
 * Supports optional capture group in regex for product_ref extraction:
 *   [/\/p\/([^/?]+)/i, 'PDP'] → { type: 'PDP', product_ref: 'blue-sneakers-123' }
 *
 * @param {string} path - URL pathname
 * @param {Array<[RegExp, string]>} pageTypes - pattern/type tuples from config
 * @returns {{ type: string, product_ref: string|null }}
 */
function inferPageType(path, pageTypes) {
    const p = path || '/';
    for (const [pattern, type] of pageTypes) {
        const match = p.match(pattern);
        if (match) {
            return {
                type,
                product_ref: match[1] || null
            };
        }
    }
    return { type: 'Other', product_ref: null };
}

/**
 * Set up page view tracking, SPA navigation, campaign entry, and tab visibility.
 */
export function setupNavigationTracking(state) {
    const { config } = state;
    let currentPath = window.location.pathname;
    let currentPageInfo = inferPageType(currentPath, config.pageTypes);

    // Initial page view — await to ensure firstPageViewEventId is set before campaign entry
    (async () => {
        await emitPageView(state, currentPageInfo, classifyReferrer(), null);

        // Campaign entry — fire once per session if UTM/ad params present
        emitCampaignEntry(state);
    })();

    // Patch History API for SPA navigation (PWA Kit uses React Router → pushState)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    const onRouteChange = async () => {
        const newPath = window.location.pathname;
        if (newPath === currentPath) return;

        const prevPageType = currentPageInfo.type;
        currentPath = newPath;
        currentPageInfo = inferPageType(newPath, config.pageTypes);

        await emitPageView(state, currentPageInfo, 'internal', prevPageType);

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
        // PUL-028: abandoned_at edge — tab hidden after commerce, not checkout
        const isHidden = document.visibilityState === 'hidden';
        const abandonEdge = isHidden
            && state.lastCommerceEventId
            && state.lastCommerceAction?.action !== 'checkout';

        state.capture({
            event_type: 'TAB_VISIBILITY',
            message: `Tab ${document.visibilityState}`,
            metadata: {
                visibility: document.visibilityState,
                page_type: currentPageInfo.type
            },
            severity: 'info',
            is_blocking: false,
            ...(abandonEdge ? { caused_by: state.lastCommerceEventId, edge_hint: 'abandoned_at' } : {})
        });
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Store references for teardown
    state._navOriginalPushState = originalPushState;
    state._navOriginalReplaceState = originalReplaceState;
    state._navPopstateHandler = onRouteChange;
    state._navVisibilityHandler = onVisibility;
}

async function emitPageView(state, pageInfo, referrerType, fromPageType) {
    const metadata = {
        page_type: pageInfo.type,
        referrer_type: referrerType,
        from_page_type: fromPageType,
        path: Sanitizers.sanitizeUrl(window.location.pathname)
    };
    if (pageInfo.product_ref) metadata.product_ref = pageInfo.product_ref;

    const eventId = await state.capture({
        event_type: 'PAGE_VIEW',
        message: `Page: ${pageInfo.type}`,
        metadata,
        severity: 'info',
        is_blocking: false
    });

    // PUL-028: track first PAGE_VIEW for caused edge
    if (!state.firstPageViewEventId && eventId) {
        state.firstPageViewEventId = eventId;
    }
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
            is_blocking: false,
            ...(state.firstPageViewEventId
                ? { caused_by: state.firstPageViewEventId, edge_hint: 'caused' }
                : {})
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
