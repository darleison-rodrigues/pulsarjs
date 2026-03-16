/**
 * PulsarJS — Interaction Collectors
 * Scroll depth milestones and rage click detection.
 * These events feed ECKG edges: engagement depth, frustration signals.
 */

/**
 * Track scroll depth at milestone percentages.
 * Resets on SPA route change (via state._scrollMilestones).
 */
export function setupScrollObserver(state) {
    const milestones = state.config.scrollDepthMilestones;
    const reached = new Set();
    let ticking = false;

    const check = () => {
        ticking = false;
        const docEl = document.documentElement;
        const scrollTop = docEl.scrollTop || document.body.scrollTop;
        const scrollHeight = docEl.scrollHeight - docEl.clientHeight;

        if (scrollHeight <= 0) {
            // Page fits in viewport — user sees 100% immediately
            if (!reached.has(100)) {
                reached.add(100);
                emitScroll(state, 100);
            }
            return;
        }

        const percent = Math.round((scrollTop / scrollHeight) * 100);
        for (const m of milestones) {
            if (percent >= m && !reached.has(m)) {
                reached.add(m);
                emitScroll(state, m);
            }
        }
    };

    const onScroll = () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(check);
        }
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    // Expose for SPA reset (navigation.js clears this on route change)
    state._scrollHandler = onScroll;
    state._scrollMilestones = reached;

    // Check immediately in case content fits viewport
    setTimeout(check, 100);
}

function emitScroll(state, depth) {
    state.capture({
        event_type: 'SCROLL_DEPTH',
        message: `Scroll depth ${depth}%`,
        metadata: { depth },
        severity: 'info',
        is_blocking: false
    });
}

/**
 * Detect rapid repeated clicks on the same element.
 * ECKG signal: frustration → often precedes or follows an API_FAILURE.
 */
export function setupRageClickDetector(state) {
    const threshold = state.config.rageClickThreshold;
    const windowMs = state.config.rageClickWindow;
    let clicks = [];

    const handler = (e) => {
        if (!e.target || e.target === document) return;

        const now = Date.now();
        const selector = getSelector(e.target);

        clicks.push({ selector, time: now });
        clicks = clicks.filter(c => now - c.time < windowMs);

        const sameTarget = clicks.filter(c => c.selector === selector);
        if (sameTarget.length >= threshold) {
            state.capture({
                event_type: 'RAGE_CLICK',
                message: `Rage click: ${selector}`,
                metadata: {
                    selector,
                    click_count: sameTarget.length,
                    window_ms: windowMs
                },
                severity: 'warning',
                is_blocking: false
            });
            clicks = [];
        }
    };

    document.addEventListener('click', handler, true);
    state._rageClickHandler = handler;
}

/**
 * Build a minimal, PII-safe selector for an element.
 * Uses tag + id + first two classes only.
 */
function getSelector(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : 'unknown';
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
    return `${tag}${id}${cls}`;
}
