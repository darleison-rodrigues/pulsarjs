/**
 * PulsarJS — Configuration
 * Default config schema and validation.
 */

export const DEFAULT_CONFIG = {
    clientId: null,
    endpoint: 'https://api.pulsarjs.com/v1/ingest',
    siteId: 'unknown',
    storefrontType: 'PWA_KIT',
    enabled: true,
    sampleRate: 1.0,
    endpointFilter: /\/baskets\/|\/orders\/|\/products\/|\/shopper\//i,
    criticalSelectors: ['.error-message', '.alert-danger', '.checkout-error', '.toast-error'],
    beforeSend: null,
    beforeSendTimeout: 2000,
    allowUnconfirmedConsent: false,
    nonce: null,
    secret: null,
    maxBreadcrumbs: 100,
    slowApiThreshold: 1000,
    debug: false
};

/**
 * Validate the merged config. Returns array of error strings (empty = valid).
 */
export function validateConfig(config) {
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
