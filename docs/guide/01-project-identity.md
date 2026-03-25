# Project Identity

**PulsarJS** is a client-side JavaScript SDK for commerce storefronts (SFCC, Shopify, custom). It captures behavioral events — page views, commerce actions, scroll depth, rage clicks, API failures, Core Web Vitals — and ships them to an edge server that builds a **causal event stream** per session.

The SDK emits **events**. The server infers **causal edges** (preceded, caused, blocked_by, frustrated_by, abandoned_at) from session ordering. The value is in the causal chain, not the individual event.

The product competes in the space between "too expensive" (Noibu, Quantum Metric) and "not commerce-aware" (Sentry, Datadog). The differentiator is deep commerce context (platform providers for SFCC, Shopify, etc.), page type inference, and commerce action detection — combined with a lightweight, privacy-respecting footprint and causality-aware insights.

**Moat statement:**
> A zero-dependency JavaScript beacon that captures the full shopper journey across your commerce storefront — from campaign click to checkout — and builds causal event chains that connect behavioral telemetry to revenue impact. Without touching your Lighthouse score.
