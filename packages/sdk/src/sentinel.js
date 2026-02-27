import { Sanitizers } from './sanitizers.js';

/**
 * SentinelKit SDK
 * Privacy-first error monitoring for SFCC.
 */
const Sentinel = (function () {
    // ------------------------------------------------------------------------
    // Private State & Configuration (Encapsulated to prevent XSS exfiltration)
    // ------------------------------------------------------------------------
    class Scope {
        constructor() {
            this._breadcrumbs = [];
            this._tags = {};
            this._user = {};
            this._extra = {};
            this._maxBreadcrumbs = 100;
        }

        setTag(key, value) { this._tags[key] = value; return this; }
        setUser(user) { this._user = user; return this; }
        setExtra(key, value) { this._extra[key] = value; return this; }
        setMaxBreadcrumbs(max) { this._maxBreadcrumbs = max; return this; }

        addBreadcrumb(crumb) {
            this._breadcrumbs.push({
                timestamp: Date.now(),
                ...crumb
            });
            if (this._breadcrumbs.length > this._maxBreadcrumbs) {
                this._breadcrumbs = this._breadcrumbs.slice(-this._maxBreadcrumbs);
            }
            return this;
        }

        getScopeData() {
            return {
                user: this._user,
                tags: this._tags,
                extra: this._extra,
                breadcrumbs: this._breadcrumbs
            };
        }

        clone() {
            const cloned = new Scope();
            cloned._breadcrumbs = [...this._breadcrumbs];
            cloned._tags = { ...this._tags };
            cloned._user = { ...this._user };
            cloned._extra = { ...this._extra };
            cloned._maxBreadcrumbs = this._maxBreadcrumbs;
            return cloned;
        }
    }

    function createClient() {
        let globalScope = new Scope();

        let config = {
            clientId: null,
            endpoint: 'https://api.mosaique.ltd/v1/ingest',
            sessionEndpoint: 'https://api.mosaique.ltd/v1/session',
            turnstileSiteKey: '0x4AAAAAACVYqSIDSp33EJ0z',
            siteId: 'unknown',
            storefrontType: 'PWA_KIT',
            enabled: true, // Fix Bug 5: Default to true (sampling will still apply)
            sampleRate: 1.0,
            endpointFilter: /\/baskets\/|\/orders\/|\/products\/|\/shopper\//i,
            criticalSelectors: ['.error-message', '.alert-danger', '.checkout-error', '.toast-error'],
            beforeSend: null,
            beforeSendTimeout: 2000,
            allowUnconfirmedConsent: false,
            nonce: null,
            secret: null, // SKF-015: HMAC Secret
            maxBreadcrumbs: 100,
            slowApiThreshold: 1000,
            debug: false
        };

        let sessionID = null;
        let sessionToken = null;
        let _handshakePromise = null;
        let isInitialized = false;
        let enabled = false;
        let isSampled = null; // Bug Fix: Start as null to avoid race condition in sampling
        let queue = [];
        let _droppedEventsCount = 0; // Telemetry for dropped events
        let _droppedSinceLastFlush = 0;
        let _firstDropTimestamp = null;
        const MAX_QUEUE_SIZE = 50;
        const _fingerprintCache = new Map(); // deduplication layer

        // Store originals for clean teardown
        let _originalFetch = null;
        let _originalOnerror = null;
        let _originalOnunhandledrejection = null;
        let _visibilityHandler = null;
        let _originalXhrOpen = null;
        let _originalXhrSend = null;
        let _interactionHandler = null;

        function _hash(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            return hash.toString(36);
        }

        function _captureEnvironment() {
            return {
                time_since_load: typeof performance !== 'undefined' ? Math.floor(performance.now()) : 0,
                screen_resolution: window.screen ? `${window.screen.width}x${window.screen.height}` : 'unknown',
                timezone_offset: new Date().getTimezoneOffset(),
                is_devtools_open: (window.outerWidth - window.innerWidth > 160) || (window.outerHeight - window.innerHeight > 160)
            };
        }

        function _extractCampaigns() {
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

        // ------------------------------------------------------------------------
        // RUM & Private Methods
        // ------------------------------------------------------------------------

        let webVitals = {
            lcp: null,
            inp: null,
            inp_interaction_id: null,
            cls: 0,
            ttfb: null,
            loadTime: null
        };

        function _setupPerformanceObserver() {
            if (typeof PerformanceObserver === 'undefined') return;

            try {
                new PerformanceObserver((entryList) => {
                    const entries = entryList.getEntries();
                    if (entries.length > 0) webVitals.lcp = entries[entries.length - 1].renderTime || entries[entries.length - 1].loadTime;
                }).observe({ type: 'largest-contentful-paint', buffered: true });

                // SKF-007: Interaction to Next Paint (INP)
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
                    // Fallback to FID if INP is not supported by browser
                    new PerformanceObserver((entryList) => {
                        entryList.getEntries().forEach(entry => {
                            if (webVitals.inp === null) webVitals.inp = entry.processingStart - entry.startTime;
                        });
                    }).observe({ type: 'first-input', buffered: true });
                }

                new PerformanceObserver((entryList) => {
                    for (const entry of entryList.getEntries()) {
                        if (!entry.hadRecentInput) webVitals.cls += entry.value;
                    }
                }).observe({ type: 'layout-shift', buffered: true });

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
                if (config.debug) console.warn('[Sentinel] PerformanceObserver failed', e);
            }
        }

        function _captureRUM() {
            if (!enabled || !isInitialized) return;
            let payload = {
                client_id: config.clientId,
                storefront_type: config.storefrontType,
                site_id: config.siteId,
                session_id: sessionID,
                url: window.location.href,
                timestamp: new Date().toISOString(),
                event_type: "RUM_METRICS",
                metrics: webVitals,
                metadata: _extractSFCCContext(),
                environment: _captureEnvironment(),
                device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
                dropped_events: _droppedEventsCount
            };
            _capture(payload, globalScope, true); // Bypass normal dedupe for RUM
        }

        function _generateSessionID() {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
            if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                    var r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
                    var v = c === 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }
            console.warn('[Sentinel] Secure crypto unavailable for Session ID');
            return '00000000-0000-4000-0000-000000000000';
        }

        function _validateConfig() {
            const errors = [];
            const { clientId, endpoint, sampleRate, endpointFilter } = config;

            if (!clientId || typeof clientId !== 'string') {
                errors.push('Missing or invalid clientId. SDK disabled.');
            }
            if (typeof endpoint !== 'string' || (!endpoint.startsWith('/') && !endpoint.startsWith('https://'))) {
                errors.push('endpoint must be a relative path or https:// URL.');
            }
            if (typeof sampleRate !== 'number' || sampleRate < 0 || sampleRate > 1) {
                errors.push('sampleRate must be a number between 0 and 1.');
            }
            if (endpointFilter && !(endpointFilter instanceof RegExp)) {
                errors.push('endpointFilter must be a RegExp.');
            }
            return errors;
        }

        function _getCookie(name) {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(';').shift();
            return null;
        }

        function _extractSFCCContext() {
            const context = {
                dwsid: _getCookie('dwsid') || null,
                visitorId: null,
                customerId: null,
                pageType: null
            };

            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const c = cookies[i].trim();
                if (c.startsWith('dwac_')) {
                    const parts = c.split('=');
                    if (parts.length > 1) {
                        const decoded = decodeURIComponent(parts[1]).trim();
                        const vals = decoded.split('|');
                        if (vals.length >= 3) {
                            context.visitorId = vals[0] !== '__ANNONYMOUS__' ? vals[0] : null;
                            context.customerId = vals[2] !== '__ANNONYMOUS__' ? vals[2] : null;
                        }
                    }
                    break;
                }
            }

            const path = window.location.pathname.toLowerCase();
            if (path.includes('/checkout')) context.pageType = 'Checkout';
            else if (path.includes('/cart')) context.pageType = 'Cart';
            else if (path.includes('/p/')) context.pageType = 'PDP';
            else if (path.includes('/d/')) context.pageType = 'PLP';
            else if (path.includes('/search')) context.pageType = 'Search';
            else if (path === '/' || path === '') context.pageType = 'Home';

            if (typeof window.dw !== 'undefined' && window.dw.ac && window.dw.ac._category) {
                context.category = window.dw.ac._category;
            }

            if (typeof window.Evergage !== 'undefined' && window.Evergage.getCurrentArticle) {
                context.evergageActive = true;
            }
            if (typeof window.BOOMR !== 'undefined' && window.BOOMR.session) {
                context.boomrSession = window.BOOMR.session.id;
            }

            const campaign = _extractCampaigns();
            if (campaign) {
                context.campaign = campaign;
            }

            return context;
        }

        function _setupGlobalHandlers() {
            _originalOnerror = window.onerror;
            _originalOnunhandledrejection = window.onunhandledrejection;

            window.onerror = function (msg, url, line, col, error) {
                _capture({
                    error_type: "JS_CRASH",
                    message: msg,
                    url: window.location.href,
                    response_snippet: error ? error.stack : `${url}:${line}:${col}`,
                    severity: "error",
                    is_blocking: true
                });
                if (_originalOnerror) _originalOnerror.apply(this, arguments);
            };

            window.onunhandledrejection = function (event) {
                _capture({
                    error_type: "JS_CRASH",
                    message: event.reason ? event.reason.toString() : 'Unhandled Promise Rejection',
                    url: window.location.href,
                    response_snippet: event.reason && event.reason.stack ? event.reason.stack : null,
                    severity: "error",
                    is_blocking: false
                });
                if (_originalOnunhandledrejection) _originalOnunhandledrejection.apply(this, arguments);
            };

            // Bug 4: Optimized MutationObserver
            if (typeof MutationObserver !== 'undefined' && config.criticalSelectors.length > 0) {
                let mutationBuffer = [];
                let mutationTimeout = null;

                const processMutations = () => {
                    const nodesToProcess = mutationBuffer;
                    mutationBuffer = [];
                    mutationTimeout = null;

                    nodesToProcess.forEach(node => {
                        for (const selector of config.criticalSelectors) {
                            if ((node.matches && node.matches(selector)) || (node.querySelector && node.querySelector(selector))) {
                                _capture({
                                    error_type: "UI_FAILURE",
                                    message: `Critical error UI rendered: ${selector}`,
                                    severity: "warning",
                                    is_blocking: false
                                });
                            }
                        }
                    });
                };

                const observer = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        if (mutation.type === 'childList') {
                            mutation.addedNodes.forEach(node => {
                                if (node.nodeType === 1) mutationBuffer.push(node);
                            });
                        }
                    }
                    if (mutationBuffer.length > 0 && !mutationTimeout) {
                        mutationTimeout = setTimeout(processMutations, 100); // 100ms debounce
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
            }

            _interactionHandler = function (e) {
                if (!e.target || e.target === document) return;
                const tag = e.target.tagName ? e.target.tagName.toLowerCase() : 'unknown';
                const id = e.target.id ? `#${e.target.id}` : '';
                const cls = typeof e.target.className === 'string' && e.target.className ? `.${e.target.className.trim().replace(/\s+/g, '.')}` : '';
                globalScope.addBreadcrumb({
                    category: 'ui.click',
                    message: `${tag}${id}${cls}`,
                    time_since_load: typeof performance !== 'undefined' ? Math.floor(performance.now()) : 0
                });
            };
            document.body.addEventListener('click', _interactionHandler, true);
        }

        function _setupFetchInterceptor() {
            if (!window.fetch) return;
            _originalFetch = window.fetch;
            window.fetch = async function (...args) {
                // Bug 1 Fix: Surgical safety wrapper
                let requestUrl = '';
                try {
                    requestUrl = (typeof args[0] === 'string' ? args[0] : args[0].url) || '';
                } catch { }

                const proceed = () => _originalFetch.apply(this, args);

                // If we can't even get the URL, just proceed
                if (!requestUrl) return proceed();

                const isSFCCRoute = config.endpointFilter ? config.endpointFilter.test(requestUrl) : true;
                const isInternalRoute = requestUrl.includes(config.endpoint);

                if (!isSFCCRoute || isInternalRoute) return proceed();

                // Interceptor logic wrapped in try-catch to protect host app
                try {
                    let bodySnippet = null;
                    // Safety check on args/body
                    if (args[1] && args[1].body && typeof args[1].body === 'string') {
                        bodySnippet = Sanitizers.redactPII(args[1].body).substring(0, 500);
                    }

                    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

                    const response = await _originalFetch.apply(this, args);
                    const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;

                    if (!response.ok) {
                        _capture({
                            error_type: "API_FAILURE",
                            message: `API HTTP ${response.status}: ${response.url}`,
                            response_snippet: bodySnippet,
                            metadata: { status: response.status, endpoint: response.url, duration_ms: duration },
                            severity: response.status >= 500 ? "error" : "warning",
                            is_blocking: false
                        });
                    } else if (duration > config.slowApiThreshold) {
                        _capture({
                            error_type: "API_LATENCY",
                            message: `Slow API call: ${response.url}`,
                            metadata: { endpoint: response.url, duration_ms: duration },
                            severity: "info",
                            is_blocking: false
                        });
                    }
                    return response;
                } catch (error) {
                    // Check if it's already intercepted
                    if (error.__sentinel_processed) throw error;

                    _capture({
                        error_type: "NETWORK_ERROR",
                        message: error.message,
                        url: requestUrl,
                        severity: "error",
                        is_blocking: true
                    });

                    error.__sentinel_processed = true;
                    throw error;
                }
            };
        }

        function _setupXHRInterceptor() {
            if (!window.XMLHttpRequest) return;
            _originalXhrOpen = XMLHttpRequest.prototype.open;
            _originalXhrSend = XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.open = function (method, url) {
                try {
                    this._method = method;
                    this._url = url;
                } catch (e) {
                    if (config.debug) console.warn('[Sentinel] XHR open intercept failed', e);
                }
                return _originalXhrOpen.apply(this, arguments);
            };

            XMLHttpRequest.prototype.send = function (body) {
                try {
                    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
                    const requestUrl = typeof this._url === 'string' ? this._url : '';

                    const isSFCCRoute = config.endpointFilter ? config.endpointFilter.test(requestUrl) : true;
                    // Fix: Ensure we don't intercept ourselves even if filters are loose
                    const isInternalRoute = requestUrl.includes(config.endpoint) || requestUrl.includes(config.sessionEndpoint);

                    if (isSFCCRoute && !isInternalRoute) {
                        this.addEventListener('loadend', () => {
                            try {
                                const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;

                                if (this.status === 0) {
                                    _capture({
                                        error_type: "NETWORK_ERROR",
                                        message: `XHR Network Error (Status 0): ${this._url}`,
                                        metadata: { method: this._method, url: this._url, duration_ms: duration },
                                        severity: "error",
                                        is_blocking: false
                                    });
                                } else if (this.status >= 400) {
                                    let bodySnippet = null;
                                    if (body && typeof body === 'string') {
                                        bodySnippet = Sanitizers.redactPII(body).substring(0, 500);
                                    }
                                    _capture({
                                        error_type: "API_FAILURE",
                                        message: `XHR HTTP ${this.status}: ${this._url}`,
                                        response_snippet: bodySnippet,
                                        metadata: { status: this.status, endpoint: this._url, method: this._method, duration_ms: duration },
                                        severity: this.status >= 500 ? "error" : "warning",
                                        is_blocking: false
                                    });
                                } else if (duration > config.slowApiThreshold) {
                                    _capture({
                                        error_type: "API_LATENCY",
                                        message: `Slow XHR call: ${this._url}`,
                                        metadata: { endpoint: this._url, method: this._method, duration_ms: duration },
                                        severity: "info",
                                        is_blocking: false
                                    });
                                }
                            } catch (e) {
                                if (config.debug) console.warn('[Sentinel] XHR loadend hook error', e);
                            }
                        });
                    }
                } catch (e) {
                    if (config.debug) console.warn('[Sentinel] XHR send intercept failed', e);
                }
                return _originalXhrSend.apply(this, arguments);
            };
        }

        async function _performHandshake() {
            if (sessionToken) return;
            if (_handshakePromise) return _handshakePromise;

            _handshakePromise = (async () => {
                let container = null;
                try {
                    if (!window.turnstile) {
                        await new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
                            script.async = true;
                            if (config.nonce) script.setAttribute('nonce', config.nonce);
                            script.onload = resolve;
                            script.onerror = reject;
                            document.head.appendChild(script);
                        });
                    }

                    await new Promise(resolve => {
                        if (window.turnstile && window.turnstile.render) resolve();
                        else setTimeout(resolve, 500);
                    });

                    container = document.createElement('div');
                    container.style.display = 'none';
                    document.body.appendChild(container);

                    const token = await new Promise((resolve, reject) => {
                        window.turnstile.render(container, {
                            sitekey: config.turnstileSiteKey,
                            callback: resolve,
                            'error-callback': reject,
                            action: 'handshake'
                        });
                    });

                    const nativeFetch = _originalFetch || window.fetch;
                    const res = await nativeFetch(config.sessionEndpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clientId: config.clientId, 'cf-turnstile-response': token })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        if (data.token) {
                            sessionToken = data.token;
                            _flush();
                        }
                    } else if (config.debug) console.warn('[Sentinel] Failed to negotiate session handshake');
                } catch (e) {
                    if (config.debug) console.error('[Sentinel] Session verification error:', e);
                } finally {
                    if (container && container.parentNode) container.parentNode.removeChild(container);
                }
            })();

            return _handshakePromise;
        }

        async function _capture(errorData, localScope = globalScope, bypassDedupe = false) {
            if (!enabled || !isInitialized) return;

            // Bug 2: Classification / Fingerprinting Layer
            if (!bypassDedupe) {
                const fingerprint = _hash(`${errorData.error_type}|${errorData.message}|${window.location.pathname}`);
                const isCheckout = /checkout/i.test(window.location.pathname);

                if (!isCheckout) {
                    const now = Date.now();
                    const cached = _fingerprintCache.get(fingerprint);
                    if (cached && (now - cached.timestamp < 60000)) { // 1-minute suppression for non-checkout
                        cached.count++;
                        return;
                    }
                    _fingerprintCache.set(fingerprint, { timestamp: now, count: 1 });
                }
            }

            let payload = {
                client_id: config.clientId,
                storefront_type: config.storefrontType,
                site_id: config.siteId,
                session_id: sessionID,
                url: window.location.href,
                timestamp: new Date().toISOString(),
                error_type: errorData.error_type,
                message: Sanitizers.redactPII(errorData.message || 'Unknown error'),
                response_snippet: errorData.response_snippet ? Sanitizers.redactPII(errorData.response_snippet) : null,
                severity: errorData.severity || 'error',
                is_blocking: errorData.is_blocking || false,
                metadata: { ...errorData.metadata, ..._extractSFCCContext() },
                environment: _captureEnvironment(),
                device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
                status_code: errorData.status_code || null,
                scope: localScope.getScopeData(),
                dropped_events: _droppedEventsCount
            };

            // SKF-009: Async beforeSend & Strict CMP Fallback
            if (typeof config.beforeSend === 'function') {
                try {
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), config.beforeSendTimeout)
                    );

                    payload = await Promise.race([
                        Promise.resolve(config.beforeSend(payload)),
                        timeoutPromise
                    ]);
                } catch (e) {
                    if (e.message === 'timeout') {
                        if (config.debug) console.warn('[Sentinel] beforeSend timed out after ' + config.beforeSendTimeout + 'ms');
                        if (config.allowUnconfirmedConsent) {
                            payload.metadata = payload.metadata || {};
                            payload.metadata.consent_unconfirmed = true;
                        } else {
                            if (config.debug) console.log('[Sentinel] Event dropped due to strict consent fallback');
                            return;
                        }
                    } else {
                        if (config.debug) console.warn('[Sentinel] beforeSend hook threw an error', e);
                        // Keep payload as-is if hook crashes normally (not timeout) to avoid silent swallow
                    }
                }
            }

            if (payload === null) {
                if (config.debug) console.log('[Sentinel] Event dropped by beforeSend hook');
                return;
            }

            queue.push(payload);
            if (queue.length > MAX_QUEUE_SIZE) {
                queue.shift(); // Drop oldest event
                _droppedEventsCount++;
                _droppedSinceLastFlush++;
                if (!_firstDropTimestamp) _firstDropTimestamp = new Date().toISOString();
            }
            _flush();
        }

        async function _generateSignature(payload, secret) {
            if (!secret || typeof crypto === 'undefined' || !crypto.subtle) return null;
            try {
                const encoder = new TextEncoder();
                const keyData = encoder.encode(secret);
                const msgData = encoder.encode(JSON.stringify(payload));
                const key = await crypto.subtle.importKey(
                    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
                );
                const signature = await crypto.subtle.sign('HMAC', key, msgData);
                return btoa(String.fromCharCode(...new Uint8Array(signature)));
            } catch (e) {
                if (config.debug) console.error('[Sentinel] HMAC generation failed', e);
                return null;
            }
        }

        async function _flush() {
            if (queue.length === 0 && _droppedSinceLastFlush === 0) return;

            // Reliability: telemetry can queue even if handshake is pending
            // But if we have HMAC, we might not need the sessionToken handshake anymore?
            // For now, keep the sessionToken logic as secondary/legacy until removed.
            if (!sessionToken && !config.secret) {
                if (!_handshakePromise && enabled) _performHandshake();
                return;
            }

            // SKF-008: Deterministic Queue Overflow Logging
            if (_droppedSinceLastFlush > 0) {
                queue.unshift({
                    client_id: config.clientId,
                    storefront_type: config.storefrontType,
                    site_id: config.siteId,
                    session_id: sessionID,
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    error_type: "QUEUE_OVERFLOW",
                    message: `Dropped ${_droppedSinceLastFlush} events due to queue limits`,
                    metadata: { dropped_count: _droppedSinceLastFlush, first_drop_time: _firstDropTimestamp },
                    dropped_events: _droppedEventsCount,
                    severity: "warning",
                    is_blocking: false
                });
                _droppedSinceLastFlush = 0;
                _firstDropTimestamp = null;
            }

            const payload = {
                sentinel_version: '1.0.0',
                client_id: config.clientId,
                site_id: config.siteId,
                timestamp: new Date().toISOString(),
                events: [...queue],
                dropped_events: _droppedEventsCount
            };

            queue = []; // Clear queue immediately to avoid double-flush race

            const signature = await _generateSignature(payload, config.secret);
            const endpoint = config.endpoint;
            const nativeFetch = _originalFetch || window.fetch;
            const payloadStr = JSON.stringify(payload);

            const headers = {
                'Content-Type': 'application/json',
                'X-Sentinel-Client-Id': config.clientId
            };
            if (signature) headers['X-Sentinel-Signature'] = signature;
            if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

            let success = false;
            let retryCount = 0;
            const maxRetries = 3;

            // SKF-013: Resilient Flush & FLUSH_FAILED Event
            while (retryCount <= maxRetries && !success) {
                try {
                    // Note: signature/headers cannot be sent via beacon easily.
                    // If we have a signature, we MUST use fetch for the first attempt.
                    if (retryCount === 0 && !signature && navigator.sendBeacon) {
                        const blob = new Blob([payloadStr], { type: 'application/json' });
                        success = navigator.sendBeacon(endpoint, blob);
                    }

                    if (!success) {
                        const res = await nativeFetch(endpoint, {
                            method: 'POST',
                            headers: headers,
                            body: payloadStr,
                            keepalive: true
                        });
                        success = res.ok;
                    }
                } catch (e) {
                    // Network error
                }

                if (!success) {
                    retryCount++;
                    if (retryCount <= maxRetries) {
                        await new Promise(r => setTimeout(r, retryCount === 1 ? 500 : 1500));
                    }
                }
            }

            if (!success) {
                if (config.debug) console.error('[Sentinel] Failed to deliver event batch after ' + maxRetries + ' retries');
                _capture({
                    error_type: "FLUSH_FAILED",
                    message: `Failed to deliver event batch`,
                    severity: "error",
                    is_blocking: false
                });
            }
        }

        // ------------------------------------------------------------------------
        // Public API Methods
        // ------------------------------------------------------------------------
        return {
            init: function (usrConfig = {}) {
                const initializer = () => {
                    if (isInitialized) return;

                    config = { ...config, ...usrConfig };

                    const errors = _validateConfig();
                    if (errors.length > 0) {
                        if (config.debug) errors.forEach(e => console.warn(`[Sentinel] ${e}`));
                        enabled = false;
                        return;
                    }

                    if (!sessionID) sessionID = _generateSessionID();

                    if (navigator.doNotTrack === '1') {
                        if (config.debug) console.warn('[Sentinel] Do Not Track enabled. SDK disabled.');
                        enabled = false;
                        isSampled = false;
                    } else {
                        isSampled = Math.random() <= config.sampleRate;
                        enabled = !!config.enabled && isSampled;
                    }

                    if (!enabled) return;

                    globalScope.setMaxBreadcrumbs(config.maxBreadcrumbs);
                    _setupPerformanceObserver();
                    _setupGlobalHandlers();
                    _setupFetchInterceptor();
                    _setupXHRInterceptor();

                    _visibilityHandler = () => {
                        if (document.visibilityState === 'hidden') {
                            _captureRUM();
                            _flush();
                        }
                    };
                    document.addEventListener('visibilitychange', _visibilityHandler);

                    isInitialized = true;
                    if (config.debug) console.log('[Sentinel] Initialized', config.clientId, 'Enabled:', enabled);

                    _performHandshake();
                };

                if (window.requestIdleCallback) window.requestIdleCallback(initializer);
                else setTimeout(initializer, 1);
            },

            enable: function () {
                // Bug Fix: Check isSampled properly
                if (isSampled === null) isSampled = Math.random() <= config.sampleRate;

                if (!isSampled) {
                    if (config.debug) console.log('[Sentinel] Session excluded by sampling rate');
                    return;
                }
                enabled = true;
                if (config.debug) console.log('[Sentinel] Enabled');
                if (isInitialized) _performHandshake();
            },

            disable: function () {
                enabled = false;
                if (_originalFetch) { window.fetch = _originalFetch; _originalFetch = null; }
                if (_originalXhrOpen && window.XMLHttpRequest) {
                    XMLHttpRequest.prototype.open = _originalXhrOpen;
                    XMLHttpRequest.prototype.send = _originalXhrSend;
                    _originalXhrOpen = null;
                    _originalXhrSend = null;
                }
                if (_originalOnerror !== null) { window.onerror = _originalOnerror; _originalOnerror = null; }
                if (_originalOnunhandledrejection !== null) { window.onunhandledrejection = _originalOnunhandledrejection; _originalOnunhandledrejection = null; }
                if (_visibilityHandler) { document.removeEventListener('visibilitychange', _visibilityHandler); _visibilityHandler = null; }
                if (_interactionHandler) { document.body.removeEventListener('click', _interactionHandler, true); _interactionHandler = null; }

                isInitialized = false;
                sessionToken = null;
                _handshakePromise = null;
                if (config.debug) console.log('[Sentinel] Disabled');
            },

            getScope: function () { return globalScope; },

            captureException: function (error, metadata = {}) {
                _capture({
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
    // SKF-010: Scope Isolation factory
    defaultClient.createInstance = function (cfg = {}) {
        const instance = createClient();
        if (Object.keys(cfg).length > 0) instance.init(cfg);
        return instance;
    };

    return defaultClient;
})();

window.Sentinel = Sentinel;
export default Sentinel;
