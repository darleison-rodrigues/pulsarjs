# Edge Taxonomy

Events are nodes. Edges connect them. Some edges are hinted by the SDK (deterministic, from direct observation), others are computed by the server (require cross-session context or full session completion).

### SDK-Hinted Edges

The SDK attaches `edge_hint` and `caused_by` fields to events where the causal relationship is deterministic — not inferred by time proximity.

| Edge | From → To | How SDK Knows |
|---|---|---|
| `preceded` | any → next seq | Sequential by definition. Implicit — not sent as a hint. |
| `blocked_by` | COMMERCE_ACTION → API_FAILURE / NETWORK_ERROR | Same fetch interceptor. The failure IS the response to the commerce call. |
| `frustrated_by` | error event → RAGE_CLICK | Rage click detector stores last error event reference. |
| `abandoned_at` | COMMERCE_ACTION → TAB_VISIBILITY(hidden) | Visibility handler stores last commerce event reference. No subsequent checkout in session. |
| `caused` | CAMPAIGN_ENTRY → PAGE_VIEW | First page view in session. SDK knows it's the first emit. |
| `degraded_by` | COMMERCE_ACTION → API_LATENCY | Same fetch call was slow but successful. Both events originate from one interceptor call. |
| `retried_after` | API_FAILURE → COMMERCE_ACTION (same action type) | Same commerce action type fires again after a failure sequence. |
| `navigated_from` | PAGE_VIEW → PAGE_VIEW | SPA route change. Already tracked via `from_page_type`. |

Edge hint fields on an event:

| Field | Type | Description |
|---|---|---|
| `caused_by` | `string` | `event_id` of the causally related event (always a lower seq number) |
| `edge_hint` | `string` | Edge type: `blocked_by`, `frustrated_by`, `abandoned_at`, `caused`, `degraded_by`, `retried_after` |

Example:
```jsonc
{
    "event_id": "a1b2c3d4-...:8",
    "event_type": "API_FAILURE",
    "metadata": { "status": 500, "endpoint": "/orders" },
    "caused_by": "a1b2c3d4-...:7",
    "edge_hint": "blocked_by"
}
```

### Server-Computed Edges

These require context beyond a single event stream. The server materializes them after processing the full session or across sessions.

| Edge | From → To | Why Server |
|---|---|---|
| `correlated_with` | Error → Error (cross-session) | Same fingerprint across N sessions in time window. Requires aggregation. |
| `returned_after` | Session → Session | Same device_cohort visited within time window. Requires session history. |
| `converted_through` | CAMPAIGN_ENTRY → COMMERCE_ACTION(checkout) | Needs full session to confirm checkout completed without subsequent error. |
| `recovered_from` | API_FAILURE → COMMERCE_ACTION (same session, later) | User retried and succeeded. Needs full session timeline. |
| `dropped_from` | Session → funnel stage | No subsequent commerce action after last one. Needs session end signal. |

### Edge Materialization

The SDK emits facts: `{ edge_hint, caused_by }`. The server materializes RDF triples at write time:

```text
SDK emits:     { event_id: ":8", edge_hint: "blocked_by", caused_by: ":7" }
Server writes: :session_a3f9c2_000007  :blocked_by  :session_a3f9c2_000008 .
```

The SDK never emits RDF. It doesn't know the ontology namespace. The server owns the triple vocabulary and can evolve it without redeploying the SDK.
