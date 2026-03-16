# Security Policy

## Supported Versions

We actively maintain the following versions:

| Version | Supported          | Notes                          |
| ------- | ------------------ | ------------------------------ |
| 1.0.x   | ✅                 | Current stable release         |
| < 1.0   | ❌                 | Legacy / Pre-release           |

If you are running an unsupported version, we strongly recommend upgrading before reporting a vulnerability, as the issue may already be resolved.

---

## Supported Runtimes & Environments

This repository targets the following environments. Vulnerabilities are only considered in scope for supported versions of each:

- **TypeScript / Node.js** — Node 18 LTS, Node 20 LTS
- **Cloudflare Workers** — Current Workers runtime (V8 isolates); `wrangler` 3.x

---

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

### Preferred Method — GitHub Private Advisory

Use [GitHub's private vulnerability reporting](../../security/advisories/new) to submit a report directly to the maintainers. This keeps the details confidential until a fix is ready.

### Alternative — Email

If you are unable to use GitHub's advisory flow, email us at **security@pulsarjs.com** with the subject line `[SECURITY] <brief description>`. Use our PGP key (see below) for sensitive disclosures.

### What to Include

A useful report helps us triage and fix the issue faster. Please include:

- A clear description of the vulnerability and its potential impact
- The affected component (TS module, SDK, or Worker)
- Steps to reproduce or a minimal proof-of-concept
- The version(s) affected
- Any suggested mitigations, if you have them

---

## What to Expect After Reporting

| Timeline      | What happens                                                                 |
| ------------- | ---------------------------------------------------------------------------- |
| **48 hours**  | Initial acknowledgement and triage confirmation                              |
| **7 days**    | Assessment of severity (using CVSS) and whether it is accepted or declined   |
| **30–90 days**| Patch development, testing across TS/Workers environments, and release |
| **Post-fix**  | CVE assignment (if applicable) and public disclosure coordinated with you    |

If a report is **declined**, we will explain why — for example, if the behaviour is intentional, already fixed, or falls outside our threat model.

---

## Severity Assessment

We use the [CVSS v3.1](https://www.first.org/cvss/calculator/3.1) scoring system to classify severity:

| Severity | CVSS Score | Expected Response Time |
| -------- | ---------- | ---------------------- |
| Critical | 9.0–10.0   | Patch within 7 days    |
| High     | 7.0–8.9    | Patch within 30 days   |
| Medium   | 4.0–6.9    | Patch within 60 days   |
| Low      | 0.1–3.9    | Addressed in next minor release |

---

## Scope

### In Scope

- Authentication or authorisation bypasses
- Remote code execution (RCE) in any supported runtime
- Injection vulnerabilities (SQL, command, template, etc.)
- Secrets or credentials exposed via TS modules, or Worker responses
- Worker-specific issues: data leakage between isolates, header injection, cache poisoning
- Dependency vulnerabilities with a direct exploit path in this project

### Out of Scope

- Vulnerabilities in unsupported versions
- Issues requiring physical access to the server or device
- Social engineering or phishing attacks
- Findings from automated scanners without a confirmed exploit path
- Missing security headers on demo deployments
- Rate limiting on public endpoints not marked as authenticated

---

## Dependency Security

We use the following tools to monitor dependencies. You are welcome to report findings from these that represent a genuine risk:

- **TypeScript** — `npm audit` and Dependabot alerts
- **Workers** — `wrangler` version pinning; miniflare for local testing isolation

---

## Disclosure Policy

We follow **coordinated disclosure**. We ask that you:

1. Give us a reasonable time to fix the issue before publishing details publicly (typically 90 days)
2. Make a good faith effort to avoid accessing or modifying other users' data
3. Not perform denial-of-service testing against production infrastructure

In return, we will credit you in the security advisory and release notes (unless you prefer to remain anonymous).

---

## Hall of Fame

We publicly recognise researchers who responsibly disclose valid vulnerabilities. Past contributors are listed in [SECURITY_ACKNOWLEDGEMENTS.md](./SECURITY_ACKNOWLEDGEMENTS.md).

---
