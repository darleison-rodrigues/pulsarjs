# [PUL-042] Commerce Intent Edge Hints

**Status**: 🔴 Open — Revised after causal framework review
**Severity**: Medium — extends the event stream from failure/frustration to success/intent state transitions.
**Depends on**: PUL-028 (done), PUL-001 (for `purchase` event via dataLayer)

**Goal**: Expand the SDK's edge hint vocabulary beyond failure signals to capture purchase intent, search behavior, and browsing state transitions. These are **observed state transitions**, not causal attribution claims. The distinction matters — see "Causal Framework Alignment" below.

---

## Causal Framework Alignment

Per "Attribution is a Causal Problem" (Filho, 2026) and the underlying Google research (Kelly, Vaver, Koehler 2017; Sapp, Vaver 2017), PulsarJS must distinguish three layers:

1. **State transition facts (SDK scope — this ticket).** The SDK observes that event A happened, then event B happened. These are Markov state transitions in the session, not causal claims. The edge hints in this ticket are all state transitions: "the user viewed PDP X, then viewed PDP Y" is a fact. Whether PDP X *caused* the user to view PDP Y is a causal question the SDK cannot answer.

2. **Intent scoring (Server — TenantAgent scope).** The TenantAgent assigns an `intent_state` and `intent_score` to each node in the session graph using a six-state absorbing Markov chain. The edge hints from this ticket provide the state transitions the model consumes. See `docs/SERVER.md`.

3. **Causal attribution (Server — QueryAgent scope).** Counterfactual credit assignment uses UDDA-style upstream matching. This is a query pattern, not a graph edge. Out of scope for the SDK.

**Naming convention:** Edge hints must describe the **observed transition**, not imply causation. `search_converted` → renamed to `search_to_cart` (the word "converted" implies causal credit assignment).

---

## Six-State Intent Model (Server Reference)

The edge hints in this ticket map to Markov state transitions consumed by the TenantAgent:

| State | Intent Score Range | SDK Event |
|---|---|---|
| S₀ Entry | 0.0–0.1 | PAGE_VIEW(Home), first PAGE_VIEW |
| S₁ Exploration | 0.1–0.4 | PAGE_VIEW(PLP), PAGE_VIEW(Search) |
| S₂ Consideration | 0.4–0.65 | PAGE_VIEW(PDP) |
| S₃ Intent | 0.65–0.85 | COMMERCE_ACTION(cart_add) |
| S₄ High Intent | 0.85–0.97 | COMMERCE_ACTION(checkout) |
| S₅ Conversion | 1.0 | dataLayer `purchase` event (PUL-001) |

Edge hints enrich these transitions with behavioral context: `compared_with` means S₂→S₂ with different products, `refined_search` means S₁→S₁ with modified query.

---

## New Edge Hints (SDK-observable state transitions)

| edge_hint | From → To | State Transition | Detection |
|---|---|---|---|
| `compared_with` | PAGE_VIEW(PDP) → PAGE_VIEW(PDP) | S₂ → S₂ (different product) | Sequential PDP views, different `product_ref` |
| `refined_search` | PAGE_VIEW(Search) → PAGE_VIEW(Search) | S₁ → S₁ (modified query) | Sequential search pages |
| `search_to_cart` | PAGE_VIEW(Search) → COMMERCE_ACTION(cart_add) | S₁ → S₃ (search intent realized) | Search → PDP → cart_add chain within session |

**Renamed:** `search_converted` → `search_to_cart`. The original name implied causal credit assignment ("the search converted"). The new name describes the observed state transition ("the user went from search to cart"). Whether the search *caused* the cart add is a causal attribution question answered server-side.

## Future Edge Hints (need provider hooks or `beforeSend`)

| edge_hint | Signal | Why deferred |
|---|---|---|
| `coupon_applied` | Promo code entry → checkout | Needs DOM inspection or merchant hook |
| `payment_failed` | Payment rejection vs server error | Needs response body parsing or merchant hook |
| `out_of_stock_hit` | PDP with disabled cart button | Needs DOM inspection |
| `address_abandoned` | Form interaction → tab hide at checkout | Needs form field instrumentation |

**Design**: SDK-observable hints ship first. Merchant-dependent hints expose via a `commerceHooks` provider API where the merchant tells the SDK what happened (e.g. `Pulsar.hint('payment_failed', { reason: 'card_declined' })`).

---

## Existing Edge Hints — Reframing

The current edge hints are also state transition facts, not causal claims. For consistency, the server documentation (not the SDK code) should use precise language:

| Current edge_hint | What it observes | What it does NOT claim |
|---|---|---|
| `blocked_by` | Error followed commerce action within 2s | That the error *caused* revenue loss (inferred in session summary as `revenue_impact`) |
| `frustrated_by` | Rage click followed error | That the error *caused* the frustration (plausible but not proven) |
| `abandoned_at` | Tab hidden after cart, no subsequent checkout | That the user *intended* to buy (intent scoring is server-side) |
| `caused` | CAMPAIGN_ENTRY preceded first PAGE_VIEW | That the campaign *caused* the visit (causal attribution requires counterfactual — see UDDA) |
| `degraded_by` | High latency on commerce endpoint | That latency *caused* poor UX (correlation, not causation) |

**No SDK code changes for existing hints.** The reframing is documentation-level — it clarifies what the data means for downstream consumers (TenantAgent, QueryAgent, merchant analytics).

---

## Academic Foundation

| Area | Key Reference | Relevance |
|---|---|---|
| Causal Attribution | Kelly, Vaver, Koehler, "A Causal Framework for Digital Attribution" (2017) | Defines why edges are state transitions, not causal credit. Rubin causal model for counterfactual attribution. |
| UDDA Methodology | Sapp, Vaver, "Toward Improving Digital Attribution Model Accuracy" (2017) | Upstream-only matching for causal inference. Server-side QueryAgent concern, not SDK. |
| Commerce Attribution | Filho, "Attribution is a Causal Problem" (2026) | Six-state Markov model for storefront intent. Edge hints are state transition inputs to this model. |
| Process Mining | van der Aalst, "Process Mining: Data Science in Action" (2016) | Event log → process model discovery. Our edge inference is process discovery. |
| Customer Journey Mining | Bernard & Andritsos, "A Process Mining Based Model for Customer Journey Mapping" (2017) | Sequential touchpoints → journey process models. Direct analog to our funnel edges. |
| Complex Event Processing | Luckham, "The Power of Events" (2002) | Event patterns, causal vectors, event hierarchies. Our `edge_hint` is a simplified CEP pattern language. |
| Data Provenance | Buneman et al., "Why and Where: A Characterization of Data Provenance" (2001) | Why-provenance — tracing outputs to inputs. Our `caused_by` is literal why-provenance. |
| Click Models | Chuklin et al., "Click Models for Web Search" (2015) | User click sequences as probabilistic models. Formalizes `refined_search` and `search_to_cart`. |

---

## Acceptance Criteria

- `compared_with`, `refined_search`, `search_to_cart` emitted with correct `caused_by` references
- No false positives: `compared_with` only fires for PDP → PDP with different `product_ref`
- Existing edge hints unchanged (reframing is documentation only)
- `commerceHooks` provider API spec written (implementation in separate ticket)
- Tests verify edge hints are labeled as state transitions in payload, not causal claims

---
