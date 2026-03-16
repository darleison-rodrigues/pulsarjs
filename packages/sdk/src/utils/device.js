/**
 * PulsarJS — Device Cohort & Hints
 * Computes a deterministic device fingerprint from cross-browser signals
 * and collects optional Chromium-only hints.
 *
 * PUL-026: computed once at init(), not per event.
 */
import { hash } from '../core/capture.js';

/**
 * Extract WebGL unmasked renderer string.
 * Returns 'none' if WebGL or the debug extension is unavailable.
 * Cleans up the canvas element after use.
 *
 * @returns {string}
 */
function getWebGLRenderer() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return 'none';

        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'none';

        // Cleanup: lose the WebGL context to free GPU resources
        const loseCtx = gl.getExtension('WEBGL_lose_context');
        if (loseCtx) loseCtx.loseContext();

        return renderer || 'none';
    } catch {
        return 'none';
    }
}

/**
 * Compute deterministic device cohort hash from cross-browser signals.
 *
 * Inputs (all cross-browser stable):
 *   - screen dimensions (width x height)
 *   - hardware concurrency (CPU cores)
 *   - IANA timezone
 *   - WebGL unmasked renderer
 *
 * @returns {string} base-36 hash string
 */
export function computeDeviceCohort() {
    const screen = window.screen
        ? `${window.screen.width}x${window.screen.height}`
        : 'unknown';
    const cores = navigator.hardwareConcurrency || 0;
    const timezone = typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : 'unknown';
    const renderer = getWebGLRenderer();

    return hash(`${screen}|${cores}|${timezone}|${renderer}`);
}

/**
 * Collect Chromium-only device hints.
 * Returns null (not {}) when no Chromium signals are available.
 *
 * These fields are NEVER included in the cohort hash.
 *
 * @returns {{ device_memory: number, ua_platform: string, ua_mobile: boolean } | null}
 */
export function collectDeviceHints() {
    const memory = navigator.deviceMemory;
    const uaData = navigator.userAgentData;

    if (memory === undefined && !uaData) return null;

    return {
        device_memory: memory ?? null,
        ua_platform: uaData?.platform ?? null,
        ua_mobile: uaData?.mobile ?? null
    };
}

/**
 * Build the full device object for the event payload.
 * Called once at init() — the result is stored on state and reused per event.
 *
 * @returns {{ device_type: string, device_cohort: string, hints: object|null }}
 */
export function buildDeviceInfo() {
    return {
        device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        device_cohort: computeDeviceCohort(),
        hints: collectDeviceHints()
    };
}
