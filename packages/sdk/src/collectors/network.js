/**
 * PulsarJS — Network Interceptors
 * Monkey-patches fetch and XHR to capture API failures, latency, network errors,
 * and commerce actions (cart_add, checkout, search).
 */
import { Sanitizers } from '../utils/sanitizers.js';

/**
 * Detect commerce action from request method + URL using config-driven patterns.
 * PUL-027: reads from config.commerceActions instead of hardcoded patterns.
 *
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {Array<{action: string, method: string, pattern: RegExp}>} commerceActions
 * @returns {string|null} action name or null
 */
function detectCommerceAction(method, url, commerceActions) {
    const m = (method || 'GET').toUpperCase();
    for (const ca of commerceActions) {
        if (ca.method === m && ca.pattern.test(url)) return ca.action;
    }
    return null;
}

/**
 * Patch window.fetch to intercept commerce API calls.
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

        const isMonitoredRoute = config.endpointFilter ? config.endpointFilter.test(requestUrl) : true;
        const isInternalRoute = requestUrl.includes(config.endpoint);

        if (!isMonitoredRoute || isInternalRoute) return proceed();

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
                // PUL-028: blocked_by edge — commerce failed after prior commerce event
                const failedAction = detectCommerceAction(method, requestUrl, config.commerceActions);
                const failedEventId = await capture({
                    event_type: "API_FAILURE",
                    message: `API HTTP ${response.status}: ${Sanitizers.sanitizeApiEndpoint(response.url)}`,
                    response_snippet: bodySnippet,
                    metadata: { status: response.status, endpoint: Sanitizers.sanitizeApiEndpoint(response.url), method, duration_ms: Math.round(duration) },
                    severity: response.status >= 500 ? "error" : "warning",
                    is_blocking: false,
                    ...(failedAction && state.lastCommerceEventId
                        ? { caused_by: state.lastCommerceEventId, edge_hint: 'blocked_by' }
                        : {})
                });
                // Track failed commerce action for retried_after edge
                if (failedAction && failedEventId) {
                    state.lastFailedCommerceAction[failedAction] = { event_id: failedEventId };
                }
            } else {
                // PUL-028: commerce/latency blocks are sequential — commerce awaited for event_id
                let commerceEventId = null;
                const commerceAction = detectCommerceAction(method, requestUrl, config.commerceActions);
                if (commerceAction) {
                    const failed = state.lastFailedCommerceAction[commerceAction];
                    commerceEventId = await capture({
                        event_type: "COMMERCE_ACTION",
                        message: `Commerce: ${commerceAction}`,
                        metadata: {
                            action: commerceAction,
                            endpoint: Sanitizers.sanitizeApiEndpoint(requestUrl),
                            method,
                            duration_ms: Math.round(duration)
                        },
                        severity: "info",
                        is_blocking: false,
                        ...(failed ? { caused_by: failed.event_id, edge_hint: 'retried_after' } : {})
                    });
                    if (commerceEventId) {
                        state.lastCommerceEventId = commerceEventId;
                        state.lastCommerceAction = { action: commerceAction, event_id: commerceEventId };
                    }
                    if (failed) delete state.lastFailedCommerceAction[commerceAction];
                }

                // PUL-028: degraded_by edge — latency caused by prior commerce action in same request
                if (duration > config.slowApiThreshold) {
                    capture({
                        event_type: "API_LATENCY",
                        message: `Slow API: ${Sanitizers.sanitizeApiEndpoint(response.url)}`,
                        metadata: { endpoint: Sanitizers.sanitizeApiEndpoint(response.url), method, duration_ms: Math.round(duration) },
                        severity: "info",
                        is_blocking: false,
                        ...(commerceEventId ? { caused_by: commerceEventId, edge_hint: 'degraded_by' } : {})
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
 * Patch XMLHttpRequest to intercept legacy AJAX calls.
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
            // eslint-disable-next-line no-console
            if (config.debug) console.warn('[Pulsar] XHR open intercept failed', e);
        }
        return state.originalXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
        try {
            const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const requestUrl = typeof this._url === 'string' ? this._url : '';

            const isMonitoredRoute = config.endpointFilter ? config.endpointFilter.test(requestUrl) : true;
            const isInternalRoute = requestUrl.includes(config.endpoint);

            if (isMonitoredRoute && !isInternalRoute) {
                this.addEventListener('loadend', async () => {
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
                            // PUL-028: blocked_by edge — commerce failed after prior commerce event
                            let bodySnippet = null;
                            if (body && typeof body === 'string') {
                                bodySnippet = Sanitizers.redactPII(body).substring(0, 500);
                            }
                            const failedAction = detectCommerceAction(this._method, this._url, config.commerceActions);
                            const failedEventId = await capture({
                                event_type: "API_FAILURE",
                                message: `XHR HTTP ${this.status}: ${Sanitizers.sanitizeApiEndpoint(this._url)}`,
                                response_snippet: bodySnippet,
                                metadata: { status: this.status, endpoint: Sanitizers.sanitizeApiEndpoint(this._url), method: this._method, duration_ms: Math.round(duration) },
                                severity: this.status >= 500 ? "error" : "warning",
                                is_blocking: false,
                                ...(failedAction && state.lastCommerceEventId
                                    ? { caused_by: state.lastCommerceEventId, edge_hint: 'blocked_by' }
                                    : {})
                            });
                            // Track failed commerce action for retried_after edge
                            if (failedAction && failedEventId) {
                                state.lastFailedCommerceAction[failedAction] = { event_id: failedEventId };
                            }
                        } else {
                            // PUL-028: commerce/latency blocks are sequential — commerce awaited for event_id
                            let commerceEventId = null;
                            const commerceAction = detectCommerceAction(this._method, this._url, config.commerceActions);
                            if (commerceAction) {
                                const failed = state.lastFailedCommerceAction[commerceAction];
                                commerceEventId = await capture({
                                    event_type: "COMMERCE_ACTION",
                                    message: `Commerce: ${commerceAction}`,
                                    metadata: {
                                        action: commerceAction,
                                        endpoint: Sanitizers.sanitizeApiEndpoint(this._url),
                                        method: this._method,
                                        duration_ms: Math.round(duration)
                                    },
                                    severity: "info",
                                    is_blocking: false,
                                    ...(failed ? { caused_by: failed.event_id, edge_hint: 'retried_after' } : {})
                                });
                                if (commerceEventId) {
                                    state.lastCommerceEventId = commerceEventId;
                                    state.lastCommerceAction = { action: commerceAction, event_id: commerceEventId };
                                }
                                if (failed) delete state.lastFailedCommerceAction[commerceAction];
                            }

                            // PUL-028: degraded_by edge — latency caused by prior commerce action in same request
                            if (duration > config.slowApiThreshold) {
                                capture({
                                    event_type: "API_LATENCY",
                                    message: `Slow XHR: ${Sanitizers.sanitizeApiEndpoint(this._url)}`,
                                    metadata: { endpoint: Sanitizers.sanitizeApiEndpoint(this._url), method: this._method, duration_ms: Math.round(duration) },
                                    severity: "info",
                                    is_blocking: false,
                                    ...(commerceEventId ? { caused_by: commerceEventId, edge_hint: 'degraded_by' } : {})
                                });
                            }
                        }
                    } catch (e) {
                        // eslint-disable-next-line no-console
                        if (config.debug) console.warn('[Pulsar] XHR loadend hook error', e);
                    }
                });
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            if (config.debug) console.warn('[Pulsar] XHR send intercept failed', e);
        }
        return state.originalXhrSend.apply(this, arguments);
    };
}
