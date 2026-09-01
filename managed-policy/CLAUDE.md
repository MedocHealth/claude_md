# Medoc Health — non-negotiable engineering rules

<!-- Deployed to every developer machine by claude_md/scripts/bootstrap.sh.
     Managed-policy CLAUDE.md loads in EVERY repository on the machine and cannot be
     excluded by user settings. Keep this file SHORT and STABLE: it is deployed, not
     pulled, so updating it means re-running bootstrap on 9 machines. Anything that
     changes more than a few times a year belongs in the repo's own CLAUDE.md instead. -->

The rules below apply when working in a **Medoc Health repository** (a repo under the
MedocHealth organisation, or any repo whose CLAUDE.md names a Medoc product). They do not
apply to personal or unrelated projects on this machine.

## The rules, ranked. When they conflict, the lower number wins.

1. **Never leak a tenant.** Medoc is database-per-hospital, not a shared collection with a
   tenant column. Every query is scoped to one hospital's database. Go through
   `getCollection()` / `getDbName()`; never call `client.db(...)` directly. The `hospitalId`
   comes from the **verified JWT** — never from `req.body`, `req.params` or `req.query`.
   A missing `hospitalId` is a data breach, not a bug.

2. **Never commit a secret.** No `.env`, token, keystore, connection string, PEM or
   `env.txt`. Secrets come from HashiCorp Vault via Jenkins. If you find one already
   committed, report it — do not quietly delete it, because history still holds it and it
   still needs rotating.

3. **Never invent a fallback secret.** `process.env.JWT_SECRET || "dev-secret"` is an
   authentication bypass: if the env var is unset in production, every token becomes
   forgeable. Fail fast at boot instead.

4. **Never log PHI.** No patient name, ID, diagnosis, contact number, prescription or lab
   result in `console.log`, error messages, or monitoring payloads. India's DPDP Act treats
   every patient field as regulated. The canonical field list is `docApp-backend/PII.txt`.

5. **Never trust the client for derived or authorization data.** Recompute server-side.
   Permissions come from the token plus the RBAC map, never from the request body.

6. **Never hand-edit `package-lock.json`.** Use `npm ci`. A husky hook blocks the commit
   and `enforce-ci.js` blocks the install.

7. **Never assume a framework version.** Versions differ wildly per repo — Express 4.18→5.2,
   Mongoose absent→9.4, Next 15.3→16.3, Dart 2.18→3.7. Read the repo's `package.json` or
   `pubspec.yaml` before writing code that depends on a version.

## Two workspace facts that cause the most wasted work

- **Many products have 2–4 near-identically-named repos and only one is live.** Before
  writing anything, read the repo's own `CLAUDE.md` — a dormant repo says so at the very
  top. Implementing in a dead twin is the single most common way to waste a session here.
- **These repos are heavily coupled.** Before finishing, ask *"which other repo reads or
  writes what I just touched?"* Each repo's `CLAUDE.md` lists its specific obligations.
  Either make the linked change in the same task, or say explicitly that it is out of scope.

## Honesty

Large parts of this codebase are under-tested (~32 test files across ~665k lines), and
several repos declare `"test": "jest"` while shipping no jest config — a green-looking run
there means nothing. If you cannot verify a change, say so plainly rather than implying it
is covered.

Full workspace map, deep references and the mistake ledger: the **`claude_md`** repository.
