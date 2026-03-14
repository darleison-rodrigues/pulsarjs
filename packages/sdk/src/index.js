/**
 * PulsarJS SDK
 * Privacy-first event stream for SFCC storefronts.
 * Emits ordered, non-PII events that feed an Event-Centric Knowledge Graph.
 *
 * Event types: PAGE_VIEW, SCROLL_DEPTH, CAMPAIGN_ENTRY, COMMERCE_ACTION,
 * JS_CRASH, API_FAILURE, API_LATENCY, NETWORK_ERROR, UI_FAILURE,
 * RAGE_CLICK, TAB_VISIBILITY, RUM_METRICS, QUEUE_OVERFLOW, FLUSH_FAILED
 */
import { Scope } from './core/scope.js';
import { DEFAULT_CONFIG, validateConfig } from './core/config.js';
import { generateSessionID } from './core/session.js';
import { createCapturePipeline } from './core/capture.js';
import { setupErrorHandlers } from './collectors/errors.js';
import { setupFetchInterceptor, setupXHRInterceptor } from './collectors/network.js';
import { setupPerformanceObserver, captureRUM } from './collectors/rum.js';
import { setupNavigationTracking } from './collectors/navigation.js';
import { setupScrollObserver, setupRageClickDetector } from './collectors/interactions.js';
import { extractSFCCContext } from './integrations/sfcc.js';
import { captureEnvironment, extractCampaigns } from './utils/environment.js';

const Pulsar = (function () {

    function createClient() {
        let globalScope = new Scope();
        let config = { ...DEFAULT_CONFIG };
        let sessionID = null;
        let isInitialized = false;
        let enabled = false;
        let isSampled = null;

        // Shared state object — passed to all collectors
        const state = {
            get config() { return config; },
            get globalScope() { return globalScope; },
            get sessionID() { return sessionID; },
            get enabled() { return enabled; },
            get isInitialized() { return isInitialized; },
            get droppedEventsCount() { return pipeline ? state._droppedEventsCount : 0; },
            set droppedEventsCount(v) { state._droppedEventsCount = v; },
            _droppedEventsCount: 0,
            droppedSinceLastFlush: 0,
            firstDropTimestamp: null,
            queue: [],

            // Original references for teardown
            originalFetch: null,
            originalOnerror: null,
            originalOnunhandledrejection: null,
            originalXhrOpen: null,
            originalXhrSend: null,
            visibilityHandler: null,
            interactionHandler: null,

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
            extractSFCCContext: () => extractSFCCContext(extractCampaigns),
            captureEnvironment: captureEnvironment,
            capture: null,
            flush: null,
            processedErrors: new WeakSet()
        };

        // Create capture pipeline and bind to state
        const pipeline = createCapturePipeline(state);
        state.capture = pipeline.capture;
        state.flush = pipeline.flush;

        // Public API
        return {
            init: function (usrConfig = {}) {
                const initializer = () => {
                    if (isInitialized) return;

                    config = { ...config, ...usrConfig };

                    const errors = validateConfig(config);
                    if (errors.length > 0) {
                        if (config.debug) errors.forEach(e => console.warn(`[Pulsar] ${e}`));
                        enabled = false;
                        return;
                    }

                    if (!sessionID) sessionID = generateSessionID();

                    isSampled = Math.random() <= config.sampleRate;
                    enabled = !!config.enabled && isSampled;

                    if (!enabled) return;

                    globalScope.setMaxBreadcrumbs(config.maxBreadcrumbs);

                    // Error & performance collectors
                    setupPerformanceObserver(state);
                    setupErrorHandlers(state);
                    setupFetchInterceptor(state);
                    setupXHRInterceptor(state);

                    // ECKG event collectors
                    setupNavigationTracking(state);
                    setupScrollObserver(state);
                    setupRageClickDetector(state);

                    // Flush RUM + queue on page hide
                    state.visibilityHandler = () => {
                        if (document.visibilityState === 'hidden') {
                            captureRUM(state);
                            pipeline.flush();
                        }
                    };
                    document.addEventListener('visibilitychange', state.visibilityHandler);

                    isInitialized = true;
                    if (config.debug) console.log('[Pulsar] Initialized', config.clientId);
                };

                if (window.requestIdleCallback) window.requestIdleCallback(initializer);
                else setTimeout(initializer, 1);
            },

            enable: function () {
                if (isSampled === null) isSampled = Math.random() <= config.sampleRate;
                if (!isSampled) {
                    if (config.debug) console.log('[Pulsar] Session excluded by sampling');
                    return;
                }
                enabled = true;
            },

            disable: function () {
                enabled = false;

                // Restore patched globals
                if (state.originalFetch) { window.fetch = state.originalFetch; state.originalFetch = null; }
                if (state.originalXhrOpen && window.XMLHttpRequest) {
                    XMLHttpRequest.prototype.open = state.originalXhrOpen;
                    XMLHttpRequest.prototype.send = state.originalXhrSend;
                    state.originalXhrOpen = null;
                    state.originalXhrSend = null;
                }
                if (state.originalOnerror !== null) { window.onerror = state.originalOnerror; state.originalOnerror = null; }
                if (state.originalOnunhandledrejection !== null) { window.onunhandledrejection = state.originalOnunhandledrejection; state.originalOnunhandledrejection = null; }

                // Remove event listeners
                if (state.visibilityHandler) { document.removeEventListener('visibilitychange', state.visibilityHandler); state.visibilityHandler = null; }
                if (state.interactionHandler) { document.body.removeEventListener('click', state.interactionHandler, true); state.interactionHandler = null; }

                // Teardown navigation tracking
                if (state._navOriginalPushState) { history.pushState = state._navOriginalPushState; state._navOriginalPushState = null; }
                if (state._navOriginalReplaceState) { history.replaceState = state._navOriginalReplaceState; state._navOriginalReplaceState = null; }
                if (state._navPopstateHandler) { window.removeEventListener('popstate', state._navPopstateHandler); state._navPopstateHandler = null; }
                if (state._navVisibilityHandler) { document.removeEventListener('visibilitychange', state._navVisibilityHandler); state._navVisibilityHandler = null; }

                // Teardown interaction tracking
                if (state._scrollHandler) { window.removeEventListener('scroll', state._scrollHandler); state._scrollHandler = null; }
                if (state._rageClickHandler) { document.removeEventListener('click', state._rageClickHandler, true); state._rageClickHandler = null; }

                isInitialized = false;
                if (config.debug) console.log('[Pulsar] Disabled');
            },

            getScope: function () { return globalScope; },
            setTag: function (key, value) { globalScope.setTag(key, value); },
            setUser: function (id, email, metadata = {}) {
                globalScope.setUser({ id, email, ...metadata });
            },
            addBreadcrumb: function (category, message, level = 'info') {
                globalScope.addBreadcrumb({ category, message, level });
            },

            /**
             * Session context snapshot — useful for debugging and custom integrations.
             */
            getContext: function () {
                const scopeData = globalScope.getScopeData();
                return {
                    tags: scopeData.tags,
                    user: scopeData.user,
                    sessionID: sessionID,
                    config: { clientId: config.clientId, siteId: config.siteId, storefrontType: config.storefrontType }
                };
            },

            captureException: function (error, metadata = {}) {
                pipeline.capture({
                    event_type: "CUSTOM_EXCEPTION",
                    message: error.message || String(error),
                    response_snippet: error.stack || null,
                    severity: "error",
                    metadata: metadata,
                    is_blocking: false
                });
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

window.Pulsar = Pulsar;
export default Pulsar;
