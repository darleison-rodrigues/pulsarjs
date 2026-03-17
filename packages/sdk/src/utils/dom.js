/**
 * PulsarJS — DOM Utilities
 * Helper functions for DOM manipulation and script injection.
 */

/**
 * Dynamically inject a script element into the document.
 * Applies the CSP nonce from the SDK configuration if available.
 *
 * @param {object} state - Shared SDK state
 * @param {string} src - Script source URL
 * @param {object} [attrs={}] - Optional attributes to apply to the script element
 * @returns {HTMLScriptElement} The created script element
 */
export function injectScript(state, src, attrs = {}) {
    // Basic security validation to prevent DOM-based XSS
    // Only allow absolute HTTPS URLs or relative paths (which will resolve to https if the page is https)
    let parsedUrl;
    try {
        parsedUrl = new URL(src, 'https://localhost');
    } catch (_e) {
        throw new Error(`Invalid script source: ${src}`);
    }

    if (parsedUrl.protocol !== 'https:') {
        throw new Error(`Insecure script source protocol: ${parsedUrl.protocol}`);
    }

    const script = document.createElement('script');
    script.src = src;

    // Apply CSP nonce if provided in config
    if (state.config && state.config.nonce) {
        script.setAttribute('nonce', state.config.nonce);
        // Also set the property directly as some browsers prefer it
        script.nonce = state.config.nonce;
    }

    // Apply additional attributes
    Object.keys(attrs).forEach(key => {
        script.setAttribute(key, attrs[key]);
    });

    // Default to async if not specified
    if (!script.hasAttribute('async')) {
        script.async = true;
    }

    (document.head || document.documentElement).appendChild(script);
    return script;
}
