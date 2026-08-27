# Hazards and Technical Debt

Findings from a full read of all 37 repositories. Ordered by severity.
Everything here is evidenced by a file path — verify before acting, then fix.

---

## P0 — Credential exposure. Rotate now.

### 1. Live production credentials committed in `me-backend-main/.env`

The file is present in the repository snapshot with **populated values**:

| Key | Evidence |
|---|---|
| `MONGODB_URI` | 81 chars — a real connection string |
| `GITHUB_TOKEN` | 95 chars — a GitHub personal access token |
| `GEMINI_API_KEY` | 41 chars — a Google Gemini key |
| `RABBITMQ_URL` | 83 chars — includes credentials |
| `password` / `username` / `host` | discrete DB credentials |

**Actions, in order:**
1. Rotate every one of these secrets at the provider — the MongoDB user, the GitHub PAT, the Gemini
   key, the RabbitMQ credentials. Assume they are compromised.
2. Remove the file from the repository and add `.env` to `.gitignore`.
3. Purge it from git history (`git filter-repo` or BFG) — deleting the file in a new commit does not
   remove it from history.
4. Move the values into Vault, as every other service already does.

A GitHub PAT is the most urgent: depending on its scopes it may grant write access to every
repository in the `MedocHealth` organisation.

### 1b. `env.txt` files committed inside `src/` in at least three more repos

Separate from `me-backend/.env` — these are tracked source files, so `.gitignore` does not help:

| Repo | Path | State |
|---|---|---|
| `Admin-Dashboard-Frontend` | `src/constants/env.txt` | tracked on the current branch |
| `medoc_plus_backend` | `src/utils/constants/env.txt` | tracked on the current branch |
| `docApp-backend` | `src/utils/constants/env.txt` | sanitised by commit `720d321` ("Remove sensitive environment variables") — **the secrets remain in git history** |
| `HPlus-Backend` | — | none on the branch checked; re-verify `main`/`production`/`dev` before declaring it clean |

The backends share one MongoDB + Cloudinary credential set, so one leaked file compromises all of
them. Remediation is the same as §1: rotate, delete, purge history, move to Vault. A sanitising
commit (docApp) is **not** remediation — the values are still one `git log -p` away.

### 2. Live JWTs in `medoc-bruno-api-collections/environments/medoc.bru`

`doc_token` (173 chars), `m_token` (188 chars), `me_token` (180 chars) are populated with real
signed tokens. Blank them, and keep the environment file's token slots empty in source control.

### 3. Signing keystores and key material committed

| File | Risk |
|---|---|
| `DocAssist-main/upload-keystore.jks` | Android app-signing key — leak means someone else can sign builds as you |
| `MedocEUA-master/releasekey.jks` | same |
| `hospital_plus_build-main/assets/packages/encryption_json/assets/keys/auth_key.pem` | key material shipped inside a **web** build — served to every browser |

Keystores belong in a secrets store, injected at CI signing time. The `.pem` in a Flutter web bundle
is publicly readable by design of the platform — treat whatever it protects as compromised.

---

## P1 — Authentication weaknesses

### 4. Hardcoded JWT secret fallbacks

| File | Line | Fallback |
|---|---|---|
| `HPlus-Backend/src/middlewares/verifyTokens.ts` | 24, 78, 118, 139 | `"hplusbackendsecretkey"` |
| `HPlus-Backend/src/middlewares/permissionMiddleware.ts` | 385 | `"hplusbackendsecretkey"` |
| `admin-dashboard-backend/src/middleware/auth.middleware.ts` | 12 | `"your-secret-key"` |
| `admin-dashboard-backend/src/utils/generate.helper.ts` | 46 | `"adminpaneljsontoken"` |
| `compliant-dashboard-backend/src/middleware/auth.middleware.ts` | 11 | `"your-secret-key"` |
| `HPlus-Backend/src/features/auth/ctrl_func.ts` | 52 | `"hplusbackendsecretkey"` |
| `HPlus-Backend/src/utils/cloudinary/cloudinary.config.ts` | 6–7 | **a real Cloudinary `api_key`/`api_secret` pair** — this is a live credential in source, not just a weak fallback; rotate it (P0, see §1b) |
| `HPlus-Backend/src/features/payment/services/phicommerce.service.ts` | 23, 25 | `merchantSecretKey: 'abc'`, plus a hex `aggregatorSecretKey` that looks live — verify with PhiCommerce and rotate |

These are exactly what `claude_md/scripts/check-invariants.sh` greps for — run it in any service
repo to get the current list rather than trusting this table.

If the env var is ever unset — a misconfigured container, a missing Vault key, a new environment —
the service silently signs and verifies with a secret that is public in the source tree. That is a
complete authentication bypass: anyone can forge a token for any user in any tenant.

`HPlus-Backend/suggestions/SECURITY_AUDIT.md` already identifies this and prescribes the fix. It has
not been applied.

**Fix:** adopt the `EnvConfig` singleton (see `backend-patterns.md` §Environment validation). Required
keys missing → process refuses to start. Then the fallback has no reason to exist.

```ts
const JWT_SECRET = process.env.JWT_SECRET_KEY;
if (!JWT_SECRET) throw new Error("CRITICAL: JWT_SECRET_KEY must be set");
```

### 5. Permissive defaults

- `medoc-auth-service` — `CORS_ORIGINS` empty string means **allow all origins**, documented as a
  "backward-compatible default". Set explicit origins in production.
- Terraform `nsg-main` — SSH (22) open to `source_address_prefix = "*"`. Restrict to a bastion or
  known ranges.
- `helmet` is actually applied in only three services (`HPlus/src/server.ts`, `auth-service/src/app.ts`,
  `patient-service/src/server.ts`). `admin-dashboard-backend` lists it as a dependency but never mounts
  it. Add it everywhere, and mount it where it is already installed.
- `express-rate-limit` is not universal, and where present is often global rather than targeted at
  auth endpoints.

---

## P2 — Correctness and maintainability risk

### 6. Testing is close to absent

**32 test files across ~665,000 lines of TypeScript.**

| Repo | LOC | Tests |
|---|---|---|
| `HPlus-Backend` | 128,123 | **1** |
| `Medoc-Main-Website` | 72,791 | 0 |
| `Medoc-Care-Dashboard-Frontend` | 61,939 | 0 |
| `medoc_plus_backend` | 51,375 | 1 |
| `compliant-dashboard-backend` | 39,408 | 0 |

Only `msf-core` (5 tests / 20 files) and `Support-Dashboard-Backend` (10) have real suites. For a
clinical system under NABH scrutiny, the billing, IPD, prescription and RBAC paths are the ones that
most need coverage and currently have none.

This is not fixable in one pass. The workable rule: **new business logic ships with tests**, and any
bug fix in a critical path lands with a regression test.

### 7. Type-safety erosion

`strict: true` in all 25 TypeScript repos — undermined by **~5,900 `any` usages**.

| Repo | `any` |
|---|---|
| `HPlus-Backend` | 1,379 |
| `admin-dashboard-backend` | 963 |
| `compliant-dashboard-backend` | 740 |
| `medoc_plus_backend` | 695 |

`msf-core` has **zero**. The newest services (`abdm` 16, `auth-service` 20, `whatsapp` 22) are close
to clean. The trend is right; the legacy is heavy.

### 8. Logging hygiene and PHI leakage risk

**~1,850 `console.log`** calls — `HPlus-Backend` 773, `admin-dashboard-backend` 277,
`medoc_plus_backend` 163. `HPlus-Backend/src/db/db.ts` logs the MongoDB URI at startup
(`console.log("MongoDB URI:", MONGODB_URI)`), which prints credentials into container logs.

Given the PHI list in `docApp-backend/PII.txt`, every unreviewed `console.log` of a patient object is
a potential DPDP disclosure. Route logging through `winston`, redact identifiers, and remove the URI log.

### 9. Response helper under-adopted

`HttpResponse` exists and is good — but `HPlus` uses it 207 times against 2,719 raw
`res.status().json({ success: ... })`; `medoc_plus` 6 times against 1,903; `docApp`,
`admin-dashboard`, `Velocity`, `upload-service` zero. The envelope shape is consistent, so this is
maintainability rather than a client-visible break. Use the helper in new code.

### 10. Duplicated crypto modules

`encryption/` and `kms/` are copied verbatim across `me-backend`, `docApp-backend` and
`medoc_plus_backend` — their READMEs instruct developers to *"just copy this folder"*. A
vulnerability fix must be applied three times, and drift is undetectable.

**Fix:** extract to `@medoc-health/crypto-core`, following the `msf-core` model (pure, tested, versioned).

### 11. Version fragmentation

Express 4.18→5.2 · MongoDB driver 6.6→7.2 · Mongoose 8.13→9.4 · Zod 3.23→4.3 · TypeScript 5.4→6.0 ·
Next 15.5→16.3 · Tailwind 3.4→4 · React 18→19.2 · Jest 29→30.

Every one of these spans a major version with breaking changes. Shared code and copied patterns do
not transfer safely between repos. There is no dependency-alignment mechanism.

**`MedocEUA` is pinned to Dart `>=2.19.0 <3.0.0`** — pre-Dart-3, so it cannot build on a current
Flutter toolchain without a migration.

### 12. Port collisions

`7001` — Campaign, Main-Website-Backend, Outreach · `6001` — Velocity, Support ·
`5000` — HPlus, medoc_plus, docApp · `4000` — docApp, patient-service · `3000` — me-backend, whatsapp.

Running the platform locally requires per-service `PORT` overrides. A documented port registry would remove the friction.

### 13. Asset bloat

`Medoc-Velocity-Frontend` is **355 MB**; ~354 MB of it is badge PNGs at 12–17 MB each, **duplicated**
between `src/assets/badges/` and `public/badges/`. `Medoc-Main-Website` carries ~220 MB in `src/`.

Two compiled Flutter web builds are committed as repos: `hospital_plus_build` (58 MB, 13 MB
`main.dart.js`) and `mplus-web-build` (45 MB, 9.4 MB). These are deploy artifacts in source control.

Compressing the badges to SVG or optimised PNG would reclaim well over 300 MB and make the repo
clonable at normal speed.

### 14. Architectural inconsistency

- Two backend architectures (feature-sliced and layered MVC) with no rule for which to use.
- Mongoose and the native driver coexist; six services still carry Mongoose.
- Three Flutter state-management approaches across four apps (Provider, Riverpod, GetX).
- Two frontend auth models (HttpOnly cookie vs Bearer) — this one is a *deliberate* divergence with
  an ADR behind it, unlike the others.
- Path aliases differ: `@/*` in most repos, bare `*` in `HPlus`.

None of this is urgent, but each instance costs context on every cross-repo task.

### 15. Documentation drift

Documentation quality is bimodal. Excellent: `medoc-abdm-dashboard-backend/brain/`,
`medoc-auth-service/integration.md`, `Medoc-Care-Dashboard-Frontend/docs/` (with ADRs),
`msf-core/README.md`, the per-feature `Readme.md` files. Absent: `HPlus-Backend/README.md` is two
lines for a 128k-LOC service; `me-backend/README.md` is one line.

`HPlus-Backend/suggestions/` contains a security audit, performance analysis, code-improvement notes
and an implementation roadmap — **already written, not yet acted on**. Read them before planning work
in that repo.

---

## Suggested sequencing

| When | Work |
|---|---|
| **Immediately** | Rotate the `me-backend/.env` credentials **and the `env.txt` secrets (§1b) — including the shared Mongo + Cloudinary set**; blank the Bruno tokens; purge all from history |
| **This week** | Remove all hardcoded JWT fallbacks; add `EnvConfig` boot validation to the affected services; wire `check-invariants.sh` into husky/CI so the fallbacks cannot return |
| **This month** | Extract `@medoc-health/crypto-core`; add `helmet` + targeted auth rate limiting everywhere; lock down the SSH NSG rule and `CORS_ORIGINS` |
| **This quarter** | Test coverage on billing / IPD / prescription / RBAC; optimise the Velocity assets; publish a port registry; agree one backend architecture for new services |
| **Ongoing** | Retire `any` and `console.log` in files you touch; keep feature `Readme.md`s and the Bruno collection current |
