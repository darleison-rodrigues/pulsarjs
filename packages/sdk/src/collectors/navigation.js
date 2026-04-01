/**
 * PulsarJS — Navigation & Journey Collectors
 * Page views, SPA route changes, campaign entry, tab visibility.
 *
 * These are the primary event stream nodes — the server builds
 * "preceded", "caused", and temporal edges from this stream.
 */
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
    let currentHref = window.location.href;

    const onRouteChange = async (departingUrl) => {
        try {
            const newPath = window.location.pathname;
            if (newPath === currentPath) return;

            const prevPageType = currentPageInfo.type;
            currentPath = newPath;
            currentPageInfo = inferPageType(newPath, config.pageTypes);

            await emitPageView(state, currentPageInfo, 'internal', prevPageType);

            // Reset scroll depth milestones for new page
            if (state._scrollMilestones) state._scrollMilestones.clear();

            // Emit custom event for other collectors (e.g., RUM)
            window.dispatchEvent(new CustomEvent('pulsar:route-change', {
                detail: { newUrl: window.location.href, departingUrl }
            }));
        } catch (e) {
            if (config?.debug) console.warn('[Pulsar] onRouteChange failed', e);
        }
    };

    history.pushState = function (...args) {
        try {
            const departingUrl = currentHref;
            originalPushState.apply(this, args);
            currentHref = window.location.href;
            onRouteChange(departingUrl);
        } catch (e) {
            if (config?.debug) console.warn('[Pulsar] pushState patch failed', e);
        }
    };

    history.replaceState = function (...args) {
        try {
            const departingUrl = currentHref;
            originalReplaceState.apply(this, args);
            currentHref = window.location.href;
            onRouteChange(departingUrl);
        } catch (e) {
            if (config?.debug) console.warn('[Pulsar] replaceState patch failed', e);
        }
    };

    const onPopState = () => {
        try {
            const departingUrl = currentHref;
            currentHref = window.location.href;
            onRouteChange(departingUrl);
        } catch (e) {
            if (config?.debug) console.warn('[Pulsar] onPopState failed', e);
        }
    };
    window.addEventListener('popstate', onPopState);

    // Tab visibility — reveals engagement gaps in the event stream
    const onVisibility = () => {
        try {
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
        } catch (e) {
            if (config?.debug) console.warn('[Pulsar] visibility handler failed', e);
        }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Store references for teardown
    state._navOriginalPushState = originalPushState;
    state._navOriginalReplaceState = originalReplaceState;
    state._navPopstateHandler = onPopState;
    state._navVisibilityHandler = onVisibility;
}

export async function emitPageView(state, pageInfo, referrerType, fromPageType) {
    try {
        const metadata = {
            page_type: pageInfo.type,
            referrer_type: referrerType,
            from_page_type: fromPageType,
            path: state.sanitizer.sanitizeUrl(window.location.pathname)
        };
        if (pageInfo.product_ref) {
            const sanitizedRef = state.sanitizer.redactPII(pageInfo.product_ref);
            metadata.product_ref = sanitizedRef;

            // PUL-030: deduplicate and store for manifest
            if (state.productRefs && !state.productRefs.includes(sanitizedRef)) {
                state.productRefs.push(sanitizedRef);
            }
        }

        const eventId = await state.capture({
            event_type: 'PAGE_VIEW',
            message: `Page: ${pageInfo.type}`,
            metadata,
            severity: 'info',
            is_blocking: false
        });

        if (eventId) {
            // PUL-029: session context tracking
            state.pageCount++;
            if (!state.entryPageType) {
                state.entryPageType = pageInfo.type;
                state.entryReferrerType = referrerType;
            }

            // PUL-028: track first PAGE_VIEW for caused edge
            if (!state.firstPageViewEventId) {
                state.firstPageViewEventId = eventId;
            }
        }
    } catch (e) {
        if (state.config?.debug) console.warn('[Pulsar] emitPageView failed', e);
    }
}

const CLICK_ID_PARAMS = {
    // Paid search/display
    gclid: 'paid', gbraid: 'paid', wbraid: 'paid',
    msclkid: 'paid', dclid: 'paid',
    // Social
    fbclid: 'social', ttclid: 'social', twclid: 'social',
    sccid: 'social', pin_unauth: 'social', li_fat_id: 'social',
    // Affiliate
    irclickid: 'affiliate', aff_id: 'affiliate', clickid: 'affiliate'
};

function emitCampaignEntry(state) {
    if (!window.location.search) return;
    try {
        const params = new URLSearchParams(window.location.search);
        const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
        const clickIdKeys = Object.keys(CLICK_ID_PARAMS);
        const keys = [...utmKeys, ...clickIdKeys];
        const data = {};

        let firstMatchedClickId = null;

        for (const key of keys) {
            if (params.has(key)) {
                data[key] = params.get(key).slice(0, 128);
                if (!firstMatchedClickId && clickIdKeys.includes(key)) {
                    firstMatchedClickId = key;
                }
            }
        }

        if (Object.keys(data).length === 0) return;

        // PUL-029: track campaign source for flush envelope
        if (!state.entryCampaignSource) {
            if (data.utm_source) {
                state.entryCampaignSource = data.utm_source;
            } else if (firstMatchedClickId) {
                state.entryCampaignSource = CLICK_ID_PARAMS[firstMatchedClickId];
            } else {
                state.entryCampaignSource = 'paid';
            }
        }

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
    const regexPattern = '[?&](utm_|' + Object.keys(CLICK_ID_PARAMS).join('|') + ')';
    if (window.location.search && new RegExp(regexPattern).test(window.location.search)) {
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
