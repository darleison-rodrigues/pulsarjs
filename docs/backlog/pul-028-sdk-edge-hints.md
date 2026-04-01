# [PUL-028] SDK Edge Hints: caused_by + edge_hint for causal graph construction

**Status**: 🟡 Revised — Aligned with ECKG ontology and causal framework (per pulsarjs.com/content/paper/)

**Severity**: High — Edge hints are the deterministic facts that enable server-side causal reasoning

**Depends on**: PUL-001 (commerce context), PUL-003 (click ID capture), PUL-042 (intent edge hints)

---

## Overview

The SDK observes **temporal facts** about event ordering and causal relationships that are deterministic from the client. Rather than forcing the server to infer these heuristically via SQL window functions, the SDK emits explicit `caused_by` (prior event_id) and `edge_hint` (semantic label) fields when causal knowledge is client-deterministic.

Per the ECKG ontology (pulsarjs.com/content/paper/):
- **Facts** (`P_REG`) — Temporal ordering, event sequencing — universally valid
- **SDK edge hints** — Deterministic client-side observations of causality (which event preceded which)
- **Server claims** — Domain-specific interpretations (Behavioral: intent recovery, Technical: latency impact, Commercial: revenue loss)

The six edge types map to observable state transitions:

---

## Six Edge Types (Deterministic Client-Side Facts)

| edge_hint | Source event | caused_by | Trigger Condition |
|---|---|---|---|
| `blocked_by` | API_FAILURE | lastCommerceEventId | API failure on commerce endpoint after COMMERCE_ACTION |
| `frustrated_by` | RAGE_CLICK | lastErrorEventId | Rage click pattern after JS_CRASH or UI_FAILURE |
| `abandoned_at` | TAB_VISIBILITY | lastCommerceEventId | Tab hidden after COMMERCE_ACTION, not checkout |
| `caused` | CAMPAIGN_ENTRY | firstPageViewEventId | Campaign entry follows first PAGE_VIEW (always ordered) |
| `degraded_by` | API_LATENCY | commerceEventId (same request) | Commerce endpoint exceeded slowApiThreshold |
| `retried_after` | COMMERCE_ACTION | lastFailedCommerceAction[type] | Same action type had prior API_FAILURE |

**Invariant**: `caused_by` always references a lower `event_seq` number (prior event). Omit both `caused_by` and `edge_hint` when no causal link exists (never null).

---

## Files to Modify

1. `packages/sdk/src/core/capture.js` — Return event_id, pass through edge hint fields
2. `packages/sdk/src/index.js` — Add state tracking fields (lastErrorEventId, lastCommerceEventId, etc.)
3. `packages/sdk/src/collectors/network.js` — blocked_by, degraded_by, retried_after edges
4. `packages/sdk/src/collectors/errors.js` — Track lastErrorEventId after JS_CRASH, UI_FAILURE
5. `packages/sdk/src/collectors/interactions.js` — frustrated_by edge on RAGE_CLICK
6. `packages/sdk/src/collectors/navigation.js` — caused + abandoned_at edges, async emitPageView

---

## Change 1 — capture.js: Return event_id + pass through edge hint fields

**Why**: degraded_by requires the COMMERCE_ACTION event_id within the same request. blocked_by / retried_after require the event_id of the failure that was just emitted.

**How**:
- Move event_id generation AFTER dedup early-return (only claim a seq number for events actually enqueued)
- Return eventId from capture()
- In payload, include `caused_by` and `edge_hint` only when present (omit entirely when no causal link)

```javascript
// After dedup check passes:
const eventId = `${state.sessionID}:${++_eventSeq}`;

let payload = {
    event_id: eventId,
    // ... existing fields ...
};

// Edge hint fields — omit entirely when no causal link (not null)
if (errorData.caused_by) {
    payload.caused_by = errorData.caused_by;
    payload.edge_hint = errorData.edge_hint;
}

// ... beforeSend, enqueue, scheduleFlush ...

return eventId;  // added

// Early-return paths (!enabled, deduplicated) return null.
```

---

## Change 2 — index.js: New state tracking fields

Add to state object (after firstDropSessionId):

```javascript
// PUL-028: causal tracking for edge hints
lastErrorEventId: null,         // set by errors.js after JS_CRASH / UI_FAILURE
lastCommerceEventId: null,      // set by network.js after COMMERCE_ACTION
lastCommerceAction: null,       // { action: string, event_id: string }
lastFailedCommerceAction: {},   // { [action_type]: { event_id: string } }
firstPageViewEventId: null,     // set by navigation.js after first PAGE_VIEW
```

---

## Change 3 — network.js: blocked_by, degraded_by, retried_after

**Fetch interceptor — success path** (sequential, commerce awaited for event_id):

```javascript
let commerceEventId = null;
const commerceAction = detectCommerceAction(method, requestUrl, config.commerceActions);
if (commerceAction) {
    const failed = state.lastFailedCommerceAction[commerceAction];
    commerceEventId = await capture({
        event_type: 'COMMERCE_ACTION',
        message: `Commerce: ${commerceAction}`,
        metadata: { action: commerceAction, endpoint: ..., method, duration_ms: Math.round(duration) },
        severity: 'info',
        is_blocking: false,
        ...(failed ? { caused_by: failed.event_id, edge_hint: 'retried_after' } : {})
    });
    state.lastCommerceEventId = commerceEventId;
    state.lastCommerceAction = { action: commerceAction, event_id: commerceEventId };
    if (failed) delete state.lastFailedCommerceAction[commerceAction];
}
if (duration > config.slowApiThreshold) {
    capture({
        event_type: 'API_LATENCY',
        message: `Slow API: ...`,
        metadata: { ... },
        severity: 'info',
        is_blocking: false,
        ...(commerceEventId ? { caused_by: commerceEventId, edge_hint: 'degraded_by' } : {})
    });
}
```

**Fetch interceptor — failure path**:

```javascript
const failedAction = detectCommerceAction(method, requestUrl, config.commerceActions);
const failedEventId = await capture({
    event_type: 'API_FAILURE',
    message: `API HTTP ${response.status}: ...`,
    // ...
    ...(failedAction && state.lastCommerceEventId
        ? { caused_by: state.lastCommerceEventId, edge_hint: 'blocked_by' }
        : {})
});
if (failedAction && failedEventId) {
    state.lastFailedCommerceAction[failedAction] = { event_id: failedEventId };
}
```

**XHR interceptor**: Apply same patterns to loadend callback (make async).

---

## Change 4 — errors.js: Track lastErrorEventId

After each error capture:

```javascript
// JS_CRASH (window error):
const eventId = await capture({ event_type: 'JS_CRASH', ... });
if (eventId) state.lastErrorEventId = eventId;

// JS_CRASH (unhandledrejection):
const eventId = await capture({ event_type: 'JS_CRASH', ... });
if (eventId) state.lastErrorEventId = eventId;

// UI_FAILURE (MutationObserver):
const eventId = await capture({ event_type: 'UI_FAILURE', ... });
if (eventId) state.lastErrorEventId = eventId;
```

---

## Change 5 — interactions.js: frustrated_by on RAGE_CLICK

```javascript
state.capture({
    event_type: 'RAGE_CLICK',
    message: `Rage click: ${selector}`,
    metadata: { selector, click_count: sameTarget.length, window_ms: threshold_ms },
    severity: 'warning',
    is_blocking: false,
    ...(state.lastErrorEventId
        ? { caused_by: state.lastErrorEventId, edge_hint: 'frustrated_by' }
        : {})
});
```

---

## Change 6 — navigation.js: caused + abandoned_at

**emitPageView** — track firstPageViewEventId (async):

```javascript
async function emitPageView(state, pageInfo, referrerType, fromPageType) {
    // ...
    const eventId = await state.capture({ event_type: 'PAGE_VIEW', ... });
    if (!state.firstPageViewEventId && eventId) {
        state.firstPageViewEventId = eventId;
    }
}

// Callers (setupNavigationTracking) await emitPageView() where needed
```

**emitCampaignEntry** — caused edge:

```javascript
state.capture({
    event_type: 'CAMPAIGN_ENTRY',
    // ...
    ...(state.firstPageViewEventId
        ? { caused_by: state.firstPageViewEventId, edge_hint: 'caused' }
        : {})
});
```

**TAB_VISIBILITY** — abandoned_at:

```javascript
const onVisibility = () => {
    const isHidden = document.visibilityState === 'hidden';
    const abandonEdge = isHidden
        && state.lastCommerceEventId
        && state.lastCommerceAction?.action !== 'checkout';

    state.capture({
        event_type: 'TAB_VISIBILITY',
        message: `Tab ${document.visibilityState}`,
        metadata: { visibility: document.visibilityState, page_type: currentPageInfo.type },
        severity: 'info',
        is_blocking: false,
        ...(abandonEdge ? { caused_by: state.lastCommerceEventId, edge_hint: 'abandoned_at' } : {})
    });
};
```

---

## Acceptance Criteria

- ✅ `caused_by` always references lower `event_seq`
- ✅ `edge_hint` is one of the six valid string literals
- ✅ Events without causal links omit both fields (not null)
- ✅ Existing behavior unchanged (backward compatible)
- ✅ All six edge types emit correctly under trigger conditions
- ✅ Unit tests verify edge emission and validation

---

## Related Documentation

- **ECKG Ontology**: pulsarjs.com/content/paper/ — Formal model of facts vs claims vs attributed predicates
- **PUL-001**: Commerce context builder (dataLayer for purchase signal)
- **PUL-003**: Click ID capture (CAMPAIGN_ENTRY edge)
- **PUL-042**: Commerce intent edge hints (state transition observations)
- **SERVER.md**: How server interprets edges via Markov intent scoring + causal attribution
