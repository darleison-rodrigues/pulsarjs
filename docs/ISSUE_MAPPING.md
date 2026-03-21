# CLAUDE.md Security Issues → Agent Template Mapping

**Purpose**: Ensure all known security/code-health issues from CLAUDE.md are covered by agent checklists.

---

## Issue Coverage Matrix

| ID | Issue | File | Description | Agent | Checklist | Priority |
|----|-------|------|-------------|-------|-----------|----------|
| **H1** | Raw email field, no sanitization | `core/scope.js` → every event | User email flows into payloads unsanitized | **Sentinel** | C4: User email not sanitized | CRITICAL |
| **H2** | `_extraPatterns` module-level | `utils/sanitizers.js` | Bleeds across `createInstance()` calls | **Sentinel** | H1: Patterns shared across instances | HIGH |
| **H3** | RegExp ReDoS in `registerPiiPatterns()` | `utils/sanitizers.js` | Accepts caller RegExp with no ReDoS validation | **Sentinel** | H2: RegExp ReDoS in custom patterns | HIGH |
| **M5** | History API patched twice | `collectors/rum.js` + `collectors/navigation.js` | Tangled teardown, prevents third patch | **Medic**, **Sentinel** | H2, H4: Consolidate History patches | HIGH |
| **M6** | Version hardcoded in two places | `core/capture.js` lines 342 + 401 | `pulsar_version` duplicated instead of imported | **Medic** | C2: Duplicate hardcoded values | CRITICAL |
| **L6** | Unconditional `window.Pulsar` assignment | `src/index.js` | No SSR guard before module eval | **Medic** | H3: SSR guard missing | HIGH |

---

## Agent Responsibility Breakdown

### Sentinel — Security Focus

Responsible for **detecting and fixing security vulnerabilities** including all H-level issues:

1. **H1 (core/scope.js)**: Email sanitization check
   - Checklist item: **C4 — User email not sanitized**
   - Verification: Confirm setUser() always passes email through sanitizer
   - PR requirement: Add sanitization wrapper or reject unsanitized email

2. **H2 (utils/sanitizers.js)**: Instance isolation
   - Checklist item: **H1 — Sanitizer patterns shared across instances**
   - Verification: Scope patterns per-instance in config
   - PR requirement: Move _extraPatterns from module level to per-instance config

3. **H3 (utils/sanitizers.js)**: ReDoS validation
   - Checklist item: **H2 — RegExp ReDoS in custom patterns**
   - Verification: registerPiiPatterns() validates regex complexity
   - PR requirement: Add regex validation (reject backtracking patterns) before accepting

4. **M5 (collectors/rum.js + navigation.js)**: History API consolidation
   - Checklist item: **H4 — Consolidated History API patches**
   - Verification: Only one History.pushState/replaceState patch exists
   - PR requirement: Consolidate patches or establish clear patch/unpatch order

### Medic — Code Health Focus

Responsible for **detecting dead code, unused exports, and structural issues** including M/L-level code issues:

1. **M6 (core/capture.js)**: Version hardcoding
   - Checklist item: **C2 — Duplicate hardcoded values**
   - Verification: Version imported from package.json, single constant used
   - PR requirement: Import version at build time, replace hardcoded strings

2. **M5 (collectors/)**: History API duplication
   - Checklist item: **H2 — History API patched multiple times**
   - Verification: Identify all History patches, assess consolidation feasibility
   - PR requirement: Document consolidation opportunity or execute refactor

3. **L6 (src/index.js)**: SSR safety
   - Checklist item: **H3 — SSR guard missing**
   - Verification: `window.Pulsar` assignment guarded by `typeof window !== 'undefined'`
   - PR requirement: Add SSR guard before assignment

---

## Issue Severity & Agent Priority

### CRITICAL (Sentinel + Medic immediate action)

- **H1**: Email sanitization bypass → Sentinel C4
- **M6**: Version hardcoding (build artifact inconsistency) → Medic C2

### HIGH (Both agents, Sentinel first)

- **H2**: Sanitizer state contamination → Sentinel H1
- **H3**: RegExp ReDoS in validation → Sentinel H2
- **M5**: History API tangled teardown → Medic H2 + Sentinel H4
- **L6**: SSR guard missing → Medic H3

---

## Verification Checklist

Before deploying agents to `.jules/agents/`, verify:

- [ ] **Sentinel C4** scans for raw email in scope.js setUser()
- [ ] **Sentinel H1** checks _extraPatterns isolation across instances
- [ ] **Sentinel H2** validates regex patterns with ReDoS check
- [ ] **Sentinel H4** detects multiple History API patches
- [ ] **Medic C2** finds duplicate pulsar_version assignments
- [ ] **Medic H2** identifies History API double-patching
- [ ] **Medic H3** checks for SSR guard in index.js
- [ ] Both agents' hard prohibitions prevent masking issues (no "skip" without fixing)

---

## Post-Deployment Monitoring

After agents are deployed, track:

1. **Week 1**: Sentinel runs and finds H1, H2, H3 issues (expected)
2. **Week 1**: Medic runs and finds M6, M5, L6 issues (expected)
3. **Weeks 2-4**: Agents open PRs to fix issues
4. **After fix**: Update `.jules/findings.yaml` with `status: fixed` for each issue

Target completion: All H1-L6 issues fixed in first month of agent deployment.

---

## Notes for Jules

- Agent dispatch should prioritize **Sentinel** first (security is P0)
- After Sentinel fixes, dispatch **Medic** for code health
- Both agents can run in parallel if you have multiple agent sessions
- Issues marked `status: fixed` in findings.yaml should not re-appear in subsequent runs
- If an issue is `status: skipped`, review the `skipped_reason` before re-opening

---

**Issue Mapping Complete** ✓

All known SDK security/code-health issues are covered by agent checklists.
