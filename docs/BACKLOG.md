# PulsarJS Product Backlog

> **Scope**: Core Deterministic Pipeline (Phase 1 MVP)
> **Prefix**: `PUL-XXX`
> **Branch Convention**: `feature/pul-XXX-short-description`

---

### [PUL-002] Local PWAKit Integration Testing
**Status**: 🔴 Open
**Branch**: `feature/pul-002-pwakit-integration`
**Severity**: High — Required for system validation.

**The Goal**: Integrate `pulsar.js` into a local PWAKit storefront. Simulate SFCC basket errors, SCAPI timeouts, and JS crashes. Verify: Ingestion API catches errors → Rule Engine classifies → alert fires.

---

### [PUL-040] Shopify Platform Provider
**Status**: 🔴 Open
**Severity**: Medium — expands addressable market beyond SFCC.
**Depends on**: PUL-031

**The Goal**: Implement a Shopify platform provider (`providers/shopify.js`) that extracts Shopify-specific context (Storefront API, Checkout Extensions), defines Shopify commerce action patterns, and registers Shopify PII patterns.

---

### [PUL-041] Agentforce Commerce Provider
**Status**: 🔴 Open
**Severity**: Medium — enables Agent Ops telemetry for AI agent orchestration.
**Depends on**: PUL-031

**The Goal**: Implement an Agentforce Commerce provider for AI agent orchestration telemetry — tool-call tracing, agent step tracking, and commerce intent resolution.

---

### [PUL-042] Commerce Intent Edge Hints
**Status**: 🔴 Open
**Severity**: Medium — extends causal stream from failure/frustration coverage to success/intent coverage.
**Depends on**: PUL-028

**The Goal**: Expand the SDK's edge hint vocabulary beyond failure signals to capture purchase intent, search behavior, and checkout micro-journey causality. The current 8 edge hints cover the incident story; this adds the revenue optimization story.

**New Edge Hints (SDK-observable)**:

| edge_hint | From → To | Detection |
|---|---|---|
| `compared_with` | PAGE_VIEW(PDP) → PAGE_VIEW(PDP) | Sequential PDP views, different products |
| `refined_search` | PAGE_VIEW(Search) → PAGE_VIEW(Search) | Sequential search pages (query refinement) |
| `search_converted` | PAGE_VIEW(Search) → COMMERCE_ACTION | Search → PDP → cart_add chain |

**Future Edge Hints (need provider hooks or `beforeSend`)**:

| edge_hint | Signal | Why deferred |
|---|---|---|
| `coupon_applied` | Promo code entry → checkout | Needs DOM inspection or merchant hook |
| `payment_failed` | Payment rejection vs server error | Needs response body parsing or merchant hook |
| `out_of_stock_hit` | PDP with disabled cart button | Needs DOM inspection |
| `address_abandoned` | Form interaction → tab hide at checkout | Needs form field instrumentation |

**Design**: SDK-observable hints ship first. Merchant-dependent hints expose via a `commerceHooks` provider API where the merchant tells the SDK what happened (e.g. `Pulsar.hint('payment_failed', { reason: 'card_declined' })`).

**Academic Foundation**:

| Area | Key Reference | Relevance |
|---|---|---|
| Process Mining | van der Aalst, "Process Mining: Data Science in Action" (Springer, 2016) | Event log → process model discovery. Our edge inference is process discovery. |
| Customer Journey Mining | Bernard & Andritsos, "A Process Mining Based Model for Customer Journey Mapping" (CAiSE Workshop, 2017) | Sequential touchpoints → journey process models. Direct analog to our funnel edges. |
| Complex Event Processing | Luckham, "The Power of Events" (Addison-Wesley, 2002) | Event patterns, causal vectors, event hierarchies. Our `edge_hint` is a simplified CEP pattern language. |
| Causal Attribution | Bottou et al., "Counterfactual Reasoning and Learning Systems" (JMLR, 2013) | Causal inference in ad click → conversion. Formalizes our campaign → checkout chain. |
| Session-based Rec | Hidasi et al., "Session-based Recommendations with RNNs" (ICLR, 2016) | Sequential session events for intent prediction. Our PDP sequences are input features. |
| Multi-Touch Attribution | Shao & Li, "Data-Driven Multi-Touch Attribution Models" (KDD, 2011) | Beyond last-click to causal multi-touch. Our campaign → commerce is this problem. |
| Data Provenance | Buneman et al., "Why and Where: A Characterization of Data Provenance" (ICDT, 2001) | Why-provenance — tracing outputs to inputs. Our `caused_by` is literal why-provenance. |
| Click Models | Chuklin et al., "Click Models for Web Search" (Springer, 2015) | User click sequences as probabilistic models. Formalizes `refined_search` and `search_to_purchase`. |

**Acceptance Criteria**:
- `compared_with`, `refined_search`, `search_converted` emitted with correct `caused_by` references
- No false positives: `compared_with` only fires for PDP → PDP with different `product_ref`
- Existing edge hints unchanged
- `commerceHooks` provider API spec written (implementation in separate ticket)

---