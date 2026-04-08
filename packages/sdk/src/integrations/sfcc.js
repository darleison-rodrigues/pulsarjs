/**
 * PulsarJS — SFCC Integration (backward compatibility shim)
 * The SFCC provider has moved to providers/sfcc.js.
 * This module re-exports for backward compatibility.
 */
import { SFCCProvider, getCookie } from '../providers/sfcc.js';
import { inferPageType } from '../collectors/navigation.js';

export { SFCCProvider, getCookie };

/**
 * @deprecated Use SFCCProvider.extractContext() via the provider system instead.
 * Kept for backward compatibility with code that imports extractPlatformContext directly.
 */
export function extractPlatformContext(extractCampaigns, pageTypes) {
    try {
        const context = SFCCProvider.extractContext();

        // Legacy behavior: inferPageType was called inside extractPlatformContext
        // PUL-027: Fallback to provider defaults if pageTypes missing
        const pageInfo = inferPageType(
            window.location.pathname,
            pageTypes || SFCCProvider.pageTypes || []
        );
        context.pageType = pageInfo.type !== 'Other' ? pageInfo.type : null;

        // Legacy behavior: campaign extraction was coupled to platform context
        if (typeof extractCampaigns === 'function') {
            const campaign = extractCampaigns();
            if (campaign) context.campaign = campaign;
        }

        return context;
    } catch (e) {
        // Defensive coding: never crash host page
        // eslint-disable-next-line no-console
        if (typeof window !== 'undefined' && window.Pulsar?.config?.debug) {
            console.warn('[Pulsar] extractPlatformContext failed', e);
        }
        return {};
    }
}
