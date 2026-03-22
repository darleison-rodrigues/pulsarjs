/**
 * PulsarJS SDK
 * Privacy-first event stream for commerce storefronts.
 * Emits ordered, non-PII events that feed a causal event stream.
 *
 * Event types: PAGE_VIEW, SCROLL_DEPTH, CAMPAIGN_ENTRY, COMMERCE_ACTION,
 * JS_CRASH, API_FAILURE, API_LATENCY, NETWORK_ERROR, UI_FAILURE,
 * RAGE_CLICK, TAB_VISIBILITY, RUM_METRICS, QUEUE_OVERFLOW, FLUSH_FAILED
 */
import { Scope } from './core/scope.js';
import { DEFAULT_CONFIG, validateConfig } from './core/config.js';
import { generateSessionID, getPersistedSession, persistSession, persistSessionSync } from './core/session.js';
import { createCapturePipeline } from './core/capture.js';
import { setupErrorHandlers } from './collectors/errors.js';
import { setupFetchInterceptor, setupXHRInterceptor } from './collectors/network.js';
import { setupPerformanceObserver, captureRUM } from './collectors/rum.js';
import { setupNavigationTracking } from './collectors/navigation.js';
import { setupScrollObserver, setupRageClickDetector } from './collectors/interactions.js';
import { resolveProvider } from './providers/provider.js';
import { captureEnvironment, extractCampaigns } from './utils/environment.js';
import { buildDeviceInfo } from './utils/device.js';
import { createSanitizer } from './utils/sanitizers.js';

const Pulsar = (function () {

    function createClient() {
        let globalScope = new Scope();
        let config = { ...DEFAULT_CONFIG };
        let sessionID = null;
        let isInitialized = false;
        let enabled = false;
        let isSampled = null;

        // Load persisted session state if available
        const persisted = getPersistedSession() || {};
        if (persisted.sessionID) {
            sessionID = persisted.sessionID;
        }

        const sanitizer = createSanitizer();

        // Shared state object — passed to all collectors
        const state = {
            get sanitizer() { return sanitizer; },
            get config() { return config; },
            get globalScope() { return globalScope; },
            get sessionID() { return sessionID; },
            get enabled() { return enabled; },
            get isInitialized() { return isInitialized; },
            get droppedEventsCount() { return pipeline ? state._droppedEventsCount : 0; },
            set droppedEventsCount(v) {
                state._droppedEventsCount = v;
                persistSession(state);
            },
            _droppedEventsCount: persisted._droppedEventsCount || 0,
            droppedSinceLastFlush: 0,
            firstDropTimestamp: null,
            firstDropUrl: null,  // URL captured at drop time (accurate in SPAs)
            firstDropSessionId: null,  // session captured at drop time
            queue: [],
            productRefs: [], // PUL-030: PDP product identifiers for manifest

            // PUL-028: causal tracking for edge hints
            get lastErrorEventId() { return state._lastErrorEventId; },
            set lastErrorEventId(v) { state._lastErrorEventId = v; persistSession(state); },
            _lastErrorEventId: persisted.lastErrorEventId || null,

            get lastCommerceEventId() { return state._lastCommerceEventId; },
            set lastCommerceEventId(v) { state._lastCommerceEventId = v; persistSession(state); },
            _lastCommerceEventId: persisted.lastCommerceEventId || null,

            get lastCommerceAction() { return state._lastCommerceAction; },
            set lastCommerceAction(v) { state._lastCommerceAction = v; persistSession(state); },
            _lastCommerceAction: persisted.lastCommerceAction || null,

            get lastFailedCommerceAction() { return state._lastFailedCommerceAction; },
            set lastFailedCommerceAction(v) { state._lastFailedCommerceAction = v; persistSession(state); },
            _lastFailedCommerceAction: persisted.lastFailedCommerceAction || {},

            get firstPageViewEventId() { return state._firstPageViewEventId; },
            set firstPageViewEventId(v) { state._firstPageViewEventId = v; persistSession(state); },
            _firstPageViewEventId: persisted.firstPageViewEventId || null,

            // PUL-029: session context for flush envelope
            get sessionStartedAt() { return state._sessionStartedAt; },
            set sessionStartedAt(v) { state._sessionStartedAt = v; persistSession(state); },
            _sessionStartedAt: persisted.sessionStartedAt || null,

            get entryPageType() { return state._entryPageType; },
            set entryPageType(v) { state._entryPageType = v; persistSession(state); },
            _entryPageType: persisted.entryPageType || null,

            get entryReferrerType() { return state._entryReferrerType; },
            set entryReferrerType(v) { state._entryReferrerType = v; persistSession(state); },
            _entryReferrerType: persisted.entryReferrerType || null,

            get entryCampaignSource() { return state._entryCampaignSource; },
            set entryCampaignSource(v) { state._entryCampaignSource = v; persistSession(state); },
            _entryCampaignSource: persisted.entryCampaignSource || null,

            get pageCount() { return state._pageCount; },
            set pageCount(v) { state._pageCount = v; persistSession(state); },
            _pageCount: persisted.pageCount || 0,

            // Handler references for teardown (PUL-033: addEventListener pattern)
            originalFetch: null,
            originalXhrOpen: null,
            originalXhrSend: null,
            errorHandler: null,  // window 'error' listener
            rejectionHandler: null,  // window 'unhandledrejection' listener
            mutationObserver: null,  // MutationObserver for critical selectors
            visibilityHandler: null,
            interactionHandler: null,
            // SPA navigation hook (PUL-034)
            spaNavigationHandler: null,

            // Navigation teardown refs
            _navOriginalPushState: null,
            _navOriginalReplaceState: null,
            _navPopstateHandler: null,
            _navVisibilityHandler: null,

            // Interaction teardown refs
            _scrollHandler: null,
            _scrollMilestones: null,
            _rageClickHandler: null,

            // Bound helpers for modules
            // extractPlatformContext is re-bound inside init() after provider resolution
            extractPlatformContext: () => ({}),
            captureEnvironment: captureEnvironment,
            device: null, // set once at init() — device cohort + hints (PUL-026)
            capture: null, // set after pipeline creation
            flush: null, // set after pipeline creation
            flushOnHide: null  // set after pipeline creation — bypasses isFlushing for page-hide
        };

        // Create capture pipeline and bind to state
        const pipeline = createCapturePipeline(state);
        state.capture = pipeline.capture;
        state.flush = pipeline.flush;
        state.flushOnHide = pipeline.flushOnHide;

        // Public API
        return {
            init: function (usrConfig = {}) {
                try {
                const initializer = () => {
                    if (isInitialized) return;

                    config = { ...config, ...usrConfig };

                    const errors = validateConfig(config);
                    if (errors.length > 0) {
                        // eslint-disable-next-line no-console
                        if (config?.debug) errors.forEach(e => console.warn(`[Pulsar] ${e}`));
                        enabled = false;
                        return;
                    }

                    // Resolve platform provider
                    const provider = resolveProvider(config.platform);

                    // User overrides win over provider defaults
                    config.commerceActions = usrConfig.commerceActions || provider.commerceActions;
                    config.pageTypes = usrConfig.pageTypes || provider.pageTypes;
                    config.endpointFilter = usrConfig.endpointFilter || provider.endpointFilter;

                    // Register provider PII patterns
                    if (provider.piiPatterns && provider.piiPatterns.length > 0) {
                        sanitizer.registerPiiPatterns(provider.piiPatterns);
                    }

                    // Bind extractPlatformContext with resolved provider
                    state.extractPlatformContext = () => {
                        try {
                            const ctx = provider.extractContext();
                            const campaign = extractCampaigns();
                            if (campaign) ctx.campaign = campaign;
                            return ctx;
                        } catch (e) {
                            if (config?.debug) console.warn('[Pulsar] extractPlatformContext failed', e);
                            return {};
                        }
                    };

                    if (!sessionID) sessionID = generateSessionID();
                    if (!state.sessionStartedAt) state.sessionStartedAt = new Date().toISOString();

                    isSampled = Math.random() <= config.sampleRate;
                    enabled = !!config.enabled && isSampled;

                    if (!enabled) return;

                    globalScope.setMaxBreadcrumbs(config.maxBreadcrumbs);

                    // PUL-026: compute device cohort once at init, reuse per event
                    state.device = buildDeviceInfo();

                    // Error & performance collectors
                    try { setupPerformanceObserver(state); } catch (e) { if (config?.debug) console.warn('[Pulsar] setupPerformanceObserver failed', e); }
                    try { setupErrorHandlers(state); } catch (e) { if (config?.debug) console.warn('[Pulsar] setupErrorHandlers failed', e); }
                    try { setupFetchInterceptor(state); } catch (e) { if (config?.debug) console.warn('[Pulsar] setupFetchInterceptor failed', e); }
                    try { setupXHRInterceptor(state); } catch (e) { if (config?.debug) console.warn('[Pulsar] setupXHRInterceptor failed', e); }

                    // Journey event collectors
                    try { setupNavigationTracking(state); } catch (e) { if (config?.debug) console.warn('[Pulsar] setupNavigationTracking failed', e); }
                    try { setupScrollObserver(state); } catch (e) { if (config?.debug) console.warn('[Pulsar] setupScrollObserver failed', e); }
                    try { setupRageClickDetector(state); } catch (e) { if (config?.debug) console.warn('[Pulsar] setupRageClickDetector failed', e); }

                    // Flush RUM + queue on page hide
                    try {
                        state.visibilityHandler = () => {
                            try {
                                if (document.visibilityState === 'hidden') {
                                    persistSessionSync(state);
                                    captureRUM(state);
                                    // flushOnHide bypasses the isFlushing concurrency guard.
                                    // This is intentional: on page hide, events sitting in
                                    // state.queue may have no scheduled flush (the debounce
                                    // already fired, isFlushing is true from a slow retry).
                                    // sendBeacon is fire-and-forget; we MUST call it here.
                                    pipeline.flushOnHide();
                                }
                            } catch (e) {
                                if (config?.debug) console.warn('[Pulsar] visibilityHandler failed', e);
                            }
                        };
                        document.addEventListener('visibilitychange', state.visibilityHandler);
                    } catch (e) {
                        if (config?.debug) console.warn('[Pulsar] visibility listener setup failed', e);
                    }

                    isInitialized = true;
                    // eslint-disable-next-line no-console
                    if (config?.debug) console.log('[Pulsar] Initialized', config.clientId);
                };

                try {
                    if (window.requestIdleCallback) window.requestIdleCallback(initializer);
                    else setTimeout(initializer, 1);
                } catch (e) {
                    if (config?.debug) console.warn('[Pulsar] Init delay failed', e);
                    initializer();
                }
                } catch (e) {
                    // eslint-disable-next-line no-console
                    if (config?.debug) console.warn('[Pulsar] init failed', e);
                }
            },

            enable: function () {
                try {
                    if (isSampled === null) isSampled = Math.random() <= config.sampleRate;
                    if (!isSampled) {
                        // eslint-disable-next-line no-console
                        if (config?.debug) console.log('[Pulsar] Session excluded by sampling');
                        return;
                    }
                    enabled = true;
                } catch (e) {
                    if (config?.debug) console.warn('[Pulsar] enable failed', e);
                }
            },

            disable: function () {
                try {
                    enabled = false;

                    // Restore patched globals
                    if (state.originalFetch) { window.fetch = state.originalFetch; state.originalFetch = null; }
                    if (state.originalXhrOpen && window.XMLHttpRequest) {
                        XMLHttpRequest.prototype.open = state.originalXhrOpen;
                        XMLHttpRequest.prototype.send = state.originalXhrSend;
                        state.originalXhrOpen = null;
                        state.originalXhrSend = null;
                    }
                    // PUL-033: removeEventListener — symmetric with addEventListener in errors.js
                    if (state.errorHandler) { window.removeEventListener('error', state.errorHandler); state.errorHandler = null; }
                    if (state.rejectionHandler) { window.removeEventListener('unhandledrejection', state.rejectionHandler); state.rejectionHandler = null; }
                    if (state.mutationObserver) { state.mutationObserver.disconnect(); state.mutationObserver = null; }
                    if (state.visibilityHandler) { document.removeEventListener('visibilitychange', state.visibilityHandler); state.visibilityHandler = null; }
                    if (state.interactionHandler) { document.body.removeEventListener('click', state.interactionHandler, true); state.interactionHandler = null; }
                    // PUL-034: remove pulsar:route-change listener
                    if (state.spaNavigationHandler) { window.removeEventListener('pulsar:route-change', state.spaNavigationHandler); state.spaNavigationHandler = null; }

                    // Teardown navigation tracking
                    if (state._navOriginalPushState) { history.pushState = state._navOriginalPushState; state._navOriginalPushState = null; }
                    if (state._navOriginalReplaceState) { history.replaceState = state._navOriginalReplaceState; state._navOriginalReplaceState = null; }
                    if (state._navPopstateHandler) { window.removeEventListener('popstate', state._navPopstateHandler); state._navPopstateHandler = null; }
                    if (state._navVisibilityHandler) { document.removeEventListener('visibilitychange', state._navVisibilityHandler); state._navVisibilityHandler = null; }

                    // Teardown interaction tracking
                    if (state._scrollHandler) { window.removeEventListener('scroll', state._scrollHandler); state._scrollHandler = null; }
                    if (state._rageClickHandler) { document.removeEventListener('click', state._rageClickHandler, true); state._rageClickHandler = null; }

                    isInitialized = false;
                    // eslint-disable-next-line no-console
                    if (config?.debug) console.log('[Pulsar] Disabled');
                } catch (e) {
                    if (config?.debug) console.warn('[Pulsar] disable failed', e);
                }
            },

            getScope: function () { return globalScope; },
            setTag: function (key, value) {
                try {
                    globalScope.setTag(key, value);
                } catch (e) {
                    if (config?.debug) console.warn('[Pulsar] setTag failed', e);
                }
            },
            setUser: function (id, email, metadata = {}) {
                try {
                    globalScope.setUser({ id, email, ...metadata });
                } catch (e) {
                    if (config?.debug) console.warn('[Pulsar] setUser failed', e);
                }
            },
            addBreadcrumb: function (category, message, level = 'info') {
                try {
                    globalScope.addBreadcrumb({ category, message, level });
                } catch (e) {
                    if (config?.debug) console.warn('[Pulsar] addBreadcrumb failed', e);
                }
            },

            /**
             * Session context snapshot — useful for debugging and custom integrations.
             */
            getContext: function () {
                try {
                    const scopeData = globalScope.getScopeData();
                    return {
                        tags: scopeData.tags,
                        user: scopeData.user,
                        sessionID: sessionID,
                        config: { clientId: config.clientId, siteId: config.siteId, storefrontType: config.storefrontType }
                    };
                } catch (e) {
                    if (config?.debug) console.warn('[Pulsar] getContext failed', e);
                    return {};
                }
            },

            captureException: function (error, metadata = {}) {
                try {
                    pipeline.capture({
                        event_type: "CUSTOM_EXCEPTION",
                        message: error.message || String(error),
                        response_snippet: error.stack || null,
                        severity: "error",
                        metadata: metadata,
                        is_blocking: false
                    });
                } catch (e) {
                    if (config?.debug) console.warn('[Pulsar] captureException failed', e);
                }
            },

            /**
             * Manually trigger a flush of the event queue.
             *
             * Useful for merchants who need guaranteed delivery before a redirect
             * (e.g. checkout submit), or for test harnesses that need to assert on
             * captured events synchronously.
             *
             * @returns {Promise<void>}
             */
            flush: function () {
                try {
                    return pipeline.flush();
                } catch (e) {
                    if (config?.debug) console.warn('[Pulsar] flush failed', e);
                    return Promise.resolve();
                }
            }
        };
    }

    const defaultClient = createClient();
    defaultClient.createInstance = function (cfg = {}) {
        const instance = createClient();
        if (Object.keys(cfg).length > 0) instance.init(cfg);
        return instance;
    };

    return defaultClient;
})();

if (typeof window !== 'undefined') {
    window.Pulsar = Pulsar;
}
export default Pulsar;
