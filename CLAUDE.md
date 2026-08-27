# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Medoc Health Engineering Brain

Universal context for every repository under this workspace. Read this first, every session.
Deep references live in `brain/`. Load them on demand, not by default.

| Need | Read |
|---|---|
| What each repo is, ports, ownership | `brain/service-map.md` |
| Multi-tenant DB rules, collections, transactions | `brain/data-layer.md` |
| Auth, tokens, RBAC, PHI encryption | `brain/security.md` |
| Backend conventions + copy-paste patterns | `brain/backend-patterns.md` |
| Next.js / React / Flutter conventions | `brain/frontend-patterns.md` |
| Build, Docker, Jenkins, Vault, deploy | `brain/delivery.md` |
| Known debt, hazards, live incidents | `brain/hazards.md` |

---

## 1. What we are building

Medoc Health is a **multi-tenant hospital operating system for the Indian healthcare market**.
One platform, many hospitals, many personas — each with its own app.

| Product | Persona | Repos |
|---|---|---|
| **Hospital+ (Axon)** | Hospital staff, doctors, admins | `HPlus-Backend`, `hospital-plus-frontend`, `hospital_plus_build` |
| **Medoc+ (Vigil)** | Medoc super-admins, operators, support | `medoc_plus_backend`, `MedocPlus-Frontend-V2`, `mplus-web-build` |
| **DocApp / DocAssist** | Doctors, voice-driven prescribing | `docApp-backend`, `DocAssist` |
| **ME (Medoc EUA)** | Patients / end users | `me-backend`, `MedocEUA` |
| **Care Dashboard** | NABH accreditation & compliance | `compliant-dashboard-backend`, `Medoc-Care-Dashboard-Frontend` |
| **ABDM Dashboard** | ABHA / national health ID compliance | `medoc-abdm-dashboard-{backend,frontend}` |
| **Admin / Support / Outreach / Campaign / Velocity** | Internal ops, sales, CRM, sprint tracking | matching `*-Backend` + `*-Frontend` pairs |

**Regulatory context that constrains every decision:**
- **ABDM / ABHA** — India's national digital health ID. Government API contracts; encryption of identifiers is mandatory.
- **NABH 6th Edition (Jan 2025)** — hospital accreditation. The Care Dashboard exists to produce auditable evidence.
- **DPDP Act** — Indian data protection. Patient data is PHI. Treat every patient field as regulated.

> If a change touches patient data, assume it is auditable, encrypted, and tenant-scoped until proven otherwise.

---

## 2. The rules that are never negotiable

These are ranked. When they conflict, the lower number wins.

1. **Never leak a tenant.** Every query is scoped to one hospital's database. A missing `hospitalId` is a data breach, not a bug. See §4.
2. **Never commit a secret.** No `.env`, no token, no keystore, no connection string. Secrets come from **HashiCorp Vault** via Jenkins. See §8.
3. **Never invent a fallback secret.** `process.env.JWT_SECRET || "something"` is an authentication bypass. Fail fast at boot instead.
4. **Never log PHI.** No patient name, ID, diagnosis, or contact number in `console.log`, error messages, or monitoring payloads.
5. **Never hand-edit `package-lock.json`.** Use `npm ci`. A husky hook blocks the commit; `enforce-ci.js` blocks the install.
6. **Never trust the client for derived or authorization data.** Recompute server-side. Permissions come from the token + RBAC map, never from the request body.
7. **Never assume the framework version.** Versions differ wildly per repo. See §3.

Rule 5 is already enforced deterministically (husky + `enforce-ci.js`). Rules 1, 3 and 4 should be
too — `scripts/check-invariants.sh` in this repo greps for direct `.db()` calls, `process.env.X || "…"`
fallbacks, and `console.log` of known PHI fields. Wire it into each service's `.husky/pre-commit` or
CI; a prompt rule alone fails silently when context is busy, a hook doesn't.

---

## 3. Read the versions before you write the code

There is **no single stack version** across this workspace. Assuming one is the most common
source of broken code here. Check `package.json` / `pubspec.yaml` first, every time.

| Dependency | Range in play | Why it bites |
|---|---|---|
| **Express** | 4.18 → 5.2 | v5 changes async error propagation, `req.query` is a getter, wildcard routes differ |
| **MongoDB driver** | 6.6 → 7.2 | v7 removes callback APIs and changes some type signatures |
| **Mongoose** | 8.13 → 9.4 (and absent in newer services) | newer services use the **native driver only** — do not add Mongoose |
| **Zod** | 3.23 → 4.3 | v4 rewrote error formatting and `.parse` internals |
| **TypeScript** | 5.4 → 6.0 | v6 tightens inference |
| **Next.js** | 15.5 → 16.3 | v16 has breaking App Router / config changes |
| **Tailwind** | 3.4 → 4.x | v4 is CSS-first config, no `tailwind.config.ts` |
| **React** | 18 → 19.2 | 19 adds the compiler; some repos enable `babel-plugin-react-compiler` |
| **Jest** | 29 → 30 | |
| **Node (Docker)** | 24.14.1 | pinned via `ARG NODE_VERSION` |
| **Dart SDK** | `>=2.19 <3.0` (MedocEUA) → `^3.7.2` (DocAssist) | MedocEUA is **pre-Dart-3** and will not build on a modern toolchain |

Three Next.js repos — `Medoc-Care-Dashboard-Frontend`, `Medoc-Velocity-Frontend`, `medoc-abdm-dashboard-frontend` — ship an `AGENTS.md` saying *"This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before writing code."* Honour it. Each also has a repo-local `CLAUDE.md` whose entire content is `@AGENTS.md`, so the rule loads automatically when you work inside that repo.

---

## 4. Multi-tenancy — the single most important mechanic

**Database-per-hospital.** Not a shared collection with a tenant column. A whole separate database.

```
hos_XXXXXX_db     one physical MongoDB database per hospital
MedocOne_DB       cross-tenant platform data
MedocGlobal_DB    hospital registry (source of truth for valid tenants)
Notification_DB   notification fan-out
```

Every data access goes through the same helper. Never call `client.db(...)` directly.

```ts
import { getCollection } from "@/db/db";
import { ECollectionName, EDBName } from "@/configs/schemaConfig";

// Tenant-scoped — dbName comes from the authenticated token, NEVER from the request body
const patients = await getCollection<IPatient>(ECollectionName.PATIENT_LIST, hospitalId);

// Platform-scoped
const hospitals = await getCollection<IHospital>(ECollectionName.HOSPITALS, EDBName.MedocGlobalDB);
```

`getDbName()` validates the tenant before returning a handle: the id must match `hos_` + 6 chars,
and must exist in the cached registry (or be confirmed newly-added against `MedocGlobal_DB`).
An unknown tenant throws `DBNameError`. **This validation is the tenant boundary — do not bypass it.**

Rules:
- Collection names come from the `ECollectionName` enum. Never a string literal.
- Database names come from `EDBName` or a validated `hospitalId`. Never a string literal.
- The `hospitalId` is read from the **verified JWT**, never from `req.body` or `req.params`.
- Multi-document writes use `withTransaction()` — it retries transient errors with backoff.
- Aggregations set `maxTimeMS` (`MONGO_AGG_MAX_TIME_MS = 25_000`).
- Connections are lazily opened and idle-closed after 10 minutes. Long watchers must call `startActiveTask()` / `stopActiveTask()` or the pool will close under them.

---

## 5. Authentication and authorization

**`medoc-auth-service` is the identity authority.** It signs RS256 JWTs and publishes
`/.well-known/jwks.json`. Other services verify locally against JWKS — they do not call the auth service per request.

- User ids are namespaced per app: `username@axon` (Hospital+), `username@vigil` (Medoc+).
- The **audience claim** is the authorization gate, not a formality:
  `auth_service_token` (normal session), `set_token` (first-login password set),
  `forgot_token` (reset), `axon_service_token`, `vigil_service_token`.
  A `set_token` must never be accepted on a business endpoint.
- Password policy: ≥8 chars, upper + lower + digit + special. 5 failed attempts → 30-minute lockout. Passkeys are one-time and expire.
- Frontends differ deliberately: **Care Dashboard uses HttpOnly cookies** (`withCredentials: true`, rehydrate via `GET /auth/me`); older dashboards use `Authorization: Bearer`. Follow the repo you are in — do not "harmonise" one into the other without a decision record.

**RBAC is hash-based.** Routes are hashed into a `route-hash-map.json`; a role holds an array of
permission hashes; wildcard patterns grant module- or submodule-level access. Permissions are loaded
into Redis at boot.

> Adding a route means regenerating the hash map. A route with no hash returns **404 by design** (`routeNotFoundHandler`) — if a new endpoint 404s, the hash map is stale, not the router.

PHI encryption: `AES-256` for identifiers and clinical text, `SHA-256` for reference numbers,
tokenisation for `doctorId`. The canonical field list is in `docApp-backend/PII.txt`. The
`encryption/` and `kms/` modules are **copied between services by design** — if you fix one, fix all.

---

## 6. How backend code is organised

Two architectures coexist. **Match the repo you are in; do not migrate one to the other opportunistically.**

**A — Feature-sliced** (`HPlus`, `medoc_plus`, `docApp`, `compliant-dashboard`)
```
src/features/<domain>/
  <domain>Controller.ts   <domain>Routes.ts   <domain>Model.ts
  models/  validations/  utils/  Readme.md
```
Large domains nest sub-features (`ipd/vitals/`, `ipd/ward/`). Each feature carries its own `Readme.md` — keep it current; it is often the only spec.

**B — Layered MVC** (`admin-dashboard`, `Velocity`, `Support`, `Outreach`, `auth-service`, `abdm`)
```
src/  routes/ → controllers/ → services/ → repositories/ → models/
      middleware/  config/  utils/  errors/  integrations/
```

Shared to both:
- **Controllers** validate input, call services, format the response. No business logic, no direct DB access in mature code.
- **Errors are thrown, never returned.** Use the typed classes; a single `errorHandler` renders them.
- **Responses use one envelope**: `{ success, message, data, pagination? }`.
- `HttpError` / `HttpResponse` (the `HPlus` implementations) are the reference. Prefer them over hand-rolled `res.status().json()`.
- Env is validated at boot through an `EnvConfig` singleton that throws on a missing key (`auth-service`, `whatsapp-delivery-service` are the reference implementations).
- Path aliases are inconsistent: `@/*` in most repos, bare `*` in `HPlus`. Check `tsconfig.json`.

**`@medoc-health/msf-core` is the exemplar of this codebase.** Pure TypeScript, zero IO, fully
tested, precisely documented. When you need a model for how to write a new shared module, read it.

---

## 7. Commands

**Nothing in this workspace runs as-is.** No repo has `node_modules` installed, and there is **no `.env.example` anywhere** — required env keys must be read out of the code (see the `EnvConfig` singleton in `medoc-auth-service-main/src/config/env.ts`) or pulled from Vault.

### Install

```bash
npm ci          # npm install is blocked by scripts/enforce-ci.js (preinstall) in 12 repos
```

`medoc-auth-service` is the one exception: it has **no `package-lock.json`, so `npm ci` fails there.** Use `npm install`, then generate its RS256 keypair before first boot — `PRIVATE_KEY_PATH` and `PUBLIC_KEY_PATH` are required env keys and the service throws at boot without them:

```bash
npm run generate:keys
```

### Run and build — four families, check which one you are in

| Family | Repos | dev | build → output | start |
|---|---|---|---|---|
| tsup + `tsx watch` | `docApp`, `medoc_plus`, `auth-service`, `upload-service`, `abdm-backend`, `whatsapp-delivery`, `patient-service` | `npm run dev` | `npm run build` → `dist/*.mjs` | `npm start` |
| tsup + `nodemon -r tsconfig-paths/register` | `admin-dashboard`, `compliant-dashboard`, `Campaign`, `Outreach`, `Support`, `Velocity`, `Main-Website-Backend` | `npm run dev` | `npm run build` → `dist/` | `npm start` |
| `tsc` (legacy) | `HPlus-Backend`, `me-backend` | `npm run dev` | `npm run build` → `build/app.js` | `npm start` |
| Next.js frontends | all `*-Frontend`, `Medoc-Main-Website`, `Medoc-One-Frontend` | `npm run dev` | `npm run build` | `npm start` |

- `HPlus-Backend`'s `dev` runs `npm run initialize` first (`npx ts-node src/initializer.ts`) — it seeds/derives state before the server starts. Do not skip it.
- `me-backend`'s `build` is `tsc --build && copy .env build\` — **`copy` is a Windows shell builtin; this build step fails on macOS/Linux.** Run `npx tsc --build` and copy the env file yourself.
- `docApp-backend` ships a separate `npm run dev:mac` (`tsx` without `watch`) because the watch mode misbehaves there.
- Flutter apps (`DocAssist`, `hospital-plus-frontend`, `MedocEUA`, `MedocPlus-Frontend-V2`): `flutter pub get` → `flutter run`. `MedocEUA` is pinned pre-Dart-3 (§3) and will not build on a current toolchain.

### Typecheck

`npm run ts.check` exists in **only 6 repos** — `admin-dashboard`, `compliant-dashboard`, `Campaign`, `Outreach`, `Main-Website-Backend`, `msf-core`. Everywhere else run it directly:

```bash
npx tsc --noEmit -p tsconfig.json
```

### Test

16 repos declare `"test": "jest"`, but **only 12 ship a Jest config.** The four that do not are `HPlus-Backend`, `compliant-dashboard-backend`, `medoc-abdm-dashboard-backend`, and `medoc-auth-service` — in those, `npm test` is not runnable as written (`compliant-dashboard` and `auth-service` do not even have `ts-jest` installed; `HPlus-Backend` has `ts-jest` but never wires it, so its single test file at `src/features/webSockets/test/telemedicineIntegration.test.ts` cannot execute). Wire a config before claiming a test passes.

```bash
npx jest src/path/to/file.test.ts     # one file
npx jest -t "renders the ward list"   # one case by name
npx jest --watch                      # HPlus also exposes npm run test:watch / test:coverage
flutter test test/foo_test.dart --plain-name "..."   # Flutter
```

Per-repo quirks that will waste your time:
- **`msf-core`** matches only `**/__tests__/**/*.test.ts` under `src/` — a `*.test.ts` outside a `__tests__` folder is **silently skipped**, not failed.
- **`me-backend`** needs `jest --runInBand --forceExit` (its own `npm test` includes them); it leaks handles otherwise.
- **`whatsapp-delivery-service`** compiles tests through `tsconfig.test.json`, not `tsconfig.json`.
- **`Support-Dashboard-Backend` has the most real tests (10)** plus `src/test-setup.ts` and an `@/` → `src/` `moduleNameMapper`. It is the scaffold to copy for a new backend test suite — `msf-core` is the reference for the code under test, but this is the reference for the harness.

### Audit

```bash
npm run audit   # npm audit --omit=dev --audit-level=critical — present in 14 repos; the Docker build runs it too and fails on critical
```

---

## 8. Delivery

- **Build**: `tsup` (most services, ESM `dist/*.mjs`) or `tsc` (`HPlus`, `me-backend`, `build/`). Next.js repos use `next build`.
- **Install**: `npm ci` only. `npm install` is blocked by `scripts/enforce-ci.js` (preinstall) in 12 repos, and lockfile commits are blocked by a husky `pre-commit` hook.
- **Docker**: multi-stage, pinned `NODE_VERSION=24.14.1`, `npm ci --ignore-scripts`, `npm audit --audit-level=critical` in the build stage, non-root `USER node`, `HEALTHCHECK` hitting `/health`, exec-form `CMD` so PID 1 receives signals. Copy this shape for any new service.
- **Deploy**: Jenkins → SSH to an Azure VM → clone → **unseal Vault, pull secrets, write `.env`** → build → PM2 restart. Infra is Terraform (`azurerm ~> 3.0`) + Ansible.
- **Every service exposes `/health`.** New services must too.
- **API contracts** live in `medoc-bruno-api-collections` (Bruno, 768 requests). It is **read-only for frontend developers** — backend team pushes. Update it when you change a contract.

---

## 9. How to work in this codebase

**Before writing:**
1. Read the repo's `package.json` / `pubspec.yaml` for real versions.
2. Read the nearest `Readme.md` — feature folders carry their own specs.
3. Find an existing implementation of the same shape and match it. Consistency inside a repo beats global purity.

**While writing:**
- TypeScript is `strict: true` everywhere. Keep it that way. Do not add `any` — there are already ~5,900 and they are debt, not precedent.
- Use `logger` (winston) where it exists. Do not add `console.log` — there are already ~1,850.
- Validate input with Zod or `express-validator`, consistent with the repo.
- Naming: files `kebab-case.ts` (layered) or `<feature>Controller.ts` (feature-sliced); classes/interfaces `PascalCase` (`I`-prefixed interfaces, `E`-prefixed enums); functions/vars `camelCase`; constants `UPPER_SNAKE_CASE`. React components `PascalCase.tsx`, hooks `useThing.ts`.
- Commits: `type(scope): description` — `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
- Branches: `feature/*`, `bugfix/*`, `hotfix/*` off `dev`; `main` is production.

**Before finishing:** (exact commands and per-repo exceptions in §7)
- Typecheck must pass — `npm run ts.check` in the 6 repos that define it, `npx tsc --noEmit -p tsconfig.json` in the other 19.
- `npm test` **only where a Jest config actually exists** — 4 repos declare `"test": "jest"` with no config, so a green-looking run there means nothing.
- `npm run audit` — critical vulnerabilities block the Docker build anyway.

**Cross-repo impact — always ask: "which other repo reads or writes what I just touched?"**
These 37 repos are heavily coupled; the couplings below are duties, not suggestions. Either make the
corresponding change in the same task, or state explicitly that the linked repo needs a follow-up and
why it is out of scope. Never leave a link silently broken.

| You changed | You must also |
|---|---|
| `encryption/` or `kms/` in any copy | apply the same change to all three: `me-backend`, `docApp-backend`, `medoc_plus_backend` (§5) |
| an API request/response shape | update the `.bru` in `medoc-bruno-api-collections` **and** the feature `Readme.md` |
| added / renamed / removed a route | regenerate `route-hash-map.json` — an unregistered route 404s by design (§5) |
| `msf-core` | check its four consumers: `admin-dashboard`, `HPlus`, `medoc_plus`, `docApp` — and tag a release; they pin by git tag |
| JWT payload, audience, or claims in `medoc-auth-service` | check every JWKS-verifying service; audiences are authorization gates (§5) |
| a collection name or document shape | grep the other backends — `HPlus`, `medoc_plus`, `docApp`, `me-backend` share tenant databases |
| anything the `brain/` records as fact | fix the brain file **in the same change** (see `brain/README.md`) |

**Be honest about state.** Large parts of this codebase are under-tested (~32 test files across
~665k lines of TypeScript). If you cannot verify a change, say so plainly rather than implying it is covered.

---

## 10. Live hazards — read `brain/hazards.md` before touching these

- **`me-backend-main/.env` contains real production credentials** — MongoDB Atlas URI, a GitHub PAT, a Gemini API key, RabbitMQ URL. **These must be rotated.** Same for live JWTs in `medoc-bruno-api-collections/environments/medoc.bru`, and for the **`env.txt` files tracked inside `src/`** in `Admin-Dashboard-Frontend`, `medoc_plus_backend`, and `docApp-backend`'s git history (hazards §1b).
- **Hardcoded JWT fallback secrets** in `HPlus-Backend` (`verifyTokens.ts`, `permissionMiddleware.ts`), `admin-dashboard-backend`, `compliant-dashboard-backend`. Any of these makes tokens forgeable if the env var is unset.
- **Signing keystores committed**: `DocAssist/upload-keystore.jks`, `MedocEUA/releasekey.jks`, plus `auth_key.pem` in a Flutter web build.
- **Port collisions** across services (`7001` ×3, `6001` ×2, `5000` ×3) — a real problem for local multi-service work.
- **`MedocEUA` is pinned to Dart <3.0** and cannot build on a current Flutter toolchain.
- **`Medoc-Velocity-Frontend` carries ~355 MB of badge PNGs** — 12–17 MB each, duplicated between `src/assets/` and `public/`. Optimise before adding more.

---

## 11. What good looks like here

When you need a reference implementation, use these — they are the highest-quality code in the workspace:

| Concern | Reference |
|---|---|
| Pure domain logic, tests, docs | `msf-core` |
| Service structure, env validation, DI | `medoc-auth-service` |
| Error/response abstractions | `HPlus-Backend/src/errors/` |
| Tenant-safe data access, transactions | `HPlus-Backend/src/db/db.ts` |
| Resilient messaging | `whatsapp-delivery-service/src/rabbitmqManager.ts` |
| Dockerfile | `HPlus-Backend/Dockerfile` |
| Machine-readable project context | `medoc-abdm-dashboard-backend/brain/` |
| Frontend architecture + ADRs | `Medoc-Care-Dashboard-Frontend/docs/` |

The newest services are markedly cleaner than the oldest. **The direction of travel is: native Mongo
driver, no Mongoose, `tsup`, typed errors, validated env, DI, small features, real tests.** Write new
code at the front of that trend, not the back.

---

## 12. Mistake patterns

**The escalation ladder: mistake → table row → rule → hook.** When an agent repeats a mistake, or a
reviewer corrects the same behaviour twice, append a row here immediately — in the same session, not
batched. When a row reaches ~4–5 fires, abstract it into a rule in the section it belongs to and wire
a deterministic check (`scripts/check-invariants.sh`, husky, or CI) — prompt rules fail silently when
context is busy; hooks don't. This repo is shared: a mistake recorded from one session prevents it in
everyone's.

| Pattern | Times | Rule | Last |
|---|---|---|---|
| _(empty — add the first row when a mistake repeats)_ | | | |

---

**These files are working if:** the counts in `brain/service-map.md` move the right way — `any` falls
from ~5,900, `console.log` falls from ~1,850, test files rise from 32; `brain/hazards.md` shrinks
instead of rotting; no new secret ever lands in a repo; no tenant-scoping bug ships; and cross-repo
links (the §9 table) are never silently broken.
