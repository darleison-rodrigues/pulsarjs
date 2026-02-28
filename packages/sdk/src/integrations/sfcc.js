/**
 * PulsarJS — SFCC Integration
 * Context extraction: dwsid, dwac_*, page type inference, dw.ac, Evergage, BOOMR.
 */

/**
 * Get a cookie value by name.
 */
export function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

/**
 * Extract SFCC-specific context from the current page.
 */
export function extractSFCCContext(extractCampaigns) {
    const context = {
        dwsid: getCookie('dwsid') || null,
        visitorId: null,
        customerId: null,
        pageType: null
    };

    // Parse dwac_* cookies for visitor/customer IDs
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const c = cookies[i].trim();
        if (c.startsWith('dwac_')) {
            const parts = c.split('=');
            if (parts.length > 1) {
                const decoded = decodeURIComponent(parts[1]).trim();
                const vals = decoded.split('|');
                if (vals.length >= 3) {
                    context.visitorId = vals[0] !== '__ANNONYMOUS__' ? vals[0] : null;
                    context.customerId = vals[2] !== '__ANNONYMOUS__' ? vals[2] : null;
                }
            }
            break;
        }
    }

    // Page type inference from URL path
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/checkout')) context.pageType = 'Checkout';
    else if (path.includes('/cart')) context.pageType = 'Cart';
    else if (path.includes('/p/')) context.pageType = 'PDP';
    else if (path.includes('/d/')) context.pageType = 'PLP';
    else if (path.includes('/search')) context.pageType = 'Search';
    else if (path === '/' || path === '') context.pageType = 'Home';

    // dw.ac category context
    if (typeof window.dw !== 'undefined' && window.dw.ac && window.dw.ac._category) {
        context.category = window.dw.ac._category;
    }

    // Third-party detection
    if (typeof window.Evergage !== 'undefined' && window.Evergage.getCurrentArticle) {
        context.evergageActive = true;
    }
    if (typeof window.BOOMR !== 'undefined' && window.BOOMR.session) {
        context.boomrSession = window.BOOMR.session.id;
    }

    // UTM campaign data
    if (typeof extractCampaigns === 'function') {
        const campaign = extractCampaigns();
        if (campaign) context.campaign = campaign;
    }

    return context;
}
