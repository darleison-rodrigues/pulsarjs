# [PUL-050] SDK Hardening — Error Boundaries & Defensive Coding

**Status**: ✅ Done (PR #55, #46)
**Severity**: Critical — the SDK must never crash the host page.

**What shipped**:
1. Every collector setup wrapped in try/catch at the call site in `init()`.
2. Every public API method wrapped in try/catch.
3. `state.extractPlatformContext()` wrapped — provider `extractContext()` can throw.
4. Fetch/XHR interceptors call the original even if Pulsar's logic throws.
5. `beforeSend` timeout + try/catch for user-supplied async functions.

**Tests**: ~80 hardening tests in `packages/sdk/tests/unit/hardening.test.js`.

---
