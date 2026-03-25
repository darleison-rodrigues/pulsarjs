# Channel Taxonomy & Event Ontology

The causal event stream has two classification systems that work together: a **Channel Taxonomy** (how traffic is classified) and an **Event Ontology** (how events relate to each other). The SDK provides the raw signals; the server applies both.

### Why Both?

- **Taxonomy** answers: "What kind of thing is this?" — classification into a hierarchy.
- **Ontology** answers: "How does this thing relate to other things?" — edges, roles, and constraints.

A `CAMPAIGN_ENTRY` with `fbclid` is *classified* by the taxonomy as `paid_social / meta / instagram_ads`. But its *role* in the ontology is "session origin node that **caused** the first PAGE_VIEW." These are different questions — taxonomy is about the node's properties, ontology is about the node's relationships.

### Channel Taxonomy (Server-Side Classification)

The server maps raw SDK params to a 4-level hierarchy. This is a **taxonomy** — a tree of increasingly specific labels.

```
Channel (what budget line)
  └── Platform (which vendor)
       └── Product (which ad product)
            └── Intent (acquisition vs. retention vs. partnership)
```

**Resolution rules** (server applies in order):

| Detection | Channel | Platform | Product | Intent |
|---|---|---|---|---|
| `gclid` or `gbraid` or `wbraid` | `paid_search` | `google` | `google_ads` | `acquisition` |
| `msclkid` | `paid_search` | `microsoft` | `bing_ads` | `acquisition` |
| `fbclid` + `utm_source=facebook` | `paid_social` | `meta` | `facebook_ads` | `acquisition` |
| `fbclid` + `utm_source=instagram` | `paid_social` | `meta` | `instagram_ads` | `acquisition` |
| `fbclid` (no utm_source) | `paid_social` | `meta` | `meta_ads` | `acquisition` |
| `ttclid` | `paid_social` | `tiktok` | `tiktok_ads` | `acquisition` |
| `twclid` | `paid_social` | `x` | `x_ads` | `acquisition` |
| `li_fat_id` | `paid_social` | `linkedin` | `linkedin_ads` | `acquisition` |
| `pin_unauth` | `paid_social` | `pinterest` | `pinterest_ads` | `acquisition` |
| `sccid` | `paid_social` | `snapchat` | `snapchat_ads` | `acquisition` |
| `dclid` | `paid_display` | `google` | `dv360` | `awareness` |
| `irclickid` | `affiliate` | `impact_radius` | — | `partnership` |
| `aff_id` or `clickid` | `affiliate` | `unknown` | — | `partnership` |
| `utm_medium=email` | `email` | `utm_source` value | `email_marketing` | `retention` |
| `utm_medium=social` (no click ID) | `organic_social` | `utm_source` value | — | `organic` |
| referrer = search engine | `organic_search` | referrer hostname | — | `organic` |
| no params, no referrer | `direct` | — | — | `brand_recall` |

**Precedence**: Click IDs take priority over UTM tags. If `fbclid` is present, the channel is `paid_social` regardless of what `utm_medium` says — because click IDs are machine-generated and UTM tags are human-maintained (and often wrong).

**SDK responsibility**: Capture all raw params. Never classify.
**Server responsibility**: Apply taxonomy rules. Store resolved channel on the session. Propagate to all events in that session for aggregation.

### Event Ontology (Causal Stream Structure)

The ontology defines **what types of nodes exist**, **what edges connect them**, and **what constraints govern those relationships**. This is the formal structure of the causal event stream.

#### Node Types (Event Classes)

Events are organized into an ontology of classes, not just a flat list:

```
Event (abstract root)
├── NavigationEvent
│   ├── PAGE_VIEW        — has: page_type, referrer_type, from_page_type
│   ├── CAMPAIGN_ENTRY   — has: channel taxonomy, click_ids. Constraint: max 1 per session.
│   └── TAB_VISIBILITY   — has: visibility state. Signals engagement gap.
├── InteractionEvent
│   ├── SCROLL_DEPTH     — has: depth milestone. Signals engagement depth.
│   └── RAGE_CLICK       — has: selector, click_count. Signals frustration.
├── CommerceEvent
│   └── COMMERCE_ACTION  — has: action (cart_add|checkout|search|...), duration_ms
├── ErrorEvent
│   ├── JS_CRASH         — has: stack trace. is_blocking: true
│   ├── API_FAILURE      — has: status_code, endpoint, duration_ms
│   ├── NETWORK_ERROR    — has: endpoint. Implies connectivity issue.
│   ├── UI_FAILURE       — has: selector. Detected via MutationObserver.
│   └── CUSTOM_EXCEPTION — has: user-defined metadata
├── PerformanceEvent
│   ├── API_LATENCY      — has: endpoint, duration_ms. Threshold: slowApiThreshold.
│   └── RUM_METRICS      — has: lcp, inp, cls, ttfb, loadTime
└── SystemEvent
    ├── QUEUE_OVERFLOW    — has: dropped_count. SDK health signal.
    └── FLUSH_FAILED      — SDK health signal.
```

#### Edge Types (Relationships)

Edges are inferred server-side from session ordering and event type constraints:

| Edge | From → To | Inference Rule | Semantic |
|---|---|---|---|
| `preceded` | Any → Any | Sequential `event_id` in same session | Temporal ordering |
| `caused` | CAMPAIGN_ENTRY → PAGE_VIEW | Campaign → first page view (min seq) | Attribution |
| `blocked_by` | CommerceEvent → ErrorEvent | Error within 2s after commerce action | Revenue impact |
| `frustrated_by` | ErrorEvent → RAGE_CLICK | Rage click following any error | UX impact |
| `abandoned_at` | CommerceEvent → TAB_VISIBILITY | Tab hidden after cart, no subsequent checkout | Conversion loss |

#### Ontological Constraints

These are the rules that make the graph meaningful, not just a timeline:

1. **CAMPAIGN_ENTRY is a singleton** — max 1 per session. If params change mid-session (rare), ignore the second occurrence.
2. **`caused` only connects to NavigationEvent** — a campaign causes a page view, never an error or commerce action directly.
3. **`blocked_by` requires temporal proximity** — the error must occur within 2 seconds of the commerce action. Beyond that, the causal link is too weak.
4. **`frustrated_by` requires same-session** — rage click must follow an error in the same session, not just any recent error globally.
5. **`abandoned_at` requires negative proof** — the edge only materializes if no `COMMERCE_ACTION(checkout)` appears after the tab hide. This is checked at session close (24h rolling window in TenantAgent).
6. **ErrorEvents propagate severity upward** — if any event in a session has `severity: error`, the session inherits that severity for scoring and alerting.
7. **CommerceEvents carry revenue signal** — the `action` field maps to funnel stages. The server uses this to compute funnel_stage on the session: `landing → browsing → cart → checkout → converted`.

#### How Taxonomy and Ontology Work Together

The taxonomy classifies the **entry point**. The ontology connects the **full journey**. Together, they answer questions neither could alone:

| Question | Requires |
|---|---|
| "What channels drive the most traffic?" | Taxonomy only |
| "Which sessions had checkout errors?" | Ontology only (blocked_by edges) |
| "Which *paid channels* are losing revenue to checkout errors?" | Taxonomy (channel = paid_*) + Ontology (blocked_by + abandoned_at) |
| "Is Instagram traffic more likely to abandon than Google traffic?" | Taxonomy (segment by platform) + Ontology (abandoned_at rate per segment) |
| "Do affiliate shoppers hit more API latency than email shoppers?" | Taxonomy (segment) + Ontology (API_LATENCY nodes per segment) |

The SDK's job is to emit high-fidelity nodes with raw attribution params. The server's job is to apply the taxonomy, infer the edges, and answer these cross-cutting questions.
