/**
 * Deterministic rule engine for anomaly classification.
 * Robust, prioritized, and unit-testable.
 */

export type Severity = 'critical' | 'high' | 'warning' | 'low' | 'info';

export interface Classification {
    id: string;
    pattern: string;
    severity: Severity;
    confidence: 'deterministic' | 'heuristic';
    reasoning: string;
}

export interface RulePayload {
    error_type: string;
    message: string;
    status_code?: number | null;
    api_endpoint?: string | null;
    storefront_type?: string | null;
}

/**
 * Helper to check if a word exists in a string with word boundaries (\b).
 * Prevents "blocked" matching "unblocked" or "smart" matching "smartphone".
 */
function hasWord(text: string, word: string): boolean {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(text);
}

export interface Rule {
    id: string;
    priority: number;
    severity: Severity;
    reasoning: string | ((p: RulePayload) => string);
    match: (p: RulePayload) => boolean;
}

/**
 * FULL RULE CATALOG (SK-102)
 */

export const PAYMENT_FAILURE: Rule = {
    id: 'rule_payment_failure',
    priority: 10,
    severity: 'critical',
    reasoning: (p) => `Payment/checkout API failure (${p.status_code}). Likely a 3rd-party cartridge or network issue.`,
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        const endpoint = (p.api_endpoint || '').toLowerCase();
        return (hasWord(msg, 'payment') || hasWord(msg, 'checkout') || endpoint.includes('orders')) &&
            p.error_type === 'API_FAILURE' && (p.status_code || 0) >= 400;
    }
};

export const SCAPI_RATE_LIMIT: Rule = {
    id: 'rule_scapi_rate_limit',
    priority: 20,
    severity: 'critical',
    reasoning: 'HTTP 429 or explicit rate limit message detected. Check SCAPI volume or HTTPClient limits.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return p.status_code === 429 || hasWord(msg, 'rate') || hasWord(msg, 'limit') || msg.includes('too many requests');
    }
};

export const SLAS_AUTH_FAILURE: Rule = {
    id: 'rule_slas_auth_failure',
    priority: 30,
    severity: 'critical',
    reasoning: 'SLAS authentication failure. Check if client is generating a token per request instead of caching.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        const endpoint = (p.api_endpoint || '').toLowerCase();
        return p.status_code === 401 && (endpoint.includes('shopper') || hasWord(msg, 'slas') || hasWord(msg, 'auth'));
    }
};

export const SLAS_TOKEN_EXPIRED: Rule = {
    id: 'rule_slas_token_expired',
    priority: 31,
    severity: 'info',
    reasoning: 'SLAS token expired. SDK should auto-refresh, but high volume indicates refresh flow failure.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return hasWord(msg, 'slas') && (hasWord(msg, 'expired') || hasWord(msg, 'invalid_token'));
    }
};

export const CSRF_MISMATCH: Rule = {
    id: 'rule_csrf_mismatch',
    priority: 40,
    severity: 'warning',
    reasoning: 'CSRF token mismatch or missing. Often happens after session timeout or cross-tab navigation.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return hasWord(msg, 'csrf') && (hasWord(msg, 'mismatch') || hasWord(msg, 'missing') || p.status_code === 403);
    }
};

export const BOT_DETECTION_CHALLENGE: Rule = {
    id: 'rule_bot_detection',
    priority: 45,
    severity: 'warning',
    reasoning: 'Request blocked by WAF or Bot detection. User may be seeing a challenge page.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return p.status_code === 403 && (hasWord(msg, 'blocked') || hasWord(msg, 'challenge') || hasWord(msg, 'waf'));
    }
};

export const CUSTOM_OBJECT_QUOTA: Rule = {
    id: 'rule_custom_object_quota',
    priority: 50,
    severity: 'critical',
    reasoning: 'Custom object quota violation or per-page limit exceeded.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return msg.includes('custom.object') && (hasWord(msg, 'quota') || hasWord(msg, 'exceeded'));
    }
};

export const SCRIPT_TIMEOUT: Rule = {
    id: 'rule_script_timeout',
    priority: 60,
    severity: 'high',
    reasoning: 'Controller/Pipeline or OCAPI hook execution timeout.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return hasWord(msg, 'timeout') && (hasWord(msg, 'script') || hasWord(msg, 'execution') || msg.includes('scriptexecutiontimeout'));
    }
};

export const MRT_PROXY_TIMEOUT: Rule = {
    id: 'rule_mrt_timeout',
    priority: 70,
    severity: 'high',
    reasoning: 'Managed Runtime proxy timeout or 504 Gateway Timeout.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return p.status_code === 504 || hasWord(msg, 'mrt') || (hasWord(msg, 'gateway') && hasWord(msg, 'timeout'));
    }
};

export const OCAPI_CONFIG_ERROR: Rule = {
    id: 'rule_ocapi_config',
    priority: 80,
    severity: 'critical',
    reasoning: 'OCAPI configuration error. Check Business Manager settings.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return hasWord(msg, 'ocapi') && (hasWord(msg, 'forbidden') || hasWord(msg, 'configuration'));
    }
};

export const SESSION_SIZE_LIMIT: Rule = {
    id: 'rule_session_size',
    priority: 90,
    severity: 'warning',
    reasoning: 'Session size exceeds the 10KB SFCC limit.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return hasWord(msg, 'session') && (hasWord(msg, 'size') || hasWord(msg, 'limit') || hasWord(msg, 'exceeded'));
    }
};

export const HTTPCLIENT_LIMIT: Rule = {
    id: 'rule_httpclient_limit',
    priority: 95,
    severity: 'high',
    reasoning: 'HTTPClient limit reached. Optimize outbound integrations.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return hasWord(msg, 'httpclient') || (hasWord(msg, 'connection') && hasWord(msg, 'limit'));
    }
};

export const STOREFRONT_FILE_IO_VIOLATION: Rule = {
    id: 'rule_file_io_violation',
    priority: 100,
    severity: 'warning',
    reasoning: 'Forbidden File I/O in storefront. Move to B2C Jobs.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return (msg.includes('securityerror') || hasWord(msg, 'restricted')) && hasWord(msg, 'file');
    }
};

export const BASKET_ITEM_LIMIT: Rule = {
    id: 'rule_basket_item_limit',
    priority: 110,
    severity: 'high',
    reasoning: 'Basket exceeds safe limits. Potential bot stuffing or heavy B2B cart.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return hasWord(msg, 'basket') && (hasWord(msg, 'limit') || hasWord(msg, 'exceeded') || hasWord(msg, 'item'));
    }
};

export const PROMOTION_LIMIT: Rule = {
    id: 'rule_promotion_limit',
    priority: 120,
    severity: 'warning',
    reasoning: 'Promotion limit exceeded. Deactivate old promotions.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return hasWord(msg, 'promotion') && (hasWord(msg, 'limit') || hasWord(msg, 'exceeded'));
    }
};

export const ISML_PAGE_SIZE_LIMIT: Rule = {
    id: 'rule_isml_page_size',
    priority: 130,
    severity: 'high',
    reasoning: 'Compiled ISML page approaches 10MB limit.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return hasWord(msg, 'isml') && (hasWord(msg, 'page') || hasWord(msg, 'size') || hasWord(msg, 'limit'));
    }
};

export const PREFERENCE_QUOTA_VIOLATION: Rule = {
    id: 'rule_preference_quota',
    priority: 140,
    severity: 'high',
    reasoning: 'Preference service quota violation. Too many SitePreference lookups.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return hasWord(msg, 'sitepreference') && hasWord(msg, 'quota');
    }
};

export const HYDRATION_MISMATCH: Rule = {
    id: 'rule_hydration_mismatch',
    priority: 150,
    severity: 'warning',
    reasoning: 'React hydration mismatch detected.',
    match: (p) => {
        const msg = (p.message || '').toLowerCase();
        return hasWord(msg, 'hydration') || hasWord(msg, 'mismatch');
    }
};

export const NETWORK_TIMEOUT: Rule = {
    id: 'rule_network_timeout',
    priority: 999,
    severity: 'high',
    reasoning: (p) => `Generic server error ${p.status_code} on commerce API.`,
    match: (p) => p.error_type === 'API_FAILURE' && (p.status_code || 0) >= 500
};

/**
 * REGISTRY - AUTO-SORTED BY PRIORITY
 */
const RULES: Rule[] = [
    PAYMENT_FAILURE,
    SCAPI_RATE_LIMIT,
    SLAS_AUTH_FAILURE,
    SLAS_TOKEN_EXPIRED,
    CSRF_MISMATCH,
    BOT_DETECTION_CHALLENGE,
    CUSTOM_OBJECT_QUOTA,
    SCRIPT_TIMEOUT,
    MRT_PROXY_TIMEOUT,
    OCAPI_CONFIG_ERROR,
    SESSION_SIZE_LIMIT,
    HTTPCLIENT_LIMIT,
    STOREFRONT_FILE_IO_VIOLATION,
    BASKET_ITEM_LIMIT,
    PROMOTION_LIMIT,
    ISML_PAGE_SIZE_LIMIT,
    PREFERENCE_QUOTA_VIOLATION,
    HYDRATION_MISMATCH,
    NETWORK_TIMEOUT
].sort((a, b) => a.priority - b.priority);

export function classify(payload: RulePayload): Classification {
    for (const rule of RULES) {
        if (rule.match(payload)) {
            const reasoning = typeof rule.reasoning === 'function'
                ? rule.reasoning(payload)
                : rule.reasoning;

            return {
                id: rule.id,
                pattern: rule.id.replace('rule_', '').toUpperCase(),
                severity: rule.severity,
                confidence: 'deterministic',
                reasoning,
            };
        }
    }

    return {
        id: 'rule_unknown',
        pattern: 'UNKNOWN',
        severity: 'low',
        confidence: 'heuristic',
        reasoning: 'No deterministic rule matched from the Threat Catalog.',
    };
}
