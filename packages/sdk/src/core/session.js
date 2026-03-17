/**
 * PulsarJS — Session
 * Ephemeral session ID generation. crypto.randomUUID() only, no Math.random().
 */

export const SESSION_KEY = '_pulsar_session_state';

export function getPersistedSession() {
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            const data = window.sessionStorage.getItem(SESSION_KEY);
            if (data) return JSON.parse(data);
        }
    } catch (_e) {
        // ignore
    }
    return null;
}

export function persistSession(state) {
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            const data = {
                sessionID: state.sessionID,
                sessionStartedAt: state.sessionStartedAt,
                lastErrorEventId: state.lastErrorEventId,
                lastCommerceEventId: state.lastCommerceEventId,
                lastCommerceAction: state.lastCommerceAction,
                lastFailedCommerceAction: state.lastFailedCommerceAction,
                firstPageViewEventId: state.firstPageViewEventId,
                entryPageType: state.entryPageType,
                entryReferrerType: state.entryReferrerType,
                entryCampaignSource: state.entryCampaignSource,
                pageCount: state.pageCount,
                _droppedEventsCount: state._droppedEventsCount
            };
            window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
        }
    } catch (_e) {
        // ignore
    }
}

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
    // eslint-disable-next-line no-console
    console.warn('[Pulsar] Secure crypto unavailable for Session ID');
    return null;
}
