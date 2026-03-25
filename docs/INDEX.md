# PulsarJS Architecture & Internal Guide

> Internal developer guide and instructions for building PulsarJS: a privacy-first, causality-aware commerce instrumentation SDK.

---

## Documentation Index

- [Project Identity](./guide/01-project-identity.md)
- [Legal & Compliance Position](./guide/02-legal-compliance.md)
- [Device Signal Strategy](./guide/03-device-signal-strategy.md)
- [Repository Structure](./guide/04-repository-structure.md)
- [Event Types](./guide/05-event-types.md)
- [Channel Taxonomy & Event Ontology](./guide/06-channel-taxonomy-ontology.md)
- [Architecture Principles](./guide/07-architecture-principles.md)
- [Config Schema](./guide/08-config-schema.md)
- [Web Vitals Reference](./guide/09-web-vitals.md)
- [SFCC Context Reference](./guide/10-sfcc-context.md)
- [Sanitizers Contract](./guide/11-sanitizers-contract.md)
- [Testing Expectations](./guide/12-testing-expectations.md)
- [Useful References](./guide/13-useful-references.md)
- [Platform Providers & Integration Examples](./guide/14-examples.md)
- [Exporting Data to Custom Endpoints](./guide/15-export.md)


---
# API Reference

Privacy-first commerce instrumentation SDK — platform-agnostic, causality-aware.

**Base URL**: `https://api.pulsarjs.com`

---

## Documentation Index

- [Authentication](./api/01-authentication.md)
- [Core Methods](./api/02-core-methods.md)
- [Custom Providers](./api/03-custom-providers.md)
- [Endpoints](./api/04-endpoints.md)
- [Event Schema](./api/05-event-schema.md)
- [Edge Taxonomy](./api/06-edge-taxonomy.md)
- [Envelope Manifest](./api/07-envelope-manifest.md)


---

# PulsarJS Product Backlog

> **Scope**: Core Deterministic Pipeline (Phase 1 MVP)
> **Prefix**: `PUL-XXX`
> **Branch Convention**: `feature/pul-XXX-short-description`
> **Last synced**: 2026-03-24

---

## Status Legend

| Icon | Meaning |
|---|---|
| ✅ Done | Merged to main |
| 🟡 In Progress | PR open or Jules session active |
| 🔴 Open | Not started |

---

## Summary

| Ticket | Title | Status | PR(s) | Details |
|---|---|---|---|---|
| PUL-040 | Shopify Platform Provider | ✅ Done | — | [pul-040-shopify-platform-provider.md](backlog/pul-040-shopify-platform-provider.md) |
| PUL-050 | SDK Hardening | ✅ Done | #55, #46 | [pul-050-sdk-hardening-error-boundaries-defensive-coding.md](backlog/pul-050-sdk-hardening-error-boundaries-defensive-coding.md) |
| PUL-051 | Integration Tests | ✅ Done | #56 | [pul-051-integration-tests-full-pipeline-lifecycle.md](backlog/pul-051-integration-tests-full-pipeline-lifecycle.md) |
| PUL-060 | Landing Page Content | 🔴 Open | — | [pul-060-landing-page-content-structure.md](backlog/pul-060-landing-page-content-structure.md) |
| PUL-042 | Commerce Intent Edge Hints | 🔴 Open | — | [pul-042-commerce-intent-edge-hints.md](backlog/pul-042-commerce-intent-edge-hints.md) |
| PUL-052 | E2E Playwright Tests | 🔴 Open | — | [pul-052-e2e-tests-real-browser-validation-playwright.md](backlog/pul-052-e2e-tests-real-browser-validation-playwright.md) |
| PUL-053 | PWA Kit Validation | 🔴 Open | — | [pul-053-platform-validation-pwa-kit-integration.md](backlog/pul-053-platform-validation-pwa-kit-integration.md) |
| PUL-002 | PWAKit Integration Testing | 🔴 Open | — | [pul-002-pwakit-integration.md](backlog/pul-002-pwakit-integration.md) |
| PUL-054 | Shopify Store Validation | 🔴 Open | — | [pul-054-platform-validation-shopify-store.md](backlog/pul-054-platform-validation-shopify-store.md) |
| PUL-041 | Agentforce Commerce Provider | 🔴 Open | — | [pul-041-agentforce-commerce-provider.md](backlog/pul-041-agentforce-commerce-provider.md) |
| PUL-061 | Live Demo | 🔴 Open | — | [pul-061-live-demo-synthetic-stream-visualization.md](backlog/pul-061-live-demo-synthetic-stream-visualization.md) |
| PUL-062 | Console Mode QA Docs | 🔴 Open | — | [pul-062-console-mode-documentation-qa-positioning.md](backlog/pul-062-console-mode-documentation-qa-positioning.md) |

### Security & Performance (completed via Jules agents)

| Code | Fix | PR | Status |
|---|---|---|---|
| M1 | Stack trace sanitization | #50, #53, #58 | ✅ Done |
| C2 | PII reaching sendBeacon without sanitize() | #38 | ✅ Done |
| H1/H2/H3 | Email sanitization, pattern isolation, ReDoS | #48 | ✅ Done |
| M3 | Event listener leak in rum.js | #51 | ✅ Done |
| P2 | Debounce synchronous storage writes | #52 | ✅ Done |
| P6 | Cache shared envelope fields + lazy-init env | #54, #49 | ✅ Done |
| P9 | Redundant timestamp capture on fetch | #61 | ✅ Done |
| Audit | Privacy, data loss, code hygiene fixes | #60 | ✅ Done|

---

## Dependency Graph

```
PUL-031 (done) ─┬─ PUL-040 ─── PUL-054
                 └─ PUL-041

PUL-028 (done) ─── PUL-042

PUL-050 (done) ─┬─ PUL-051 (done) ─── PUL-052 ─── PUL-054
                 └─ PUL-053

PUL-062 (no deps) → PUL-060 → PUL-061 (needs synthetic generator)
```

## Next Up (recommended order)

```
1. PUL-062  — console mode docs + formatting (no deps, immediate value)
2. PUL-060  — landing page rewrite (copy from existing docs)
3. PUL-052  — Playwright E2E tests (deps met)
4. PUL-040  — Shopify provider (deps met)
5. PUL-053  — PWA Kit validation (deps met)
6. PUL-042  — Commerce intent edges (deps met, discuss scope first)
```
