# Mistake ledger

**The escalation ladder: mistake → row here → rule → hook.**

When an agent repeats a mistake, or a reviewer corrects the same behaviour twice, append a row
**in the same session, not batched at the end of the week**. Batching is how the detail gets
lost. This repo is shared: a mistake recorded from one person's session prevents it in
everyone's.

When a row reaches ~4–5 fires, promote it:

| Where it goes | When |
|---|---|
| `scripts/check-invariants.sh` + the pre-commit hook | the mistake is mechanically detectable — **always prefer this** |
| `managed-policy/CLAUDE.md` | it applies in every repo and cannot be automated |
| `repos.yaml` → a repo's `notes:` or `hazards:` | it only bites in specific repos |
| `scripts/rules-content.mjs` | it only bites in specific kinds of file |

Prompt rules fail silently when context is busy. Hooks do not. A row that *could* become a
hook and hasn't is unfinished work.

## How to write a row

Name the **detection signal**, not just the mistake — the next person needs to recognise it
mid-session, not read it afterwards. "Check the schema" is useless; "wrote a query naming a
column I never read from the schema" is actionable.

## Ledger

| Pattern | Detection signal | Times | Promoted to | Last |
|---|---|---|---|---|
| Implemented in a dormant twin instead of the live repo | You are in a repo whose CLAUDE.md opens with ⛔ STOP, or whose name closely resembles another | — | per-repo `CLAUDE.md` header (generated) | 2026-09-01 |
| Hardcoded fallback on a secret env var | `process.env.X_SECRET \|\| "…"` | — | `check-invariants.sh` + pre-commit | 2026-09-01 |
| Direct `client.db()` outside `src/db/` | tenant handle obtained without `getDbName()` validation | — | `check-invariants.sh` + pre-commit | 2026-09-01 |
| PHI or a connection string in `console.log` | a log line naming a field from `docApp-backend/PII.txt` | — | `check-invariants.sh` + pre-commit | 2026-09-01 |

_The four rows above are seeded from hazards already proven in this codebase — they are the
reason the hook exists. Add real rows below as they happen._
