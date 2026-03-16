/**
 * PulsarJS — Network Interceptors
 * Monkey-patches fetch and XHR to capture API failures, latency, network errors,
 * and commerce actions (ECKG nodes: cart_add, checkout, search).
 */
import { Sanitizers } from '../utils/sanitizers.js';

/**
 * SFCC SCAPI commerce action patterns.
 * Successful calls to these endpoints emit COMMERCE_ACTION events
 * so the server can build funnel edges in the knowledge graph.
 */
const COMMERCE_ACTIONS = [
    { action: 'cart_add',    method: 'POST',   pattern: /\/baskets\/[^/]+\/items/i },
    { action: 'cart_update', method: 'PATCH',  pattern: /\/baskets\//i },
    { action: 'cart_remove', method: 'DELETE',  pattern: /\/baskets\/[^/]+\/items/i },
    { action: 'checkout',    method: 'POST',   pattern: /\/orders/i },
    { action: 'search',      method: 'GET',    pattern: /\/product-search/i }
];

function detectCommerceAction(method, url) {
    const m = (method || 'GET').toUpperCase();
    for (const ca of COMMERCE_ACTIONS) {
        if (ca.method === m && ca.pattern.test(url)) return ca.action;
    }
    return null;
}

/**
 * Patch window.fetch to intercept SFCC API calls.
 */
export function setupFetchInterceptor(state) {
    if (!window.fetch) return;
    const { config, capture } = state;

    state.originalFetch = window.fetch;

    window.fetch = async function (...args) {
        let requestUrl = '';
        try {
            requestUrl = (typeof args[0] === 'string' ? args[0] : args[0].url) || '';
        } catch { }

        const proceed = () => state.originalFetch.apply(this, args);

        if (!requestUrl) return proceed();

        const isSFCCRoute = config.endpointFilter ? config.endpointFilter.test(requestUrl) : true;
        const isInternalRoute = requestUrl.includes(config.endpoint);

        if (!isSFCCRoute || isInternalRoute) return proceed();

        try {
            const method = (args[1]?.method || 'GET').toUpperCase();
            let bodySnippet = null;
            if (args[1] && args[1].body && typeof args[1].body === 'string') {
                bodySnippet = Sanitizers.redactPII(args[1].body).substring(0, 500);
            }

            const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const response = await state.originalFetch.apply(this, args);
            const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;

            if (!response.ok) {
                capture({
                    event_type: "API_FAILURE",
                    message: `API HTTP ${response.status}: ${Sanitizers.sanitizeApiEndpoint(response.url)}`,
                    response_snippet: bodySnippet,
                    metadata: { status: response.status, endpoint: Sanitizers.sanitizeApiEndpoint(response.url), method, duration_ms: Math.round(duration) },
                    severity: response.status >= 500 ? "error" : "warning",
                    is_blocking: false
                });
            } else {
                // Commerce action detection — successful SCAPI calls become ECKG nodes
                const commerceAction = detectCommerceAction(method, requestUrl);
                if (commerceAction) {
                    capture({
                        event_type: "COMMERCE_ACTION",
                        message: `Commerce: ${commerceAction}`,
                        metadata: {
                            action: commerceAction,
                            endpoint: Sanitizers.sanitizeApiEndpoint(requestUrl),
                            method,
                            duration_ms: Math.round(duration)
                        },
                        severity: "info",
                        is_blocking: false
                    });
                }

                if (duration > config.slowApiThreshold) {
                    capture({
                        event_type: "API_LATENCY",
                        message: `Slow API: ${Sanitizers.sanitizeApiEndpoint(response.url)}`,
                        metadata: { endpoint: Sanitizers.sanitizeApiEndpoint(response.url), method, duration_ms: Math.round(duration) },
                        severity: "info",
                        is_blocking: false
                    });
                }
            }
            return response;
        } catch (error) {
            if (state.processedErrors.has(error)) throw error;

            capture({
                event_type: "NETWORK_ERROR",
                message: error.message,
                metadata: { endpoint: Sanitizers.sanitizeApiEndpoint(requestUrl), method },
                severity: "error",
                is_blocking: true
            });

            state.processedErrors.add(error);
            throw error;
        }
    };
}

/**
 * Patch XMLHttpRequest to intercept legacy SFCC/third-party AJAX calls.
 */
export function setupXHRInterceptor(state) {
    if (!window.XMLHttpRequest) return;
    const { config, capture } = state;

    state.originalXhrOpen = XMLHttpRequest.prototype.open;
    state.originalXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
        try {
            this._method = method;
            this._url = url;
        } catch (e) {
            if (config.debug) console.warn('[Pulsar] XHR open intercept failed', e);
        }
        return state.originalXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
        try {
            const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const requestUrl = typeof this._url === 'string' ? this._url : '';

            const isSFCCRoute = config.endpointFilter ? config.endpointFilter.test(requestUrl) : true;
            const isInternalRoute = requestUrl.includes(config.endpoint);

            if (isSFCCRoute && !isInternalRoute) {
                this.addEventListener('loadend', () => {
                    try {
                        const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;

                        if (this.status === 0) {
                            capture({
                                event_type: "NETWORK_ERROR",
                                message: `XHR Network Error: ${Sanitizers.sanitizeApiEndpoint(this._url)}`,
                                metadata: { method: this._method, endpoint: Sanitizers.sanitizeApiEndpoint(this._url), duration_ms: Math.round(duration) },
                                severity: "error",
                                is_blocking: false
                            });
                        } else if (this.status >= 400) {
                            let bodySnippet = null;
                            if (body && typeof body === 'string') {
                                bodySnippet = Sanitizers.redactPII(body).substring(0, 500);
                            }
                            capture({
                                event_type: "API_FAILURE",
                                message: `XHR HTTP ${this.status}: ${Sanitizers.sanitizeApiEndpoint(this._url)}`,
                                response_snippet: bodySnippet,
                                metadata: { status: this.status, endpoint: Sanitizers.sanitizeApiEndpoint(this._url), method: this._method, duration_ms: Math.round(duration) },
                                severity: this.status >= 500 ? "error" : "warning",
                                is_blocking: false
                            });
                        } else {
                            // Commerce action detection for XHR
                            const commerceAction = detectCommerceAction(this._method, this._url);
                            if (commerceAction) {
                                capture({
                                    event_type: "COMMERCE_ACTION",
                                    message: `Commerce: ${commerceAction}`,
                                    metadata: {
                                        action: commerceAction,
                                        endpoint: Sanitizers.sanitizeApiEndpoint(this._url),
                                        method: this._method,
                                        duration_ms: Math.round(duration)
                                    },
                                    severity: "info",
                                    is_blocking: false
                                });
                            }

                            if (duration > config.slowApiThreshold) {
                                capture({
                                    event_type: "API_LATENCY",
                                    message: `Slow XHR: ${Sanitizers.sanitizeApiEndpoint(this._url)}`,
                                    metadata: { endpoint: Sanitizers.sanitizeApiEndpoint(this._url), method: this._method, duration_ms: Math.round(duration) },
                                    severity: "info",
                                    is_blocking: false
                                });
                            }
                        }
                    } catch (e) {
                        if (config.debug) console.warn('[Pulsar] XHR loadend hook error', e);
                    }
                });
            }
        } catch (e) {
            if (config.debug) console.warn('[Pulsar] XHR send intercept failed', e);
        }
        return state.originalXhrSend.apply(this, arguments);
    };
}
