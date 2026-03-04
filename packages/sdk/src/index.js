/**
 * PulsarJS SDK
 * Privacy-first error monitoring & RUM for SFCC storefronts.
 *
 * Entry point — wires domain modules into a single IIFE.
 */
import { Scope } from './core/scope.js';
import { DEFAULT_CONFIG, validateConfig } from './core/config.js';
import { generateSessionID } from './core/session.js';
import { createCapturePipeline } from './core/capture.js';
import { setupErrorHandlers } from './collectors/errors.js';
import { setupFetchInterceptor, setupXHRInterceptor } from './collectors/network.js';
import { setupPerformanceObserver, captureRUM } from './collectors/rum.js';
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

        // Shared state object — passed to all modules
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
            firstDropUrl: null,  // URL captured at drop time (accurate in SPAs)
            firstDropSessionId: null,  // session captured at drop time
            queue: [],

            // Original references for teardown
            originalFetch: null,
            originalOnerror: null,
            originalOnunhandledrejection: null,
            originalXhrOpen: null,
            originalXhrSend: null,
            visibilityHandler: null,
            interactionHandler: null,

            // Bound helpers for modules
            extractSFCCContext: () => extractSFCCContext(extractCampaigns),
            captureEnvironment: captureEnvironment,
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

                    if (navigator.doNotTrack === '1') {
                        if (config.debug) console.warn('[Pulsar] Do Not Track enabled. SDK disabled.');
                        enabled = false;
                        isSampled = false;
                    } else {
                        isSampled = Math.random() <= config.sampleRate;
                        enabled = !!config.enabled && isSampled;
                    }

                    if (!enabled) return;

                    globalScope.setMaxBreadcrumbs(config.maxBreadcrumbs);
                    setupPerformanceObserver(state);
                    setupErrorHandlers(state);
                    setupFetchInterceptor(state);
                    setupXHRInterceptor(state);

                    state.visibilityHandler = () => {
                        if (document.visibilityState === 'hidden') {
                            captureRUM(state);
                            // flushOnHide bypasses the isFlushing concurrency guard.
                            // This is intentional: on page hide, events sitting in
                            // state.queue may have no scheduled flush (the debounce
                            // already fired, isFlushing is true from a slow retry).
                            // sendBeacon is fire-and-forget; we MUST call it here.
                            pipeline.flushOnHide();
                        }
                    };
                    document.addEventListener('visibilitychange', state.visibilityHandler);

                    isInitialized = true;
                    if (config.debug) console.log('[Pulsar] Initialized', config.clientId, 'Enabled:', enabled);
                };

                if (window.requestIdleCallback) window.requestIdleCallback(initializer);
                else setTimeout(initializer, 1);
            },

            enable: function () {
                if (isSampled === null) isSampled = Math.random() <= config.sampleRate;
                if (!isSampled) {
                    if (config.debug) console.log('[Pulsar] Session excluded by sampling rate');
                    return;
                }
                enabled = true;
                if (config.debug) console.log('[Pulsar] Enabled');
            },

            disable: function () {
                enabled = false;
                if (state.originalFetch) { window.fetch = state.originalFetch; state.originalFetch = null; }
                if (state.originalXhrOpen && window.XMLHttpRequest) {
                    XMLHttpRequest.prototype.open = state.originalXhrOpen;
                    XMLHttpRequest.prototype.send = state.originalXhrSend;
                    state.originalXhrOpen = null;
                    state.originalXhrSend = null;
                }
                if (state.originalOnerror !== null) { window.onerror = state.originalOnerror; state.originalOnerror = null; }
                if (state.originalOnunhandledrejection !== null) { window.onunhandledrejection = state.originalOnunhandledrejection; state.originalOnunhandledrejection = null; }
                if (state.visibilityHandler) { document.removeEventListener('visibilitychange', state.visibilityHandler); state.visibilityHandler = null; }
                if (state.interactionHandler) { document.body.removeEventListener('click', state.interactionHandler, true); state.interactionHandler = null; }

                isInitialized = false;
                if (config.debug) console.log('[Pulsar] Disabled');
            },

            getScope: function () { return globalScope; },

            captureException: function (error, metadata = {}) {
                pipeline.capture({
                    error_type: "CUSTOM_EXCEPTION",
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
