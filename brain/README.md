# brain/

Deep reference for the Medoc Health workspace. The entry point is `../CLAUDE.md` — read that first;
it is short by design and loads every session. These files are for when you need depth on one area.

| File | Read it when |
|---|---|
| [`service-map.md`](service-map.md) | You need to know what a repo is, what it talks to, which port it uses, or how big and healthy it is |
| [`data-layer.md`](data-layer.md) | You are touching MongoDB — tenant scoping, collections, transactions, connection lifecycle, audit fields |
| [`security.md`](security.md) | Auth, JWT audiences, RBAC hashes, PHI encryption, ABDM crypto, transport hardening |
| [`backend-patterns.md`](backend-patterns.md) | You are writing or reviewing Express/TypeScript service code |
| [`frontend-patterns.md`](frontend-patterns.md) | You are writing Next.js/React or Flutter code |
| [`delivery.md`](delivery.md) | Build, Docker, Jenkins, Vault, Terraform, git workflow, API contracts |
| [`hazards.md`](hazards.md) | **Before touching auth, secrets, or anything in the P0/P1 list** — and when planning remediation work |

## Keeping this current

This brain was derived by reading all 37 repositories directly — package manifests, source, docs,
pipelines and infrastructure. It reflects the workspace as of **2026-08-27**.

It will drift. When you learn something that contradicts a file here, fix the file in the same change
as the code. Specifically:

- A new service → add it to `service-map.md` (row, port, wiring).
- A new architectural decision → record it as an ADR in the owning repo, and summarise it here.
- A hazard fixed → strike it from `hazards.md` rather than leaving it to rot.
- A version bump that crosses a major → update the version table in `../CLAUDE.md` §3.

The model to imitate is `medoc-abdm-dashboard-backend/brain/` — dense, machine-readable, honest about
what is a stub and what is complete.
