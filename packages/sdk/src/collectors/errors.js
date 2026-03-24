/**
 * PulsarJS — Error Collectors
 * Global error handlers: error, unhandledrejection, MutationObserver.
 *
 * PUL-033: switched from window.onerror / window.onunhandledrejection property
 * assignment to addEventListener(). Property assignment is a single slot —
 * any script executing after Pulsar (GTM, Bazaarvoice, Einstein, Salesforce
 * Einstein) silently overwrites it and Pulsar stops catching errors with zero
 * indication of failure. addEventListener() stacks — all listeners fire.
 *
 * Teardown: handler references are stored on state so disable() can call
 * removeEventListener() cleanly. MutationObserver is also stored on state
 * (was a local variable before — could never be disconnected on disable()).
 */

/**
 * Set up global error handlers. Stores handler refs on state for teardown.
 *
 * @param {object} state - Shared SDK state
 */
import { Sanitizers } from '../utils/sanitizers.js';

export function setupErrorHandlers(state) {
    const { config, capture, globalScope } = state;

    try {
    // ── JS_CRASH: uncaught synchronous errors ────────────────────────────────
    // addEventListener('error') stacks with any other listener on the page.
    // The old window.onerror = assignment was a single slot — anything running
    // after Pulsar (GTM tags, third-party widgets) would overwrite it silently.
    state.errorHandler = async function (event) {
        try {
            // Skip resource-load errors (img, script, link) — they have no stack
            // and fire on the same 'error' event type but with no event.message.
            if (!event.message) return;
            const eventId = await capture({
                event_type: 'JS_CRASH',
                message: event.message,
                // SECURITY: M1
                response_snippet: event.error ? Sanitizers.sanitizeStack(event.error.stack) : Sanitizers.sanitizeStack(`${event.filename}:${event.lineno}:${event.colno}`),
                severity: 'error',
                is_blocking: true
            });
            if (eventId) state.lastErrorEventId = eventId;
        } catch (e) {
            if (config?.debug) console.warn('[Pulsar] errorHandler failed', e);
        }
    };
    window.addEventListener('error', state.errorHandler);

    // ── JS_CRASH: unhandled promise rejections ──────────────────────────────
    state.rejectionHandler = async function (event) {
        try {
            const eventId = await capture({
                event_type: 'JS_CRASH',
                message: event.reason ? event.reason.toString() : 'Unhandled Promise Rejection',
                // SECURITY: M1
                response_snippet: event.reason && event.reason.stack ? Sanitizers.sanitizeStack(event.reason.stack) : null,
                severity: 'error',
                is_blocking: false
            });
            if (eventId) state.lastErrorEventId = eventId;
        } catch (e) {
            if (config?.debug) console.warn('[Pulsar] rejectionHandler failed', e);
        }
    };
    window.addEventListener('unhandledrejection', state.rejectionHandler);

    // ── UI_FAILURE: MutationObserver for critical error selectors ────────────
    // Observer ref is stored on state so disable() can call .disconnect().
    // Previously it was a local variable — disable() had no way to reach it.
    if (typeof MutationObserver !== 'undefined' && config.criticalSelectors.length > 0) {
        let mutationBuffer = [];
        let mutationTimeout = null;

        const processMutations = async () => {
            try {
                const nodesToProcess = mutationBuffer;
                mutationBuffer = [];
                mutationTimeout = null;

                if (config.criticalSelectors.length === 0) return;

                const joinedSelector = config.criticalSelectors.join(',');

                for (const node of nodesToProcess) {
                    if (
                        (node.matches && node.matches(joinedSelector)) ||
                        (node.querySelector && node.querySelector(joinedSelector))
                    ) {
                        for (const selector of config.criticalSelectors) {
                            if ((node.matches && node.matches(selector)) || (node.querySelector && node.querySelector(selector))) {
                                const eventId = await capture({
                                    event_type: 'UI_FAILURE',
                                    message: `Critical error UI rendered: ${selector}`,
                                    severity: 'warning',
                                    is_blocking: false
                                });
                                if (eventId) state.lastErrorEventId = eventId;
                            }
                        }
                    }
                }
            } catch (e) {
                if (config?.debug) console.warn('[Pulsar] processMutations failed', e);
            }
        };

        state.mutationObserver = new MutationObserver((mutations) => {
            try {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) mutationBuffer.push(node);
                        });
                    }
                }
                if (mutationBuffer.length > 0 && !mutationTimeout) {
                    mutationTimeout = setTimeout(processMutations, 100);
                }
            } catch (e) {
                if (config?.debug) console.warn('[Pulsar] MutationObserver callback failed', e);
            }
        });
        state.mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    // ── Click breadcrumbs ────────────────────────────────────────────────────
    state.interactionHandler = function (e) {
        try {
            if (!e.target || e.target === document) return;
            const tag = e.target.tagName ? e.target.tagName.toLowerCase() : 'unknown';
            const id = e.target.id ? `#${e.target.id}` : '';
            // PUL-037: className stripped to avoid capturing form-field identity (GDPR)

            globalScope.addBreadcrumb({
                category: 'ui.click',
                message: `${tag}${id}`,
                // We should also implement defensive performance check just in case,
                // although it was mentioned the original PR wrapped performance.now in network.js,
                // this also has it in errors.js.
                time_since_load_ms: typeof performance !== 'undefined' && typeof performance.now === 'function' ? Math.round(performance.now()) : 0
            });
        } catch (err) {
            if (config?.debug) console.warn('[Pulsar] interactionHandler failed', err);
        }
    };
    document.body.addEventListener('click', state.interactionHandler, true);

    } catch (e) {
        if (config?.debug) console.warn('[Pulsar] setupErrorHandlers failed completely', e);
    }
}
