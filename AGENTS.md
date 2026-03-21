# AGENTS.md

> Universal instruction set for all AI agents operating on this repository.
> **Precedence**: AGENTS.md (behavior) > CLAUDE.md (project context) > .jules/memory.yaml (structural facts).
> Claude, Jules, Gemini — all agents read this first. When in doubt, this file wins.

---

## File Hierarchy

| File | Purpose | Who reads it | Loads |
|---|---|---|---|
| `AGENTS.md` | Agent behavior, safety, workflow, skills | All agents | Always (first) |
| `CLAUDE.md` | Project context, stack, commands, architecture | Claude Code | Always (auto) |
| `.jules/memory.yaml` | Structural facts about this codebase | All agents | Before each task |
| `SPEC.md` | Full system specification | On demand | When deep-diving |
| `docs/` | API contracts, SDK reference, roadmap | On demand | When implementing |

---

## Context Window Optimization

| Dimension | Rule |
|---|---|
| Correctness | Every CLI command tested against actual --help output |
| Completeness | Each instruction is self-contained — no dangling references |
| Size | No prose, ASCII art, or examples. Imperative steps only. |
| Trajectory | Numbered decision tree — one action per step, one next step |

---

## What this project is

PulsarJS is a privacy-first ecommerce observability SDK for electronic commerce merchants. It captures behavioral events and commerce-critical failures in the browser (broken checkouts, API timeouts, quota violations, UI crashes) and streams them to the edge for real-time scoring and alerting — without session replay, without PII, and without requiring a consent banner.

The browser SDK (`packages/sdk/`) is the public artifact. It builds to a single pixel file (`pulsar.js`) loaded via `<script>` tag on any storefront. The edge scoring layer (Cloudflare Workers + Durable Objects) is a separate deployment not yet in this repo.

---

## Repository structure

```
pulsarjs/
├── packages/
│   └── sdk/
│       ├── src/
│       │   ├── index.js              # Entry point → builds to p.js
│       │   ├── core/                 # Config, scope, session, capture pipeline
│       │   ├── collectors/           # errors.js, network.js (fetch/XHR), rum.js
│       │   ├── integrations/         # sfcc-integration.js — SFRA / PWA Kit context
│       │   └── utils/                # sanitizers.js, environment.js, attribution.js
│       └── tests/
├── docs/
│   └── BACKLOG.md                    # Product backlog — read before picking up new work
├── .github/workflows/                # CI pipelines
├── .claude/skills/                   # Claude Code skills (local only, not read by Jules)
├── .jules/                           # Jules agent memory and agent definitions
│   └── memory.yaml                   # Adaptive learning — structural facts
├── eslint.config.js
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Commands

```bash
# From repo root
pnpm install          # install all workspace deps
pnpm build            # build sdk → p.js output
pnpm lint             # eslint across all packages
pnpm test             # unit tests (vitest)
pnpm test:e2e         # integration tests (for now disabled)
```

Always run `pnpm lint` and `pnpm test` before considering a task complete.
If a build script isn't present yet, check `packages/sdk/package.json` for the local equivalent.

---

## Safety Rules

- **NEVER** delete `docs/`, `context/`, `.jules/`, or any folder without asking
- **NEVER** expose secrets or tokens — all config via `.env` / wrangler secrets
- **NEVER** force push to `main` or `staging`
- Specs in `context/` are **read-only reference** — do not reorganize

---

## Agent Quality Protocol

1. **Say What You Do** — document before coding
2. **Do What You Say** — follow the procedure
3. **Record What You Did** — commit with story key
4. **Prove It** — run tests, verify output
5. **Improve It** — act on differences

---

## Hard constraints — read before touching anything

### SDK bundle (packages/sdk/)
- **ZERO runtime dependencies.** The SDK connects directly to native browser APIs only: `PerformanceObserver`, `navigator.sendBeacon`, `fetch`, `XHR`. Do not add any `import` from `node_modules` to SDK source without explicit approval. Bundle size is a hard product constraint.
- **No top-level `await`.** ESM-first, CJS interop via build. Top-level await breaks legacy SFCC storefront compatibility.
- **No Node.js APIs.** The SDK runs in browser context. Nothing from `node:*`, `fs`, `path`, `process`, etc.

### Privacy (non-negotiable)
- **Never log or persist raw URL query strings.** They may contain PII (email, order tokens, redirect params). Run everything through `utils/sanitizers.js`.
- **`beforeSend` hooks are the PII boundary.** All outbound payloads must pass through the `beforeSend` pipeline before leaving the device. Do not bypass this for any reason, including testing.
- The SDK operates under merchant legitimate interest. It must never collect data that would require a consent banner — this is a product guarantee to customers.

### SFCC platform
- SFCC storefront types: `PWA_KIT`, `SFRA`, `HEADLESS`. The integration layer in `integrations/sfcc-integration.js` must remain storefront-agnostic via the platform adapter pattern. Do not hardcode storefront-specific behavior outside that module.
- `dwsid` is the SFCC session cookie — handle with care. Never log it, never send it in event payloads.
- SCAPI and OCAPI have different auth patterns (SLAS vs. client-secret). Do not conflate them.

### TypeScript
- `tsconfig.base.json` enforces strict mode. Treat `any` as a lint error even if it passes.
- Type errors are blockers, not warnings.

### Delivery
- Event delivery uses `navigator.sendBeacon` on `visibilitychange`, with `fetch({ keepalive: true })` as fallback. Do not change this delivery contract without understanding the implications for in-flight payloads on page unload.

---

## Coding Standards

- TypeScript strict, follow existing conventions
- Only use libraries already in `package.json`
- All handlers in `src/handlers/`, shared logic in `src/lib/`
- Test files mirror source: `src/handlers/__tests__/`
- Gate logging on debug flag — silent prod, loud debug
- Follow neighboring files for patterns

---

## Code conventions

- **Errors are typed.** Use the error taxonomy in `collectors/errors.js`. Never `throw new Error('raw string')` — errors must carry structured context (type, source, timestamp, breadcrumbs).
- **Sanitizers are not optional.** Every event that touches user-generated or URL-derived data must pass through `utils/sanitizers.js` before capture.
- **Attribution is handled.** `utils/attribution.js` covers UTM parameters, six platform click IDs (gclid, fbclid, ttclid, etc.), referrer classification, and first-touch/last-touch logic. Don't reimplement any of this inline.
- **UI breadcrumbs** are a rolling buffer of the last N click events. They're deterministic debugging context, not analytics. Keep them lightweight — no DOM serialization, element selectors only.
- **RUM metrics** (LCP, INP, CLS, TTFB, FCP) are collected via `PerformanceObserver` during browser idle time (`requestIdleCallback` or `setTimeout` fallback). Do not collect them on the critical path.

---

## Non-Declarative Memory — Adaptive Learning

`.jules/memory.yaml` is a living document. All agents (Claude and Jules) contribute to it, updating weights and recency based on actual usage.

### How Agents Use Memory

1. **Dispatcher ranks relevance** — When `/jules-dispatch` creates a session prompt:
   - Read `.jules/memory.yaml`
   - Ask LLM: "Which of these memories are relevant to [TASK]?"
   - Inject top-3 entries as "soft hints" into the prompt
   - Jules agent can ignore hints, but they prime context

2. **Agent updates weights** — At the end of each Jules run:
   - If agent used a memory entry: increment `recurrence` and update `confirmed`
   - If agent referenced but didn't use: leave untouched
   - Append new entries ONLY for patterns confirmed by direct inspection

3. **Sync handles success signals** — When `/jules-sync` detects PR merged/rejected:
   - For each memory entry cited in the commit: increment `success_count`
   - If PR was rejected: keep `success_count` but add `failure_count`

4. **Weekly curation** — Memory Curator agent runs every Monday 2am UTC:
   - Read `.jules/memory.yaml`
   - Identify similar/overlapping entries
   - Suggest merges and decomposition
   - Archive entries with `recurrence < 1` after 30 days

### Memory Entry Schema

```yaml
- id: mem-XXX
  domain: security|performance|architecture|testing|code-health|documentation|integration
  trigger: "the scanning context that activates this"
  pattern: >
    A structural fact confirmed by reading actual source.
  implication: "one sentence — what to do differently"
  source: agent-name
  confirmed: YYYY-MM-DD
  recurrence: 1
  success_count: 0
  failure_count: 0
  last_used: YYYY-MM-DD
  weight: 1.0
```

- `recurrence` — how many times an agent confirmed this pattern
- `success_count` — PRs merged citing this entry
- `failure_count` — PRs rejected citing this entry
- `weight` — dispatcher uses this to rank relevance (recurrence + success_count - failure_count)

---

## Known issues and open debt

These are tracked in `docs/BACKLOG.md`. Check it before starting any refactor.

Issues surfaced in prior code review (PUL-033 through PUL-037) cover: scope isolation bugs, sanitizer coverage gaps, RUM observer lifecycle management, XHR interception edge cases, and attribution first-touch persistence. If you touch any of those files, read the relevant issue first.

---

## What is in flight — do not refactor without checking

- **Platform adapter pattern** on `integrations/sfcc-integration.js` — in progress, do not restructure the integration module shape
- **ECKG predicate taxonomy** (P_REG / P_ET / P_EDGE / P_ATT) — this is the formal theoretical contribution of the project; schema changes require author review, do not infer and extend
- **Edge worker** (Cloudflare Worker + Durable Objects) — not yet in this repo; do not stub or scaffold it here without being asked

---

## Out of scope for agents

- Changes to pricing, licensing, or the `LICENSE` file
- Modifications to `.github/workflows/` CI pipelines without explicit instruction
- Any output that would require a consent banner (pixel tracking, fingerprinting beyond cohort signals, cross-site correlation)
- Speculative refactors of the ECKG taxonomy or rule engine contracts

---

## Commit & PR Standards

AI commits MUST include:
```
Co-Authored-By: <agent model name> <darleisonfilho@gmail.com>
```

Commit format: `{STORY-KEY}: {Imperative action}` — one logical unit per commit.

### Git Workflow
- `main` = production, `staging` = validation
- Feature branches: `feature/{STORY}-{desc}`
- All PRs target `main` (or `staging` for validation)
- Never force push to `main` or `staging`
- Never commit secrets

### Before Every Commit
1. `pnpm test` — all tests pass
2. `pnpm build` — type check passes
3. No secrets in code

---

## Agent Workflow Pipeline

```
ROADMAP → /jules-dispatch → Jules agents work → /jules-sync → /jules-review → PR merged
                ↑                                                    ↓
                └──────────── feedback loop (if needs changes) ──────┘
```

### Pipeline Skills (global — `~/.claude/skills/`)

| Skill | Trigger | Purpose | Token cost |
|---|---|---|---|
| `/jules-onboard` | "setup jules agents" | Analyze repo → propose agents → create sessions | Medium |
| `/jules-dispatch` | "dispatch backlog" | Backlog → Jules prompts → queue sessions | Medium |
| `/jules-sync` | "sync jules" | Poll status only — no review, no diff | Low |
| `/jules-review` | "review jules diff" | Pull diff → structured review → feedback loop | High (one at a time) |
| `/code-quality-audit` | "audit my code" | Line-by-line audit: hardcoded, stub, sloppy, inconsistent | High |
| `/memory-curator` | Weekly (Monday 2am UTC) | Curate memory.yaml — merge similar entries, archive low-weight | Medium |

### Repo Skills (`.claude/skills/`)

| Skill | Trigger | Purpose |
|---|---|---|
| `/code-reviewer` | "review this diff" | PulsarJS-specific structured code review |

### Planned Skills (build with `/skill-creator`)

| Skill | Purpose | Priority |
|---|---|---|
| `/e2e` | Run end-to-end tests against staging | Phase 1.5 |
| `/release` | Deploy checklist + wrangler publish | Phase 1.5 |
| `/fix-security-vulnerability` | Triage + fix Dependabot/security alerts | Phase 2 |
| `/triage-issue` | Classify GitHub issues, assign priority | Phase 2 |
| `/skill-creator` | Generate new SKILL.md from description + repo context | Next |
| `/skill-scanner` | Scan repo, propose skills based on gaps | Next |
| `/add-cdn-bundle` | Add CDN bundle configuration | Phase 2 |

---

## Autonomous Operation

### How Jules Works (constraints)
- Jules **clones your repo into a fresh VM** per session — it has full repo access
- Jules **reads `AGENTS.md` automatically** from repo root
- Jules **can read any repo file** (`.jules/memory.yaml`, `docs/`, etc.) if instructed
- Jules **does NOT read** `.claude/skills/` or `~/.claude/` — those are local Claude Code concepts
- Jules **produces a patch**, not a PR — you apply it with `jules remote pull --session <id> --apply` or `jules teleport <id>`
- Jules **cannot be triggered from GitHub Actions** — it runs in its own VM, not CI
- Jules **requires plan approval** for each session (unless auto-approved)

### Level 1 — Manual (current)
You run each skill by hand: `/jules-dispatch`, `/jules-sync`, `/jules-review`.

### Level 2 — Semi-Autonomous
```bash
# Poll Jules every 15 minutes, sync statuses
/loop 15m /jules-sync
```
Claude notifies you when tasks complete. You trigger `/jules-review` when ready.

### Level 3 — Assisted Loop
When `/jules-review` finds blockers:
1. Claude summarizes what needs fixing
2. You say "send feedback to Jules" → Claude creates a new session with the feedback baked in
3. Jules works on the fix → `/jules-sync` picks it up → `/jules-review` again
4. Repeat until LGTM → `jules teleport <id>` → you create PR and merge

This is as autonomous as it gets: Jules works, Claude reviews, you approve.

---

## Jules Prompt Template

Jules reads `AGENTS.md` automatically. The session prompt only needs task-specific context.
Do NOT duplicate AGENTS.md content in the prompt — Jules already has it.

When `/jules-dispatch` or `/jules-onboard` creates a session via `jules new`:

```
# {Agent Name} — {Focus}

## Task
{ticket ID}: {title}
Branch: {branch}

## Goal
{1-2 paragraphs: what to build/fix}

## Steps
{numbered implementation steps}

## Key Files
- Read: {files to understand before starting}
- Modify: {files to change}
- Test: {test files to create/update}

## Done When
- {acceptance criteria}
- Tests pass
- .jules/memory.yaml updated if you confirmed a novel structural pattern
```

**What Jules already knows** (from AGENTS.md auto-read):
- Safety rules, coding standards, quality protocol
- Memory read/write instructions (.jules/memory.yaml)
- Commit format, git workflow
- Project references (docs/, SPEC.md)

---

## Init signature reference

```js
Pulsar.init({
  clientId: 'your-project-key',
  storefrontType: 'PWA_KIT', // 'SFRA' | 'HEADLESS'
  enabled: true,
  debug: false,
  beforeSend: function(event) {
    // return null to drop the event entirely
    return event;
  }
});
```
This is the public API contract. Do not change the shape of `init()` or remove any of these keys without treating it as a breaking change.

---

## Reference Documentation

| Resource | When to read |
|---|---|
| `docs/API.md` | Modifying API contracts |
| `docs/GUIDE.md` | SDK integration guidance |
| `docs/EXAMPLES.md` | Usage patterns and examples |
| `docs/EXPORT.md` | Module exports reference |
| `docs/BACKLOG.md` | Planning work, checking dependencies |
| `SPEC.md` | Deep dive into any component |