/**
 * PulsarJS — Network Interceptors
 * Monkey-patches fetch and XHR to capture API failures, latency, and network errors.
 */
import { Sanitizers } from '../utils/sanitizers.js';

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
            let bodySnippet = null;
            if (args[1] && args[1].body && typeof args[1].body === 'string') {
                bodySnippet = Sanitizers.redactPII(args[1].body).substring(0, 500);
            }

            const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const response = await state.originalFetch.apply(this, args);
            const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;

            if (!response.ok) {
                capture({
                    error_type: "API_FAILURE",
                    message: `API HTTP ${response.status}: ${response.url}`,
                    response_snippet: bodySnippet,
                    metadata: { status: response.status, endpoint: response.url, duration_ms: duration },
                    severity: response.status >= 500 ? "error" : "warning",
                    is_blocking: false
                });
            } else if (duration > config.slowApiThreshold) {
                capture({
                    error_type: "API_LATENCY",
                    message: `Slow API call: ${response.url}`,
                    metadata: { endpoint: response.url, duration_ms: duration },
                    severity: "info",
                    is_blocking: false
                });
            }
            return response;
        } catch (error) {
            if (error.__pulsar_processed) throw error;

            capture({
                error_type: "NETWORK_ERROR",
                message: error.message,
                url: requestUrl,
                severity: "error",
                is_blocking: true
            });

            error.__pulsar_processed = true;
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
                            capture({
                                error_type: "API_FAILURE",
                                message: `XHR HTTP ${this.status}: ${this._url}`,
                                response_snippet: bodySnippet,
                                metadata: { status: this.status, endpoint: this._url, method: this._method, duration_ms: duration },
                                severity: this.status >= 500 ? "error" : "warning",
                                is_blocking: false
                            });
                        } else if (duration > config.slowApiThreshold) {
                            capture({
                                error_type: "API_LATENCY",
                                message: `Slow XHR call: ${this._url}`,
                                metadata: { endpoint: this._url, method: this._method, duration_ms: duration },
                                severity: "info",
                                is_blocking: false
                            });
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
