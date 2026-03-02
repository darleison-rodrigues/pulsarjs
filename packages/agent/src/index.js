/**
 * PulsarJS: The Actor (agent.js)
 * Responsible for active DOM interventions and real-time conversion triggers.
 */
(function () {
    'use strict';

    // 1. Context Sharing with the Observer (pulsar.js)
    const getContext = () => {
        if (typeof window.Pulsar?.getContext === 'function') {
            return window.Pulsar.getContext();
        }
        return { tags: {} };
    };

    /**
     * Pulsar Banner Component
     * Isolated via Shadow DOM to prevent style conflicts with merchant storefronts.
     */
    class PulsarBanner extends HTMLElement {
        static get observedAttributes() {
            return ['message', 'theme', 'deal-id'];
        }

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
        }

        connectedCallback() {
            this.render();
        }

        attributeChangedCallback() {
            this.render();
        }

        render() {
            const message = this.getAttribute('message') || 'Special Deal for You!';
            const theme = this.getAttribute('theme') || '#3B82F6';

            this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            width: 100%;
            position: fixed;
            top: 0;
            left: 0;
            z-index: 999999;
            animation: slideDown 0.4s ease-out;
          }
          .banner {
            background: ${theme};
            color: white;
            text-align: center;
            padding: 12px 24px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            justify-content: center;
            align-items: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          .close {
            margin-left: 16px;
            cursor: pointer;
            background: rgba(255,255,255,0.2);
            color: white;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 4px;
            padding: 4px 12px;
            font-size: 12px;
            transition: all 0.2s;
          }
          .close:hover { background: rgba(255,255,255,0.3); }
          @keyframes slideDown {
            from { transform: translateY(-100%); }
            to { transform: translateY(0); }
          }
        </style>
        <div class="banner">
          <span>${message}</span>
          <button class="close" id="close-btn">Dismiss</button>
        </div>
      `;

            this.shadowRoot.getElementById('close-btn').onclick = () => {
                this.remove();
                // Log dismissal back to Pulsar SDK if available
                if (window.Pulsar?.push) {
                    window.Pulsar.push({
                        type: 'agent_interaction',
                        action: 'banner_dismissed',
                        dealId: this.getAttribute('deal-id')
                    });
                }
            };
        }
    }

    // Register the custom element
    if (!customElements.get('pulsar-banner')) {
        customElements.define('pulsar-banner', PulsarBanner);
    }

    /**
     * The Actor Engine
     * Simple deterministic trigger system for the MVP.
     */
    const Actor = {
        injectBanner(options = {}) {
            const banner = document.createElement('pulsar-banner');
            if (options.message) banner.setAttribute('message', options.message);
            if (options.theme) banner.setAttribute('theme', options.theme);
            if (options.dealId) banner.setAttribute('deal-id', options.dealId);
            document.body.appendChild(banner);
        },

        /**
         * Evaluates deterministic rules based on current session context provided by the Observer.
         */
        evaluate() {
            const context = getContext();

            // Check if user came from an influencer UTM (case insensitive)
            const tags = context.tags || {};
            const utmSource = (tags['utm_source'] || '').toLowerCase();

            if (utmSource.includes('influencer')) {
                this.injectBanner({
                    message: '🌟 Influencer Exclusive: Use code PULSAR20 for 20% off!',
                    theme: 'linear-gradient(135deg, #6366F1, #A855F7)',
                    dealId: 'influencer-20'
                });
            }
        }
    };

    // Initialize once the DOM is ready
    if (document.readyState === 'complete') {
        Actor.evaluate();
    } else {
        window.addEventListener('load', () => Actor.evaluate());
    }

    // Export to global for manual triggers/debugging
    window.PulsarAgent = Actor;

})();
