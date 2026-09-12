# WORKSPACE-MAP.md — the 89-repo map

The complete inventory of the Medoc Health workspace: what every repository is, which of each
near-identical cluster is the live one, and where the secrets are buried.

**This file is a reference, not auto-loaded context.** Each repo's own `CLAUDE.md` is generated
from `repos.yaml` and already carries the subset that repo's owner needs — twin status, hazards,
commands, cross-repo duties. Read this file when you need the whole picture: planning work that
spans products, onboarding, or deciding which repo something belongs in.

> **Provenance.** Facts below were re-verified against the working tree on **2026-08-28**. Where
> they contradict `brain/`, this file wins until the brain is updated — see
> `SUGGESTED-UPDATES-2026-08-28.md`. The curated subset that drives per-repo generation lives in
> `repos.yaml`; **if you correct something here, correct it there too, or the 89 generated files
> will keep repeating the old fact.**

---
## What changed since the brain was written (2026-08-27)

The brain was derived from a **37-repo ZIP snapshot with no git history**. The workspace is now
**89 live git repositories** (all cloned with full history) + the `claude_md` meta-repo. ~52 repos are
undocumented in the brain. The facts below are re-verified against the current tree (2026-08-28);
where they contradict the brain, **this file wins until the brain is updated** — see
`claude_md/SUGGESTED-UPDATES-2026-08-28.md` for the reconciliation.

- **Not ZIP snapshots.** Every directory is a real git repo. `brain/service-map.md:3-4` ("37
  repositories … all ZIP snapshots — no `.git` history") is stale on both counts.
- **Version floors are lower than the brain's §3 table** (it only saw the newest 37): mongoose
  **8.4.1**→9.4.1 (not 8.13), TypeScript **5.1.6**→6.0.3 (not 5.4), Next **15.3.2**→16.3.1 (not 15.5),
  Dart floor **2.18.6** (DocAssist_Web_V2, MedocDocappWeb), mongodb outlier **4.0.0** in
  `hudd-complete`. The rule stands, harder than before: **read the manifest, never assume a version.**
- **Node Docker pin is not universal.** `ARG NODE_VERSION=24.14.1` in 11 backend Dockerfiles; the
  Next.js frontends and the *production* stage of `Medoc-Velocity-Backend` / `Support-Dashboard-Backend`
  hardcode `node:22` / `node:20`.
- **`msf-core` has one consumer now, not four.** Only `admin-dashboard-backend` imports
  `@medoc-health/msf-core` (pinned `github:MedocHealth/msf-core#v0.6.1`). HPlus / medoc_plus / docApp
  no longer reference it. Correct the §9 impact table accordingly.
- **New products the brain never mentions:** MediNetSettle (claims settlement), Medoc Sync (ESP32 IoT
  capture device), Monarcs (radiology AI research), HUUD (Hyperledger supply-chain/insurance),
  a claims-management line (Medoc One / Claim Management), and Edebo/"Aesthetic3D" (a 3D face-scan
  Expo app that is **not** part of the hospital OS).
- **The secret-exposure surface is much larger than `brain/hazards.md` knows.** New tracked secrets
  across the undocumented repos — see the Hazards section below and the SUGGESTED-UPDATES doc.

---

## The single most dangerous trap: editing a dead twin

Many products have 2–4 repos with near-identical names; only one is live. **Editing the legacy twin
is the #1 way to waste a session here.** Confirm against this table (git activity re-verified
2026-08-28) before writing:

| Product | ✅ CANONICAL — edit here | ⛔ Legacy / dormant — do **not** edit |
|---|---|---|
| Admin backend | `admin-dashboard-backend` (active, 884 commits) | `admin-panel-backendV2` (2025-05), `adminPanel-Backend` (2025-02) |
| DocAssist app | `DocAssist_dev_frontend` — working line, **v4.7.0** | `DocAssist` (release mirror, v4.5.1 — shared history, diverged), `DocAssist_Web_V2`, `MedocDocappWeb` |
| Claims backend | `MedocOne_backend` (:7777, pkg `claim_management_backend`) | `Medoc-One-Backend` (:7001), `Claim_management_backend` (:8761) |
| Outreach backend | `Medoc-Outreach-Backend` (active) | `outreach_medoc_backend` (2026-04) |
| Outreach frontend | `Medoc-Outreach-Frontend` (active) | `Outreach-Dashboard-Frontend` (2026-03) |
| Medoc+ app | `MedocPlus-Frontend-V2` (v2.6.8, active) | `MedocPlusV2` (v1.0.0, 2025-04) |
| Upload service | `medoc-upload-service` (active) | `Azure_upload_service_backend` (2025-12) |
| WebSocket server | `web_sockets_server` (richer, WebRTC) | `medoc-realtime` (2025-08, never built) |
| ME web build | `me-web-build` (v1.7.3) | `medoceua-web-build` (v0.80.1) |
| Encryption (CSFLE) lib | *(chalawa family is the newest attempt)* | `encryption_medoc`, `encryption_medoc_pkg` (v1, 2025-07) |
| ABDM | `medoc-abdm-dashboard-{backend,frontend}` **and** `medoc-ABDM-backend` are **different products**, not twins: the dashboard vs the government-gateway (M1/M2/M3) service | — |

`DocAssist` vs `DocAssist_dev_frontend` share git history and both look active — `dev_frontend` is
ahead (v4.7.0 > v4.5.1). Treat `dev_frontend` as the working repo and `DocAssist` as the release
mirror; if unsure which a change belongs in, ask, don't guess.

---

## Full repository map (89 repos)

`[C]` canonical/active · `[L]` legacy/dormant · `[A]` build artifact (compiled output, not source) ·
`[S]` stub/empty · `[P]` package/library. Ports are the local-dev default from code (or `.env.example`
where noted). ⚠ marks a repo with a committed-secret hazard (see Hazards).

### Hospital+ / Axon — hospital staff, doctors, admins
- `HPlus-Backend` **[C]** — the flagship backend (feature-sliced, `tsc`, 128k LOC, :5000). ⚠ JWT fallback secrets, Cloudinary creds in source.
- `hospital-plus-frontend` **[C]** — Flutter app (Provider), consumes `medoc_payment_package`.
- `hospital_plus_build` **[A]** — compiled Flutter web of the above (58 MB). ⚠ ships `auth_key.pem`.

### Medoc+ / Vigil — Medoc super-admins, operators, support
- `medoc_plus_backend` **[C]** — backend (feature-sliced, `tsup`, :5000/:7000).
- `MedocPlus-Frontend-V2` **[C]** — Flutter staff app (nurse/paramedic/pharmacist), v2.6.8.
- `MedocPlusV2` **[L]** — the v1.0.0 predecessor. ⚠ hardcoded Google Maps keys, session-token `print`.
- `mplus-web-build` **[A]** — compiled Flutter web (45 MB).
- `medoc-plus-build` **[S]** — empty (mplus-web-build superseded it).

### DocApp / DocAssist — doctors, voice-driven prescribing
- `docApp-backend` **[C]** — backend (feature-sliced, `tsup`, :4000). Producer to RabbitMQ. Ships `dev:mac`.
- `DocAssist_dev_frontend` **[C]** — **the working Flutter app**, v4.7.0. ⚠ `upload-keystore.jks`, TLS validation disabled globally.
- `DocAssist` **[C/mirror]** — release mirror, v4.5.1 (shared history). ⚠ `upload-keystore.jks`.
- `DocAssist_Web_V2` **[L]** — Flutter web V2 (2025-02).
- `MedocDocappWeb` **[L]** — oldest repo in the workspace (2024-08).
- `docassist_build_web` **[A]** — compiled Flutter web of DocAssist (2025-04).

### ME / MedocEUA — patients / end users
- `me-backend` **[C]** — patient backend (domain-flat, `tsc`, :3000). RabbitMQ producer. ⚠ **tracked `.env` + `src/utils/constants/env.txt` — the P0 credential leak, still not rotated.** `build` uses Windows-only `copy`.
- `MedocEUA` **[C]** — patient Flutter app, **pinned pre-Dart-3** (`>=2.19 <3.0`). ⚠ `releasekey.jks`, `key.properties`, `google-services.json`, TLS validation disabled.
- `medoceua-web` **[L]** — web fork of the patient app. ⚠ same keystore trio committed.
- `me-web-build` **[A]** — compiled Flutter web, v1.7.3. ⚠ Google API key in `main.dart.js` (verify referrer-locked).
- `medoceua-web-build` **[L/A]** — earlier build artifact, v0.80.1.

### Care Dashboard — NABH accreditation & compliance
- `compliant-dashboard-backend` **[C]** — backend (feature-sliced, `tsup`, :3030). Bleeding-edge stack (Express 5.2, mongodb 7.1, mongoose 9.4, TS 6.0). ⚠ JWT fallback secret. Redis-backed RBAC.
- `Medoc-Care-Dashboard-Frontend` **[C]** — Next.js 16, **HttpOnly-cookie auth** (`withCredentials`), has `docs/` + ADRs.

### ABDM — national health ID (two distinct products)
- `medoc-abdm-dashboard-backend` **[C]** — dashboard backend (layered-mvc + Brandi IoC, :8800). Has the reference `brain/`.
- `medoc-abdm-dashboard-frontend` **[C]** — Next.js (near-empty scaffold, 1 commit).
- `medoc-ABDM-backend` **[L]** — the ABDM **government gateway** (M1/M2/M3 certification APIs, feature-sliced, :9090). Separate from the dashboard.

### Admin
- `admin-dashboard-backend` **[C]** — backend (layered-mvc, `tsup`, :6000). **The only `msf-core` consumer.** ClickHouse action logs. ⚠ JWT fallback secrets.
- `Admin-Dashboard-Frontend` **[C]** — Next.js 16. ⚠ tracked `src/constants/env.txt`. (Also carries the `@AGENTS.md` pair — see below.)
- `admin-panel-backendV2` **[L]** — intermediate gen. ⚠ hardcoded Atlas creds.
- `adminPanel-Backend` **[L]** — gen-1. ⚠ hardcoded Atlas creds + JWT fallback.

### Support
- `Support-Dashboard-Backend` **[C]** — backend (layered-mvc, `tsup`, :6001). **Best test suite in the workspace (10) — copy it for new test harnesses.**
- `Medoc-Support-Dashboard` **[C]** — Next.js.

### Outreach — sales / CRM
- `Medoc-Outreach-Backend` **[C]** — backend (layered-mvc, `tsup`, :7001).
- `Medoc-Outreach-Frontend` **[C]** — Next.js.
- `outreach_medoc_backend` **[L]** — predecessor. **ARCHIVED on GitHub (read-only).** ⚠ `/dbString` leaks Mongo URI, WhatsApp key fallback.
- `Outreach-Dashboard-Frontend` **[L, ARCHIVED — read-only]** — predecessor Next.js (but has the richest `docs/` — good domain reference).

### Campaign — marketing campaigns
- `Campaign-Dashboard-Backend` **[C]** — backend (layered-mvc, `tsup`, :7001).
- `Campaign-Dashboard-Frontend` **[C]** — Next.js 15. **Contradicts the brain's "Campaign has no frontend."** ⚠ tracked `src/constants/env.txt`.

### Velocity — internal sprint/task tracking (gamified)
- `Medoc-Velocity-Backend` **[C]** — backend (layered-mvc, `tsup`, :6001).
- `Medoc-Velocity-Frontend` **[C]** — Next.js 16. ⚠ **~355 MB of badge PNGs duplicated between `src/assets/` and `public/`** — optimise before adding assets.

### Marketing site
- `Medoc-Main-Website-Backend` **[C]** — backend (layered-mvc + Prisma, `tsup`, :7001). ⚠ tracked `src/lib/constants/env.txt`.
- `Medoc-Main-Website` **[C]** — Next.js 16 (72k LOC, ~220 MB assets).

### Medoc One / claims management
- `Medoc-One-Frontend` **[C]** — Next.js unified shell (targets backend :7777).
- `MedocOne_backend` **[C]** — claims backend (feature-sliced, :7777, pkg name `claim_management_backend`). ⚠ tracked `Constants.txt` + `env.txt`, `/dbString` leak, Azure conn string in source.
- `Medoc-One-Backend` **[L]** — predecessor (layered-mvc, :7001). ⚠ tracked `env.txt`, `/dbString` leak.
- `Claim_management_backend` **[L]** — earlier claims backend for the MediNetSettle line (:8761). ⚠ tracked `Constants.txt`.
- `MediNetSettle-Website` **[C]** — Next.js marketing site for the claims-settlement product (standalone, no backend wired).

### Platform / shared services
- `medoc-auth-service` **[C]** — **identity authority**: RS256 JWT, JWKS, RBAC (layered-mvc, :4003). **No `package-lock.json` → use `npm install`, then `npm run generate:keys`.**
- `medoc-upload-service` **[C]** — file upload (Azure Blob + Cloudinary + pdf-lib, domain-flat).
- `Azure_upload_service_backend` **[L]** — upload-service predecessor (:4001). ⚠ tracked `env.txt`, hardcoded Atlas creds.
- `medoc-patient-service` **[C]** — patient-domain extraction (layered-mvc, ESM `type:module`, :4000). In progress.
- `medoc-opd-service` **[C]** — OPD appointment microservice (layered-mvc, RabbitMQ FIFO, :3001). Extracted from HPlus. No auth middleware yet.
- `medoc-ipd-service` **[S]** — empty stub (sibling of opd-service).
- `medoc-workforce-management-service` **[C]** — HRMS microservice; **real code lives on unmerged branch `feat/setup-hr-workforce`**, main is a stub. ⚠ JWT fallback secret on the branch.
- `Medoc-api-gateway` **[C]** — Kong gateway; **real code on unmerged branch `BADA-51-…`**, main is a stub.
- `medoc-redis-service` **[S]** — empty stub.
- `whatsapp-delivery-service` **[C]** — RabbitMQ→WhatsApp consumer (domain-flat). Reference resilient-messaging impl. Tests compile via `tsconfig.test.json`.
- `medoc-face-auth-service` **[C]** — face recognition (**Python**: DeepFace + ChromaDB + FastAPI/Flask, Docker).
- `medoc-backend-health-check` **[C]** — uptime monitoring. ⚠ tracked `backend/.env`.
- `AI-Backend` **[L]** — "docAI" microservice: voice transcription (OpenAI) + prescription gen (Gemini), Express 5, :2000. ⚠ tracked `env.txt`, hardcoded OpenAI/Atlas creds, **unauthenticated AI routes**. Missing deps → won't `npm ci`.
- `Medoc-voice` **[L]** — Flask voice prototype (:5000). ⚠ tracked `.env` + a committed **362 MB Windows virtualenv**.

### Realtime / WebSocket
- `web_sockets_server` **[C]** — chat + notifications (RabbitMQ) + telemedicine WebRTC (layered-mvc, :7001). ⚠ `/dbString` leak, WS auth by query-param only. Real docs in `FLUTTER_INTEGRATION_GUIDE.md`.
- `medoc-realtime` **[L]** — predecessor; **does not build** (missing dirs). ⚠ Atlas creds fallback, Mongo URI logged.

### Medoc Sync — IoT prescription-capture device
- `DA-Sync-Server` **[C]** — cloud backend for the sync device (layered-mvc, MQTT + RabbitMQ + Gemini, :8000).
- `medoc-sync-device` **[C]** — ESP32-S3 firmware (PlatformIO/Arduino). ⚠ hardcoded MQTT creds in `src/mqtt/mqtt_manager.cpp`, TLS disabled.
- `medoc-sync-website` **[C]** — Next.js static marketing site.

### Radiology / AI research
- `RADICOM` **[L]** — DICOM ingestion microservice (layered-mvc, Azure Blob, :4001). ⚠ tracked `env.txt`, hardcoded Atlas creds, **auth middleware fully commented out**. Empty Dockerfile stub.
- `Monarcs` **[C]** — radiology-AI research (Python/Streamlit/PyTorch); **real work on unmerged branches**, main is a skeleton.

### Blockchain (HUUD)
- `hudd-complete` **[L]** — Hyperledger Fabric prototype (patient/insurance/research/supply-chain, :3131). ⚠ **~30 committed PEM certs + private keys** (demo Fabric network). Won't build (missing deps).
- `huud-supply-chain` **[L]** — earlier Fabric chaincode spike (no build config).

### Encryption family
- `encryption_medoc` **[L/P]** — CSFLE library v1, canonical source (Azure Key Vault KMS). ⚠ **tracked `.env` with Azure KMS creds**, hardcoded client secret in source, committed obfuscated `dist/`.
- `encryption_medoc_pkg` **[L/P]** — the packaged/dist artifact of the above. ⚠ tracked `.env`, committed 13 MB ELF binary.
- `Schema-Encryption` **[L]** — docs-only field/collection catalogue.
- `encryption_in_action` **[S]** — empty stub (intended impl companion to Schema-Encryption).
- `medoc-chalawa-node-package` **[P]** — "chalawa" encryption-in-transit; **repo name says node but it holds the web package verbatim** — the node half must be written from scratch.
- `medoc-chalawa-web-package` **[P]** — chalawa browser Web-Crypto lib (AES-GCM + ECDH). No tests.
- `medoc-chalawa-flutter-package` **[P]** — chalawa Flutter/Dart lib (DH RFC-5114). No checked-out consumer.

### Packages / libraries
- `msf-core` **[C/P]** — Medoc Standard Forms engine (pure TS, zero IO, **0 `any`, 5 tests**). The workspace exemplar. Consumed only by `admin-dashboard-backend` (`#v0.6.1`).
- `-medoc-health-cloudinary-multer-storage` **[P]** — Cloudinary Multer storage engine. Consumed by 6 backends via `github:MedocHealth/-medoc-health-cloudinary-multer-storage#v1.0.1` (note the leading dash). Credentials are the consumer's responsibility.
- `medoc_payment_package` **[P]** — Flutter payment-gateway wrapper (PhiCommerce/PayPhi shape). Consumed by `hospital-plus-frontend` at `ref: main` (unpinned — any push is a live change).

### Infra / DevOps / data
- `Medoc_DevOPs` **[C]** — Terraform (`azurerm ~>3.0`) + Ansible + Jenkins pipelines.
- `medoc-docker-repository` **[C]** — ClickHouse + Redis container configs.
- `medoc-bruno-api-collections` **[C]** — API contracts: 768 `.bru` files (~616 actual requests). **Read-only for frontend devs.** ⚠ live JWTs in `environments/medoc.bru`.
- `Medoc_Vital` **[L]** — Minikube/K8s single-VM deploy for the "Vital" suite. ⚠ **CRITICAL: populated secrets in `vital/backends/doc-bknd/env.txt` and `hplus-backend/secrets.yml`** (JWT secrets, OpenAI/Gemini keys); public VM IP in README.
- `vital` **[S]** — empty stub (intended Vital model repo).
- `diagnostics` **[C]** — lab-test reference dataset (16 JSON files; note filename typos). No PHI.
- `Devops_templates` **[S]** — placeholder (single file "aaa").
- `cms-frontend` **[S]** — empty (unborn `main`).
- `MedocHealth-DevOpsWeb` **[S]** — empty (unborn `main`).

### Standalone / not part of the hospital OS
- `Edebo-appbuild` **[C]** — Expo/React-Native "Aesthetic3D" 3D face-scan app (Kiri Engine + Razorpay). Monorepo (app + `server/`). Unrelated to the hospital platform.
- `ref-flutter-app` **[C]** — internal training/reference app "FormFlow"; **code lives on two unmerged branches** (`origin/frontend`, `origin/new/dev`), `main` is LICENSE-only.

---

## Hazards beyond `brain/hazards.md`

`brain/hazards.md` documents the core-37 exposures but predates the other 52 repos and uses stale
`-main`/`-master` directory names (`me-backend-main`, `DocAssist-main`, `MedocEUA-master` → now
`me-backend`, `DocAssist`, `MedocEUA`). The verified additional exposure, from a full `git ls-files`
sweep on 2026-08-28 (presence only — no secret values were read):

**Tracked secret files not in the brain** (source files — `.gitignore` does not help; rotate + purge history):
- **Populated deploy secrets:** `Medoc_Vital/vital/backends/doc-bknd/env.txt`, `Medoc_Vital/vital/backends/hplus-backend/secrets.yml`.
- **Tracked `.env`:** `me-backend/.env` (the P0 — still present), `encryption_medoc/.env`, `encryption_medoc_pkg/.env` (Azure KMS creds), `Medoc-voice/.env`, `medoc-backend-health-check/backend/.env`.
- **Tracked `env.txt` / `Constants.txt`:** `AI-Backend`, `Azure_upload_service_backend`, `Campaign-Dashboard-Frontend`, `Claim_management_backend`, `Medoc-Main-Website`, `Medoc-One-Backend`, `MedocOne_backend` (×2), `Outreach-Dashboard-Frontend`, `RADICOM`, `me-backend`, `Admin-Dashboard-Frontend`. (`medoc_plus_backend`/`docApp-backend` no longer track theirs — brain §1b is stale on those two.)
- **Signing keys / device secrets:** `DocAssist_dev_frontend/upload-keystore.jks`, `medoceua-web/{releasekey.jks,android/key.properties,android/app/google-services.json}`, `MedocEUA/{android/key.properties,google-services.json}` (beyond the known `releasekey.jks`), `medoc-sync-device` MQTT creds in source, `hudd-complete` ~30 Fabric PEM keys.

**Systemic anti-patterns across the legacy backends** (not one-offs — expect them in any `[L]` backend):
- Hardcoded MongoDB Atlas credentials in `db.ts` source (adminPanel-Backend, admin-panel-backendV2, AI-Backend, RADICOM, medoc-realtime, hudd-complete, Azure_upload_service_backend).
- An unauthenticated **`GET /dbString`** endpoint that returns the live `MONGODB_URI` (MedocOne_backend, Medoc-One-Backend, outreach_medoc_backend, web_sockets_server).
- Global TLS bypass in the Flutter apps (`badCertificateCallback => true`) and session-token `print()` at startup.
- Auth middleware commented out entirely (RADICOM, medoc-opd-service, AI-Backend live routes).

For anything touching secrets, auth, or a repo marked ⚠, read `claude_md/brain/hazards.md` first, then
this section, and treat every ⚠ as unremediated until you confirm otherwise.

---

## How to work here (the short version — full detail in the imported brain §9)

1. **Confirm you are in the canonical repo** (table above), not a dead twin.
2. **Read the manifest** (`package.json` / `pubspec.yaml` / `platformio.ini`) for the real version — they differ per repo, more than the brain's table shows.
3. **Match the repo's existing pattern**; don't migrate architectures opportunistically.
4. **Never leak a tenant, commit a secret, invent a fallback secret, or log PHI** (brain §2).
5. **Never assert a repo's state without reading its source** — this map is a starting index, not a substitute for opening the file.
