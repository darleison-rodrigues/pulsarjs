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