/**
 * PulsarJS — Error Collectors
 * Global error handlers: onerror, unhandledrejection, MutationObserver.
 */

/**
 * Set up global error handlers. Returns cleanup references on the state object.
 */
export function setupErrorHandlers(state) {
    const { config, capture, globalScope } = state;

    // Preserve originals for teardown
    state.originalOnerror = window.onerror;
    state.originalOnunhandledrejection = window.onunhandledrejection;

    window.onerror = function (msg, url, line, col, error) {
        capture({
            event_type: "JS_CRASH",
            message: msg,
            url: window.location.href,
            response_snippet: error ? error.stack : `${url}:${line}:${col}`,
            severity: "error",
            is_blocking: true
        });
        if (state.originalOnerror) state.originalOnerror.apply(this, arguments);
    };

    window.onunhandledrejection = function (event) {
        capture({
            event_type: "JS_CRASH",
            message: event.reason ? event.reason.toString() : 'Unhandled Promise Rejection',
            url: window.location.href,
            response_snippet: event.reason && event.reason.stack ? event.reason.stack : null,
            severity: "error",
            is_blocking: false
        });
        if (state.originalOnunhandledrejection) state.originalOnunhandledrejection.apply(this, arguments);
    };

    // MutationObserver: detect critical error UI rendering (debounced)
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
                        capture({
                            event_type: "UI_FAILURE",
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
                mutationTimeout = setTimeout(processMutations, 100);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Click breadcrumbs
    state.interactionHandler = function (e) {
        if (!e.target || e.target === document) return;
        const tag = e.target.tagName ? e.target.tagName.toLowerCase() : 'unknown';
        const id = e.target.id ? `#${e.target.id}` : '';
        let cls = '';
        if (typeof e.target.className === 'string' && e.target.className) {
            // Filter out potentially sensitive classes (long or containing numbers/dashes that look like IDs)
            cls = e.target.className
                .split(/\s+/)
                .filter(name => name.length > 0 && name.length < 32 && !/[0-9]/.test(name))
                .join('.');
            cls = cls ? `.${cls}` : '';
        }
        globalScope.addBreadcrumb({
            category: 'ui.click',
            message: `${tag}${id}${cls}`,
            time_since_load: typeof performance !== 'undefined' ? Math.floor(performance.now()) : 0
        });
    };
    document.body.addEventListener('click', state.interactionHandler, true);
}
