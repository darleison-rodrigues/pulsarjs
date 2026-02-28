/**
 * PulsarJS — Session
 * Ephemeral session ID generation. crypto.randomUUID() only, no Math.random().
 */

export function generateSessionID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    console.warn('[Pulsar] Secure crypto unavailable for Session ID');
    return '00000000-0000-4000-0000-000000000000';
}
