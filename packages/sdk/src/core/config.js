/**
 * PulsarJS — Configuration
 * Default config schema and validation.
 *
 * Commerce-specific defaults (commerceActions, pageTypes, endpointFilter) are
 * supplied by the platform provider — see providers/provider.js.
 */

export const DEFAULT_CONFIG = {
    clientId: null,
    endpoint: 'https://api.pulsarjs.com/v1/ingest',
    siteId: 'unknown',
    storefrontType: 'PWA_KIT',
    platform: 'sfcc',
    enabled: true,
    sampleRate: 1.0,
    criticalSelectors: ['.error-message', '.alert-danger', '.checkout-error', '.toast-error'],
    beforeSend: null,
    beforeSendTimeout: 2000,
    allowUnconfirmedConsent: false,
    nonce: null,
    maxBreadcrumbs: 100,
    slowApiThreshold: 1000,
    rageClickThreshold: 3,
    rageClickWindow: 1000,
    scrollDepthMilestones: [25, 50, 75, 100],

    // These can be set by the user to override provider defaults.
    // If not set, they are populated from the resolved provider in index.js init().
    // commerceActions: undefined,
    // pageTypes: undefined,
    // endpointFilter: undefined,

    debug: false
};

/**
 * Validate the merged config. Returns array of error strings (empty = valid).
 */
export function validateConfig(config) {
    const errors = [];
    const { clientId, endpoint, sampleRate, endpointFilter, platform } = config;

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
    if (config.nonce !== null && typeof config.nonce !== 'string') {
        errors.push('nonce must be a string.');
    }
    if (platform !== undefined && typeof platform !== 'string' && (typeof platform !== 'object' || !platform.name)) {
        errors.push('platform must be a string or an object with a name property.');
    }
    return errors;
}
