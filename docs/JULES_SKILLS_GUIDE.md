# Jules Skills Guide — Understanding the Dispatch → Execute → Review Pipeline

**Status**: Phase 1 MVP | **Updated**: 2026-03-20 | **For**: Operators & Developers

---

## Overview

The Jules workflow has three layers, each **scoped to a specific repository**:

1. **Claude Layer** (`~/.claude/skills/`) — Local orchestration skills that run in your Claude Code session
   - Scope: Reads `git remote get-url origin` to determine repo
   - State file: `~/.jules-tasks/tasks.json` (contains `repo` field)

2. **Jules Layer** — Autonomous agent sessions that run in Google's Jules VMs (fresh clone per session)
   - Scope: Passed via `--repo owner/repo` flag
   - State: Lives in Jules API (queried by session ID)

3. **Repo Layer** (`.claude/skills/`) — Local reference skills for code review, auditing (Jules doesn't read these)
   - Scope: Current working directory repo
   - State: In-repo only (`.jules/`, `docs/`)

**Critical**: Each repo has its own `~/.jules-tasks/tasks-<REPO_SLUG>.json` file. This prevents cross-repo contamination.

This guide explains how data flows, what breaks between context windows, and how to recover.

---

## The Three Skills

### 1. `/jules-dispatch` — Queue Tasks (Claude Layer)

**What it does:**
- Reads a backlog/roadmap (e.g., `docs/ROADMAP.md`)
- Parses open tickets (status: Pending, Todo, Open)
- Reads `.jules/memory.yaml` and ranks relevant entries
- Injects top-3 memory entries as "soft hints" into each prompt
- Calls Jules CLI: `jules new --repo owner/repo "{prompt}"`
- Captures session IDs and persists to `~/.jules-tasks/tasks.json`

**Output:**
```json
{
  "repo": "darleison-rodrigues/pulsar-infra",
  "tasks": [
    {
      "id": "API-001",
      "jules_session_id": "3726000469766412423",
      "status": "queued"
    }
  ]
}
```

**Context Window Dependency:** HIGH
- Reads ROADMAP.md from disk
- Reads AGENTS.md from disk (for context)
- Reads .jules/memory.yaml from disk
- Generates prompts based on repo state
- **Problem if context ends**: Tasks file is written locally, so state persists. But if you run dispatch again in a NEW window without reading the file first, you might dispatch duplicates.

**Solution:** Always check `~/.jules-tasks/tasks.json` before re-dispatching. It's the source of truth.

---

### 2. `/jules-sync` — Poll Status & Update Memory (Claude Layer)

**What it does:**
- Reads `~/.jules-tasks/tasks.json` (your local copy of task state)
- Runs: `jules remote list --session`
- Parses Jules output and normalizes status values:
  - `Completed` → `completed`
  - `Awaiting Plan A...` → `awaiting_approval`
  - `Planning` → `running`
  - `Processing` → `running`
  - `Failed` → `failed`
- Updates `.jules-tasks/tasks.json` with new statuses
- **Future**: If PR is merged, increments `success_count` in `.jules/memory.yaml`
- **Future**: If PR is rejected, increments `failure_count` in `.jules/memory.yaml`

**Output:**
```
─── Jules Sync ──────────────────────
  3 completed (ready for /jules-review)
  2 running
  0 failed
```

**Context Window Dependency:** NONE (reads from Jules API, not disk)
- Calls `jules remote list --session` (queries Google's API)
- Updates local file with results
- Works across context windows without issues

**Solution:** Safe to run anytime. No duplication risk. State is authoritative on Jules side.

---

### 3. `/jules-review` — Pull Diff & Review (Claude Layer)

**What it does:**
- Takes a completed session ID
- Runs: `jules remote pull --session <id>` (downloads the diff/patch)
- Loads `.claude/skills/code-reviewer/SKILL.md` for PulsarJS-specific review rules
- Applies structured code review (checklist format)
- Provides feedback options:
  - **Approve** → Suggest next steps (merge to staging, then main)
  - **Reject** → Send feedback via `jules sendMessage` API (dispatches new session with feedback)
  - **Partial** → Review specific files only

**Context Window Dependency:** MEDIUM
- Needs `.claude/skills/code-reviewer/SKILL.md` to exist locally
- Pulls diff from Jules API (works across windows)
- Reads local code patterns for context
- **Problem if context ends**: If you start reviewing in one window and context ends mid-review, the next window sees the full diff again (Jules API is idempotent). No loss of data.

**Solution:** Keep reviews atomic per session. Don't span multiple reviews across context windows.

---

## Data Persistence Across Context Windows

### Local Files (Survive Context Boundary)

| File | Updated By | Survives? | Notes |
|---|---|---|---|
| `~/.jules-tasks/tasks.json` | `/jules-dispatch`, `/jules-sync` | ✅ YES | Source of truth. Always check before re-running dispatch. |
| `.jules/memory.yaml` | Agents (after each run) | ✅ YES | Weights update in-repo. Persists. |
| `.jules/findings.yaml` | Agents (e.g., Aegis, Bolt) | ✅ YES | Findings log per agent. Persists. |

### Session State (Lives in Jules API)

| State | Location | Accessible From | Notes |
|---|---|---|---|
| Session ID | Jules API | Any window (via `jules remote list`) | Your session identifier. Query it anytime. |
| Plan status | Jules API | Any window (via CLI or UI) | Is plan approved? Running? Completed? |
| Diff/Patch | Jules API | Any window (via `jules remote pull`) | Download anytime, anywhere. |

### Ephemeral State (Lost on Context End)

| Item | Lost? | Solution |
|---|---|---|
| Currently-open review (in-progress thoughts) | ✅ YES | Save notes to `.jules/review-notes.md` before context ends |
| Partially-written feedback | ✅ YES | Copy-paste feedback into a local file before context ends |
| Uncommitted dispatch logic | ✅ YES | Always commit dispatch results to `~/.jules-tasks/tasks.json` immediately |

---

## The Memory System — Adaptive Learning Across Sessions

### How It Works

**Dispatcher ranks at queue time:**
```
/jules-dispatch reads docs/ROADMAP.md
  → reads .jules/memory.yaml
  → asks LLM: "Which memories are relevant to API-001?"
  → injects top-3 as soft hints in the prompt
  → Jules receives the prompt with hints
  → Jules can use or ignore the hints
```

**Agent updates weights at run time:**
```
Jules finishes API-001 implementation
  → Reads .jules/memory.yaml (in-repo, accessible to Jules)
  → Checks which entries were useful
  → Increments recurrence on entries it used
  → Updates confirmed date
  → Writes back to repo
  → Claude pulls this in next /jules-sync or /jules-review
```

**Memory Curator handles weekly curation:**
```
Every Monday 2am UTC, a scheduled Jules agent runs:
  → Reads .jules/memory.yaml
  → Identifies overlapping entries
  → Suggests merges (e.g., "mem-015 and mem-023 are the same pattern")
  → Archives low-recurrence entries (recurrence < 1 after 30 days)
  → Updates .jules/memory.yaml
  → Creates a PR for you to review & merge
```

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
- `weight` — dispatcher uses: `recurrence + success_count - failure_count`

### Context Window Behavior

**Memory updates happen IN THE REPO** (on Jules side):
- Jules commits `.jules/memory.yaml` changes as part of the PR
- Your next `/jules-review` or `/jules-sync` pulls the updated file
- **No loss across context windows** — memory is versioned in git

---

## Full Workflow Example (With Context Window Breaks)

### Session 1: Dispatch Phase 1 Tickets

```bash
You: /jules-dispatch docs/ROADMAP.md

Claude reads:
  → docs/ROADMAP.md (5 Pending tickets: API-001, AI-001, SLACK-001, DIGEST-001, OPS-001)
  → .jules/memory.yaml (current memory state)
  → AGENTS.md (for context on expectations)

Claude ranks memory for each ticket and generates prompts:
  API-001 prompt includes hints: [mem-045 (itty-router patterns), mem-012 (D1 best practices), mem-033 (metrics computation)]
  AI-001 prompt includes hints: [mem-089 (Workers AI timeouts), mem-034 (fallback patterns)]
  ... etc

Claude calls:
  jules new --repo darleison-rodrigues/pulsar-infra "{API-001 prompt with hints}"
  jules new --repo darleison-rodrigues/pulsar-infra "{AI-001 prompt with hints}"
  ... etc

Claude captures session IDs:
  API-001 → 3726000469766412423
  AI-001 → 14695615951844159660
  ... etc

Claude writes ~/.jules-tasks/tasks.json with all 5 tasks marked "queued"

Output:
  ✅ API-001: 3726000469766412423
  ✅ AI-001: 14695615951844159660
  ... etc
```

### Session 1 (continued): Check Status

```bash
You: /jules-sync

Claude reads ~/.jules-tasks/tasks.json
Claude calls: jules remote list --session
Claude parses output and updates statuses:
  API-001: queued → running (Planning phase)
  AI-001: queued → running (Planning phase)
  ... etc

Claude writes ~/.jules-tasks/tasks.json with new statuses

Output:
  5 running (planning phase)
```

### **Context window ends. You close Claude Code.**

---

### Session 2 (NEW Context Window): Check Progress

```bash
You: /jules-sync

Claude (fresh context, no memory of Session 1):
  → Reads ~/.jules-tasks/tasks.json (finds 5 running tasks)
  → Calls jules remote list --session
  → Updates statuses

Output:
  API-001: running → awaiting_approval (Plan proposed, waiting for your approval)
  AI-001: running → awaiting_approval
  ... etc
```

### Session 2 (continued): Approve Plans in Jules UI

```bash
You visit: https://jules.google.com/session/3726000469766412423

Jules UI shows:
  📋 Plan for API-001: Ingest Endpoint
  [Approve] [Request Changes] buttons

You click: [Approve]
Jules starts implementation...
```

### **Context window ends again.**

---

### Session 3 (NEW Context Window): Review Completed Work

```bash
You: /jules-sync

Claude reads ~/.jules-tasks/tasks.json
Claude calls jules remote list --session

Output:
  API-001: awaiting_approval → completed (implementation done)
  AI-001: awaiting_approval → running
  ... etc

You: /jules-review API-001

Claude:
  → Calls jules remote pull --session 3726000469766412423
  → Downloads diff
  → Reads .claude/skills/code-reviewer/SKILL.md
  → Reviews code against PulsarJS standards
  → Provides structured feedback

Output:
  ✅ LGTM — Ready to merge

You: merge-this

Claude:
  → Updates memory.yaml entries cited in the commit: success_count++
  → Notes task as "review" status
  → Creates PR and merges to staging
```

---

## Common Problems & Solutions

### Problem 1: "I dispatched the same tickets twice!"

**Cause:** You ran `/jules-dispatch` in Session 2 without checking `~/.jules-tasks/tasks.json`

**Solution:**
```bash
# Always check first:
cat ~/.jules-tasks/tasks.json | grep -c "julia_session_id"

# If you see 5 tasks already queued, don't re-dispatch
# If you need to re-dispatch a specific ticket, edit tasks.json manually first
```

### Problem 2: "The prompt didn't include memory hints!"

**Cause:** `.jules/memory.yaml` was empty or missing when you ran dispatch

**Solution:**
```bash
# Verify memory file exists:
ls -la .jules/memory.yaml

# Verify it has content:
wc -l .jules/memory.yaml

# If empty, agents haven't run yet or didn't update it
# This is fine for first run — memory builds over time
```

### Problem 3: "I started reviewing in one window, but context ended. Lost my notes!"

**Cause:** In-progress review notes weren't saved to disk

**Solution:**
- Before context ends, copy your review notes to a temp file:
  ```bash
  cat > .jules/review-API-001-notes.md <<EOF
  [Your review notes here]
  EOF
  ```
- In next window, reference those notes when running `/jules-review` again

### Problem 4: "Jules session is stuck in Awaiting Plan Approval for hours!"

**Cause:** You forgot to approve the plan in Jules UI

**Solution:**
```bash
# Check status:
/jules-sync

# If awaiting_approval, visit the session URL:
echo "Visit: https://jules.google.com/session/3726000469766412423"

# Approve the plan in the UI
# Check status again in 2 minutes:
/jules-sync
```

### Problem 5: "Memory entry says 'agent used this' but they didn't write code for it!"

**Cause:** Memory entry matched the task trigger, so the agent loaded it and acknowledged it, but the implementation didn't require it

**Solution:**
- This is normal. Memory hints are "soft" — agents can ignore them.
- If an entry has high false positive rate (recurrence >> success_count), Memory Curator will flag it for decomposition or archival.

---

## Operational Checklist

### Before Running `/jules-dispatch`

- [ ] Read `docs/ROADMAP.md` (or your backlog file) to see what tickets exist
- [ ] Check `~/.jules-tasks/tasks.json` to see what's already dispatched
- [ ] Verify `.jules/memory.yaml` exists and has entries (optional, but helps)
- [ ] Make sure `AGENTS.md` is up-to-date with current agent list

### Before Running `/jules-sync`

- [ ] Ensure Jules CLI is installed: `which jules`
- [ ] Ensure you're logged in: `jules remote list --repo` (should show repos)
- [ ] No special prep needed — sync is safe to run anytime

### Before Running `/jules-review`

- [ ] Verify session is `completed` status (check `/jules-sync` first)
- [ ] Ensure `.claude/skills/code-reviewer/SKILL.md` exists
- [ ] Clear 30 minutes of focused time for a thorough review

### After Each Session Completes

- [ ] Run `/jules-review` to pull the diff
- [ ] Write review notes to `.jules/review-<TICKET>-notes.md` if rejection
- [ ] Update `.jules/memory.yaml` manually if you spot patterns agents missed (optional)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Claude Code Session (Context Window 1)                          │
│                                                                   │
│  /jules-dispatch docs/ROADMAP.md                               │
│    └→ reads .jules/memory.yaml                                 │
│    └→ ranks memories by relevance                               │
│    └→ injects top-3 into prompts                                │
│    └→ calls: jules new --repo owner/repo "{prompt}"            │
│    └→ writes: ~/.jules-tasks/tasks.json                        │
│                                                                   │
│  Output: 5 sessions queued (IDs in tasks.json)                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Jules API (Google's Servers)                                    │
│                                                                   │
│  Session 3726000469766412423 (API-001)                         │
│    └→ Status: Planning                                          │
│    └→ Cloned repo into fresh VM                                │
│    └→ Read AGENTS.md (auto-loaded)                             │
│    └→ Received prompt with memory hints                        │
│    └→ Proposing plan...                                         │
│                                                                   │
│  Session 14695615951844159660 (AI-001)                         │
│    └→ Status: Planning                                          │
│    └→ ...                                                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Claude Code Session (Context Window 2 — NEW)                    │
│                                                                   │
│  /jules-sync                                                    │
│    └→ reads ~/.jules-tasks/tasks.json                         │
│    └→ calls: jules remote list --session (queries Jules API)   │
│    └→ parses statuses: Planning → awaiting_approval            │
│    └→ updates ~/.jules-tasks/tasks.json                       │
│                                                                   │
│  Output: 5 tasks awaiting approval                              │
│                                                                   │
│  YOU: Visit https://jules.google.com/session/... and approve  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Jules API (Google's Servers)                                    │
│                                                                   │
│  Session 3726000469766412423 (API-001)                         │
│    └→ Status: Awaiting Plan Approval → IN_PROGRESS             │
│    └→ Executing implementation...                              │
│    └→ Running pnpm test && pnpm build                          │
│    └→ Creating PR to feature/API-001-ingest                    │
│    └→ Updating .jules/memory.yaml with recurrence++            │
│    └→ Status: Completed                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Claude Code Session (Context Window 3 — NEW)                    │
│                                                                   │
│  /jules-sync                                                    │
│    └→ Status: completed                                          │
│                                                                   │
│  /jules-review 3726000469766412423                            │
│    └→ downloads diff from Jules API                             │
│    └→ applies .claude/skills/code-reviewer/SKILL.md            │
│    └→ provides feedback                                         │
│                                                                   │
│  YOU: approve or send feedback                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Repository Scope

**Important**: Each repository has its own state file and memory. This prevents cross-repo contamination.

See `docs/REPO_SCOPE_STRATEGY.md` for:
- How state files are named: `~/.jules-tasks/tasks-<REPO_SLUG>.json`
- How repo slug is extracted from git remote
- How memory is scoped per-repo (`.jules/memory.yaml`)
- Cross-repo workflow examples

**Quick reference:**
```bash
# Current repo's state file:
~/.jules-tasks/tasks-$(cd . && git remote get-url origin | sed -E 's|.*[:/]([^/]+)/([^/]+?)(\.git)?$|\1-\2|').json

# For pulsar-infra:
~/.jules-tasks/tasks-darleison-rodrigues-pulsar-infra.json
```

---

## Summary

| Layer | Skill | Persistence | Context Dependent? |
|---|---|---|---|
| Claude | `/jules-dispatch` | `~/.jules-tasks/tasks.json` | YES (reads ROADMAP, memory) |
| Claude | `/jules-sync` | `~/.jules-tasks/tasks.json` | NO (queries API) |
| Claude | `/jules-review` | Local notes (your responsibility) | MEDIUM (pulls from API) |
| Jules | (Agent execution) | `.jules/memory.yaml` in PR | NO (Jules is stateless per session) |

**Golden Rule:** Always check `~/.jules-tasks/tasks.json` before re-running dispatch. It's your source of truth across context windows.

