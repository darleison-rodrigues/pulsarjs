# Architecture Principles

When writing or reviewing code for this project, apply these rules:

**1. Truly zero runtime dependencies**
No `import` of external packages in the final browser bundle. Sanitizers, utilities, and helpers must be self-contained. Build-time devDependencies are fine.

**2. Never mutate the payload after `beforeSend`**
The `beforeSend` hook is a contract with the developer. After it runs, treat the payload as immutable.

**3. Fail silently in production, loudly in debug mode**
Every catch block must gate on `config.debug` before logging. The SDK must never throw to the host page.

**4. Restore everything on `disable()`**
Every monkey-patched global (`fetch`, `XHR`, `onerror`, `pushState`, `replaceState`) and every event listener (scroll, click, visibility, popstate) must be restored to its exact original. This is tested by the teardown in `index.js:140-168`.

**5. PII must be redacted before anything enters the queue**
`Sanitizers.redactPII()` must be called at capture time, not at flush time. Assume the queue may be inspected.

**6. Session ID must use `crypto.randomUUID()` or `crypto.getRandomValues()`**
Never fall back to `Math.random()`. If crypto is unavailable, return `null` and the SDK disables. File: `core/session.js`.

**7. IP address must never reach persistent storage**
Enforced at the Cloudflare Workers layer, not in the SDK. The SDK must not include IP addresses in any payload field. The server truncates before storage.

**8. SFCC context fields are operational identifiers — handle with proportionality**
`dwsid` is pseudonymous. `visitorId` and `customerId` are sensitive. Include them only when operationally necessary. Never include them in aggregate metrics.

**9. Device signals must be cohort labels, never raw fingerprint data**
See Device Signal Strategy above.

**10. The SDK emits nodes, the server computes edges**
The SDK's job is to emit well-ordered, well-typed events with monotonic `event_id` (`session_id:seq`). It should never try to infer relationships between events — that's the server's responsibility.

**11. Debounce, don't flood**
Flush is debounced at 2 seconds. Every new event resets the timer. `sendBeacon` on page hide for final delivery. Never flush per-event.
