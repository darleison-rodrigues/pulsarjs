# Shared Agent Base — PulsarJS

> This file is referenced by all agent templates. It defines the common operational protocol.
> Do not dispatch this file directly — it is a shared import.

---

## Startup Sequence — Run This First, Every Time

1. Read `.jules/memory.yaml`. For every entry whose `trigger` matches your current task, load the `pattern` and `implication` into working context before you begin. If nothing matches, proceed normally.
2. Run `pnpm lint && pnpm test && pnpm build` from root. If this fails, **stop**. Do not open a PR against a broken build.
3. Read `.jules/findings.yaml`. Do not re-raise any finding with `status: fixed` or `status: skipped`.
4. Check for open PRs authored by this agent. If your finding is already in an open PR, skip it.

---

## Findings Log Protocol

Append confirmed findings to `.jules/findings.yaml`:

```yaml
- date: {{DATE}}
  agent: {{AGENT_NAME}}
  code: {{FINDING_CODE}}
  file: {{FILE_PATH}}
  line: {{LINE_NUMBER}}
  status: fixed | skipped
  pr: {{PR_NUMBER}}
  skipped_reason: ""
```

Read this file at the start of every run. Do not re-raise findings with `status: fixed`. Do not open a PR if a finding at the same file and line is already logged.

---

## Non-Declarative Memory Protocol

Read `.jules/memory.yaml` at the start of every run before scanning. Apply any entry whose `trigger` matches your current task. This primes your scan with confirmed structural facts — apply them before you start, not after you find something surprising.

Append a new entry ONLY when you confirm a pattern that is:
- Specific to this codebase's structure — not generic advice
- Confirmed by direct inspection of source, not inferred
- Not already covered by an existing entry

Entry format:
```yaml
- id: mem-XXX
  domain: {{DOMAIN}}
  trigger: "the scanning context that should activate this"
  pattern: >
    A structural fact about this specific codebase, confirmed
    by reading actual source files directly.
  implication: "one sentence — what to do differently because of it"
  source: {{AGENT_NAME}}
  confirmed: {{DATE}}
  recurrence: 1
```

If you re-confirm an existing entry, increment its `recurrence` count. Do not add a new entry. If nothing novel was learned this run, do not append anything.

---

## PR Format

**Title:** `{{PR_PREFIX}}: fix {{FINDING_CODE}} — {{ONE_LINE_DESCRIPTION}}`

**Body:**
```
**Finding:** {{FINDING_CODE}}
**File:** {{FILE_PATH}} line {{LINE_NUMBER}}
**Confirmed by:** {{CONFIRMATION_METHOD}}
**Fix:** {{FIX_DESCRIPTION}}
**Verification:** {{VERIFICATION_METHOD}}
```

One PR per finding. No batching.

---

## Base Prohibitions

These apply to ALL agents. Individual agent templates may add domain-specific prohibitions.

- Do not add any runtime dependencies to `packages/sdk/` (zero-deps constraint)
- Do not use `eval`, `new Function`, or `innerHTML`
- Do not introduce top-level `await` (breaks SFCC SFRA compatibility)
- Do not force push to `main` or `staging`
- Do not commit secrets, tokens, or credentials
- Run `pnpm lint && pnpm test && pnpm build` after every fix. If tests fail, revert and log as `status: skipped`.
