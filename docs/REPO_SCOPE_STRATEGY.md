# Repository Scope Strategy for Jules Skills

**Status**: Design | **Updated**: 2026-03-20 | **For**: Operators & Developers

---

## Problem: Cross-Repo Contamination

If you work on multiple repos and run `/jules-dispatch` in each, the global skills need to know:
- Which repo's backlog to read?
- Where to store task state?
- Which memory.yaml to use?

**Bad approach**: Single `~/.jules-tasks/tasks.json` shared across all repos → tasks from pulsar-infra would mix with tasks from other projects.

**Good approach**: Scope state files by repo slug.

---

## Solution: Repo-Scoped State Files

### State File Naming

```
~/.jules-tasks/tasks-<REPO_SLUG>.json
```

Where `REPO_SLUG` is derived from `git remote get-url origin`:

| Git Remote | Repo Slug | State File |
|---|---|---|
| `git@github.com:darleison-rodrigues/pulsar-infra.git` | `darleison-rodrigues-pulsar-infra` | `~/.jules-tasks/tasks-darleison-rodrigues-pulsar-infra.json` |
| `git@github.com:darleison-rodrigues/pulsarjs.git` | `darleison-rodrigues-pulsarjs` | `~/.jules-tasks/tasks-darleison-rodrigues-pulsarjs.json` |
| `https://github.com/owner/repo.git` | `owner-repo` | `~/.jules-tasks/tasks-owner-repo.json` |

### Extraction Logic

```bash
# From git remote
REMOTE_URL=$(git remote get-url origin)

# Extract owner/repo
# Handle both ssh (git@github.com:owner/repo.git) and https (https://github.com/owner/repo.git)
REPO_SLUG=$(echo "$REMOTE_URL" | sed -E 's|.*[:/]([^/]+)/([^/]+?)(\.git)?$|\1-\2|')

# Example:
# git@github.com:darleison-rodrigues/pulsar-infra.git
# → darleison-rodrigues-pulsar-infra

# State file
STATE_FILE="$HOME/.jules-tasks/tasks-${REPO_SLUG}.json"
```

---

## Skill Behavior with Scoping

### `/jules-dispatch`

**Before dispatch:**
```bash
1. Determine repo: REPO_SLUG=$(extract from git remote)
2. Set state file: STATE_FILE=~/.jules-tasks/tasks-${REPO_SLUG}.json
3. Check if tasks already dispatched:
   if [ -f "$STATE_FILE" ] && grep -q "API-001" "$STATE_FILE"; then
     echo "API-001 already dispatched (session: ...)"
     skip
   fi
4. Read backlog from THIS repo: docs/ROADMAP.md
5. Read memory from THIS repo: .jules/memory.yaml
6. Dispatch with --repo $REPO_SLUG
7. Write task state to $STATE_FILE (only this repo's tasks)
```

**State file format:**
```json
{
  "repo": "darleison-rodrigues/pulsar-infra",
  "repo_slug": "darleison-rodrigues-pulsar-infra",
  "created_at": "2026-03-20T15:45:00Z",
  "tasks": [
    {
      "id": "API-001",
      "title": "Ingest Endpoint",
      "jules_session_id": "3726000469766412423",
      "status": "queued",
      "branch": "feature/API-001-ingest"
    }
  ]
}
```

### `/jules-sync`

**Before sync:**
```bash
1. Determine repo: REPO_SLUG=$(extract from git remote)
2. Set state file: STATE_FILE=~/.jules-tasks/tasks-${REPO_SLUG}.json
3. Load tasks from $STATE_FILE (only this repo)
4. For each task with jules_session_id, query: jules remote list --session
5. Match session IDs and update statuses in $STATE_FILE
6. Save only this repo's state
```

### `/jules-review`

**Before review:**
```bash
1. Determine repo: REPO_SLUG=$(extract from git remote)
2. Set state file: STATE_FILE=~/.jules-tasks/tasks-${REPO_SLUG}.json
3. Load task from $STATE_FILE by ID (e.g., API-001)
4. Get jules_session_id from task
5. Pull diff: jules remote pull --session <ID>
6. Review against .claude/skills/code-reviewer/SKILL.md (repo-specific)
7. Provide feedback (in-repo or via Jules API)
```

---

## Cross-Repo Workflow Example

### Repo 1: pulsar-infra

```bash
cd ~/pulsar-infra

# git remote: darleison-rodrigues/pulsar-infra
# State file: ~/.jules-tasks/tasks-darleison-rodrigues-pulsar-infra.json

/jules-dispatch
# Creates: ~/.jules-tasks/tasks-darleison-rodrigues-pulsar-infra.json
# Dispatches: 5 Phase 1 tickets
```

### Switch to Repo 2: pulsarjs

```bash
cd ~/pulsarjs

# git remote: darleison-rodrigues/pulsarjs
# State file: ~/.jules-tasks/tasks-darleison-rodrigues-pulsarjs.json

/jules-sync
# Reads: ~/.jules-tasks/tasks-darleison-rodrigues-pulsarjs.json (different file!)
# Shows: status for pulsarjs tasks only
# pulsar-infra tasks are NOT visible (correct!)
```

### Return to pulsar-infra

```bash
cd ~/pulsar-infra

/jules-sync
# Reads: ~/.jules-tasks/tasks-darleison-rodrigues-pulsar-infra.json
# Shows: status for pulsar-infra tasks only
```

---

## Backward Compatibility

If you have existing `~/.jules-tasks/tasks.json` from before scoping was introduced:

```bash
# Detect current repo slug
REPO_SLUG=$(cd pulsar-infra && git remote get-url origin | sed -E 's|.*[:/]([^/]+)/([^/]+?)(\.git)?$|\1-\2|')

# Migrate old file to scoped location
if [ -f ~/.jules-tasks/tasks.json ] && [ ! -f ~/.jules-tasks/tasks-${REPO_SLUG}.json ]; then
  mv ~/.jules-tasks/tasks.json ~/.jules-tasks/tasks-${REPO_SLUG}.json
  echo "✅ Migrated to scoped state file"
fi
```

---

## Memory Scoping

Memory is **per-repo**, stored in `.jules/memory.yaml`:

| Repo | Memory File | Scope |
|---|---|---|
| pulsar-infra | `.jules/memory.yaml` | Only used by this repo's agents |
| pulsarjs | `.jules/memory.yaml` | Only used by this repo's agents |

Memory **does NOT cross repos** — each has its own patterns, findings, etc.

---

## Operational Rules

1. **Always know your repo**: `pwd` + check git remote before running a skill
2. **State files are auto-generated**: Don't create them manually
3. **Mix-ups are prevented by filename**: `tasks-darleison-rodrigues-pulsar-infra.json` is clearly for pulsar-infra
4. **Switch freely**: Working on multiple repos? Just `cd` to each and run skills. Correct state file is auto-loaded.

---

## Summary

| Item | Per-Repo? | Location | Scope Mechanism |
|---|---|---|---|
| State (tasks) | ✅ YES | `~/.jules-tasks/tasks-<SLUG>.json` | Slug from git remote |
| Memory (patterns) | ✅ YES | `.jules/memory.yaml` | In-repo file |
| Findings (audit) | ✅ YES | `.jules/findings.yaml` | In-repo file |
| Code patterns | ✅ YES | `.claude/skills/` | In-repo folder |

**Golden rule**: Run skills from the repo directory you want to work on. The skill reads `git remote` and handles scoping automatically.

