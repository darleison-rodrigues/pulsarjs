import { describe, it, expect } from 'vitest';
import {
    classify,
    RulePayload,
    SLAS_AUTH_FAILURE,
    CSRF_MISMATCH,
    BOT_DETECTION_CHALLENGE,
    MRT_PROXY_TIMEOUT,
    STOREFRONT_FILE_IO_VIOLATION,
    PAYMENT_FAILURE,
    NETWORK_TIMEOUT
} from '../src/lib/rule-engine';

describe('Rule Engine (PUL-006)', () => {

    describe('Isolated Rule Testing', () => {
        it('SLAS_AUTH_FAILURE matches correctly', () => {
            const payload: RulePayload = {
                error_type: 'API_FAILURE',
                message: 'SLAS auth failed',
                status_code: 401,
                api_endpoint: '/shopper-auth/v1/token'
            };
            expect(SLAS_AUTH_FAILURE.match(payload)).toBe(true);
        });

        it('MRT_PROXY_TIMEOUT uses word boundaries for "mrt"', () => {
            const matchPayload: RulePayload = {
                error_type: 'API_FAILURE',
                message: 'error in mrt proxy',
                status_code: 504
            };
            const missPayload: RulePayload = {
                error_type: 'API_FAILURE',
                message: 'User clicked smart button',
                status_code: 500
            };
            expect(MRT_PROXY_TIMEOUT.match(matchPayload)).toBe(true);
            expect(MRT_PROXY_TIMEOUT.match(missPayload)).toBe(false);
        });

        it('STOREFRONT_FILE_IO_VIOLATION uses word boundaries for "file"', () => {
            const matchPayload: RulePayload = {
                error_type: 'RUNTIME_ERROR',
                message: 'SecurityError: restrict file write',
            };
            const missPayload: RulePayload = {
                error_type: 'RUNTIME_ERROR',
                message: 'User profile updated',
            };
            expect(STOREFRONT_FILE_IO_VIOLATION.match(matchPayload)).toBe(true);
            expect(STOREFRONT_FILE_IO_VIOLATION.match(missPayload)).toBe(false);
        });
    });

    describe('Priority Resolution (classify)', () => {
        it('resolves 403 collisions: SLAS > CSRF > BOT', () => {
            const csrfPayload: RulePayload = {
                error_type: 'API_FAILURE',
                message: 'csrf mismatch detected',
                status_code: 403
            };
            const botPayload: RulePayload = {
                error_type: 'API_FAILURE',
                message: 'request blocked by waf',
                status_code: 403
            };
            const botOnlyPayload: RulePayload = {
                error_type: 'API_FAILURE',
                message: 'access challenge presented',
                status_code: 403
            };

            expect(classify(csrfPayload).id).toBe('rule_csrf_mismatch');
            expect(classify(botPayload).id).toBe('rule_bot_detection');
            expect(classify(botOnlyPayload).id).toBe('rule_bot_detection');
        });

        it('resolves PAYMENT_FAILURE (10) over generic NETWORK_TIMEOUT (999)', () => {
            const payload: RulePayload = {
                error_type: 'API_FAILURE',
                message: 'Checkout payment failed',
                status_code: 500,
                api_endpoint: '/api/v1/orders'
            };
            const result = classify(payload);
            expect(result.id).toBe('rule_payment_failure');
            expect(result.pattern).toBe('PAYMENT_FAILURE');
        });

        it('uses NETWORK_TIMEOUT as absolute catch-all for 500+', () => {
            const payload: RulePayload = {
                error_type: 'API_FAILURE',
                message: 'Internal logic crash',
                status_code: 502
            };
            expect(classify(payload).id).toBe('rule_network_timeout');
        });

        it('returns UNKNOWN (heuristic) when no rules match', () => {
            const payload: RulePayload = {
                error_type: 'UI_ERROR',
                message: 'Component rendered incorrectly',
                status_code: 200
            };
            const result = classify(payload);
            expect(result.id).toBe('rule_unknown');
            expect(result.confidence).toBe('heuristic');
        });
    });

    describe('Confidence and Reasoning', () => {
        it('provides deterministic confidence for matches', () => {
            const payload: RulePayload = {
                error_type: 'API_FAILURE',
                message: 'rate limit exceeded',
                status_code: 429
            };
            expect(classify(payload).confidence).toBe('deterministic');
        });

        it('executes dynamic reasoning functions', () => {
            const payload: RulePayload = {
                error_type: 'API_FAILURE',
                message: 'Internal Error',
                status_code: 543
            };
            expect(classify(payload).reasoning).toContain('543');
        });
    });

});
