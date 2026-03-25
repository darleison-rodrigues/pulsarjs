# [PUL-051] Integration Tests — Full Pipeline Lifecycle

**Status**: ✅ Done (PR #56)
**Severity**: High — proves the capture → queue → flush pipeline works end-to-end.

**What shipped**: ~400 lines of integration tests in `packages/sdk/tests/unit/pipeline.test.js` covering init, capture, flush, disable/enable, queue overflow, concurrency guards, beforeSend hooks, provider resolution, and PII sanitization.

---
