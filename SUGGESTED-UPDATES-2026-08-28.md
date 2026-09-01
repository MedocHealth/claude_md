# Suggested updates to the universal CLAUDE.md + brain/

**Date:** 2026-08-28 · **Author:** codebase re-survey (agentic) · **Status:** proposals — nothing here
is committed. Review with `git status` / apply selectively.

## Why

`CLAUDE.md` + `brain/` were derived from a **37-repo ZIP snapshot with no git history** (2026-08-27).
The workspace is now **89 live git repos** + this `claude_md` meta-repo. ~52 repos are undocumented,
and several concrete claims have gone stale. Every finding below was verified against the current tree
on 2026-08-28 (deterministic `git ls-files` / `jq` / `grep` over `*/package.json`, cross-checked by a
parallel survey). Verdicts: **HOLDS** (no change), **STALE** (was true for the 37, not for 89),
**WRONG** (false now), **PARTIAL** (half right).

A companion root file was created at **`../CLAUDE.md`** (the workspace root, which had none) — it
`@import`s this brain and adds the full 89-repo map. That fixes the structural gap: the brain lived in
this sub-repo, a *sibling* of every product repo, so it never auto-loaded when working inside
`HPlus-Backend/`, `docApp-backend/`, etc. **The root file is the highest-leverage change; the edits
below make the brain's own content accurate.**

---

## A. `brain/service-map.md` — the biggest gap

1. **Header (lines 3–4).** WRONG now:
   - was: *"37 repositories … All are ZIP snapshots — no `.git` history is present in this workspace."*
   - → **"89 repositories + the `claude_md` meta-repo, all live git clones with full history."**
   Downstream: the "Size and health" table only covers 24 repos; the architecture matrix 24. Both need
   the ~52 additions (full per-repo detail is in `../CLAUDE.md`; the map there can be lifted wholesale).

2. **Campaign has a frontend.** `Campaign-Dashboard-Frontend` exists (Next.js 15, active 2026-05,
   calls `campaign_dashboard_backend`). The product table implies the `*-Backend`+`*-Frontend` pair but
   the frontend is absent from every detail table — add it.

3. **Medoc One / claims line is missing entirely.** Add: `Medoc-One-Frontend` (Next.js, :7777 target),
   `MedocOne_backend` **[canonical]** (:7777), `Medoc-One-Backend` **[legacy]** (:7001),
   `Claim_management_backend` **[legacy]** (:8761), `MediNetSettle-Website` (marketing).

4. **`msf-core` consumers — the §9 impact table is wrong.** Only `admin-dashboard-backend` imports
   `@medoc-health/msf-core` today (`github:MedocHealth/msf-core#v0.6.1`). `HPlus-Backend`,
   `medoc_plus_backend`, `docApp-backend` have **zero** `msf` references in `package.json` or `src/`.
   - `CLAUDE.md:229` ("check its four consumers: admin-dashboard, HPlus, medoc_plus, docApp") → **"check
     its one consumer, `admin-dashboard-backend`; it pins by git tag `#v0.6.1`."**

5. **New ports to add to the ports table** (verified from code / `.env.example`):
   `AI-Backend` 2000 · `medoc-opd-service` 3001 · `Azure_upload_service_backend` 4001 · `RADICOM` 4001 ·
   `adminPanel-Backend`/`admin-panel-backendV2` 6000 · `MedocOne_backend` 7777 · `Medoc-One-Backend` 7001 ·
   `Claim_management_backend` 8761 · `web_sockets_server`/`outreach_medoc_backend` 7001 ·
   `hudd-complete` 3131 · `DA-Sync-Server` 8000 · `medoc-ABDM-backend` 9090 · `Medoc-api-gateway` 3000 (branch).
   Note: `whatsapp-delivery-service`, `medoc-auth-service`, `medoc-abdm-dashboard-backend` have **no
   code default** — their PORT comes only from `.env.example`.

6. **New products to name** in §1 / the map: MediNetSettle (claims settlement), Medoc Sync (ESP32 IoT
   capture device: `DA-Sync-Server` + `medoc-sync-device` + `medoc-sync-website`), Monarcs (radiology
   AI research), HUUD (`hudd-complete` + `huud-supply-chain`, Hyperledger), the chalawa encryption
   family, and `Edebo-appbuild` (a 3D face-scan Expo app that is **not** part of the hospital OS).

---

## B. `CLAUDE.md §3` — version table (floors are lower than the 37-repo view showed)

| Row | Verdict | Correction |
|---|---|---|
| Express 4.18→5.2 | **HOLDS** | 4.18.3 (`medoc_plus_backend`) → 5.2.1 (`compliant-dashboard`, both ABDM backends, `upload-service`) |
| MongoDB 6.6→7.2 | **PARTIAL** | mainstream 6.6.2→7.2.0 holds, but `hudd-complete` pins **4.0.0** (legacy outlier below the floor) |
| Mongoose 8.13→9.4 | **STALE** | **8.4.1** (`adminPanel-Backend`, `admin-panel-backendV2`) → 9.4.1 (`compliant-dashboard`). 14 backends use the native driver with **no** mongoose |
| Zod 3.23→4.3 | **HOLDS** | 3.23.8 → 4.3.6 |
| TypeScript 5.4→6.0 | **STALE** | **5.1.6** (`Azure_upload_service_backend`, `RADICOM`) → 6.0.3 (`compliant-dashboard`, `medoc-abdm-dashboard-backend`) |
| Next 15.5→16.3 | **STALE** | **15.3.2** (`MediNetSettle-Website`) → 16.3.1 (Care/Main/Velocity) |
| Tailwind 3.4→4.x | **HOLDS** | 3.4.1 (`Admin-Dashboard-Frontend`, `Medoc-Main-Website`) → 4.x (10 repos) |
| React 18→19.2 | **HOLDS** | 18 (`Admin-Dashboard-Frontend` only) → 19.2.4 |
| Jest 29→30 | **HOLDS** | 29.7.0 → 30.4.2 |
| Node 24.14.1 | **PARTIAL** | pinned via `ARG NODE_VERSION=24.14.1` in **11 backend** Dockerfiles; frontends + the *production* stage of `Medoc-Velocity-Backend`/`Support-Dashboard-Backend` hardcode `node:22`/`node:20`. Not universal. |
| Dart 2.19→3.7.2 | **PARTIAL** | floor is **2.18.6** (`DocAssist_Web_V2`, `MedocDocappWeb`), not 2.19 |

Bleeding-edge outlier that sets most maxima: `compliant-dashboard-backend`. Trailing-edge:
`Admin-Dashboard-Frontend` (React 18, Tailwind 3, Zod 3, and — oddly — mongoose in a Next.js app).

---

## C. `CLAUDE.md §7` — command counts (all were true for the 37; workspace-wide numbers changed)

| Claim | Verdict | Now (workspace-wide) |
|---|---|---|
| "`enforce-ci.js` preinstall in 12 repos" | **PARTIAL** | **13** wire the preinstall; **14** ship the file (`compliant-dashboard-backend` has the file, not the hook) |
| "`ts.check` in only 6 repos" | **STALE** | **8** — the 6 + `Medoc-One-Backend` + `web_sockets_server` |
| "no `.env.example` anywhere" | **WRONG** | **11 exist**: `medoc-ABDM-backend`, `Medoc-Outreach-Backend`, `whatsapp-delivery-service`, `admin-dashboard-backend`, `outreach_medoc_backend`, `DA-Sync-Server`, `medoc-abdm-dashboard-backend`, `web_sockets_server`, `medoc-auth-service`, `Medoc-One-Backend`, `Edebo-appbuild/server` |
| "`npm run audit` in 14 repos" | **STALE** | **16** (added `medoc-ABDM-backend`, `outreach_medoc_backend`) |
| "16 declare `test:jest`, 12 ship config; 4 without" | **STALE** | **23 declare, 15 ship a config, 8 without** — the original 4 (`HPlus-Backend`, `compliant-dashboard-backend`, `medoc-abdm-dashboard-backend`, `medoc-auth-service`) + `Azure_upload_service_backend`, `RADICOM`, `web_sockets_server`, `medoc-ABDM-backend` |

**Still HOLDS exactly** (keep as-is): `medoc-auth-service` has no lockfile; `me-backend` build uses
Windows-only `copy`; `docApp-backend` ships `dev:mac`; `HPlus-Backend dev` runs `initialize` first.

Suggested phrasing pattern: *"as of the 37-repo core, X; workspace-wide now Y"* — keeps the original
audited numbers meaningful while staying true.

---

## D. `CLAUDE.md §5 / brain anchors` — small corrections (each verified to file:line)

- **`route-hash-map.json` is `HPlus-Backend`-only** (`src/access_permission/route-hash-map.json`) — the
  only copy in the workspace. §5 reads as if it's a general mechanism; scope it to HPlus (the other
  feature-sliced repos don't have one).
- **`docApp-backend` default port is 4000, not "4000/5000"** (`src/app.ts:13`; single `.listen`; the
  5000 was a mis-read of `socketTimeoutMS: 45000`).
- **Bruno "768 requests" overstates.** 768 `.bru` *files*, but 144 are `folder.bru` + 7 `collection.bru`
  + 1 environment → **~616 actual requests**. Phrase as "768 `.bru` files (~616 requests)".
- **The `@AGENTS.md` pair is now 4 repos, and it's Next-autogenerated.** Add `Admin-Dashboard-Frontend`
  to the three named (`Medoc-Care-Dashboard-Frontend`, `Medoc-Velocity-Frontend`,
  `medoc-abdm-dashboard-frontend`). Better: describe it as *a pattern* ("any repo on this Next version
  grows an auto-generated `AGENTS.md` + `CLAUDE.md → @AGENTS.md` pair") rather than an enumeration that
  will keep going stale.

**Confirmed still HOLDS** (no change): `getCollection`/`getDbName`/`DBNameError`/`withTransaction`/
`MONGO_AGG_MAX_TIME_MS=25_000` in `HPlus-Backend/src/db/db.ts`; `docApp-backend/PII.txt`;
`medoc-auth-service` JWKS + `generate:keys` + the five audiences; `ECollectionName`/`EDBName` in all
four data repos; `encryption/`+`kms/` copied across `me-backend`/`docApp-backend`/`medoc_plus_backend`;
Care Dashboard HttpOnly-cookie auth.

---

## E. `CLAUDE.md §10` + `brain/hazards.md` — stale paths + a much larger secret surface

### E1. Stale directory names (the ZIP snapshot used `-main`/`-master` suffixes; the clones don't)
Replace throughout §10 and `hazards.md`: `me-backend-main` → `me-backend`, `medoc-auth-service-main`
→ `medoc-auth-service`, `DocAssist-main` → `DocAssist`, `MedocEUA-master` → `MedocEUA`,
`hospital_plus_build-main` → `hospital_plus_build`. As written, those paths resolve nowhere.

### E2. `hazards.md §1b` status drift
- `me-backend/.env` — **still tracked** (plus `src/utils/constants/env.txt`); the 2026-04-11 CI commit
  did **not** remove it. Rotation + history purge still outstanding.
- `medoc_plus_backend` / `docApp-backend` env.txt — **no longer tracked** (removed). Mark resolved-in-tree
  (docApp's remains in history via `b7ecccd`; `medoc_plus`'s `git log --all -- .env` is empty).
- `Admin-Dashboard-Frontend/src/constants/env.txt` — **still tracked**.

### E3. New tracked secrets across the undocumented repos (presence only; no values read)
Add a "P0 — wider sweep" subsection:
- **Populated deploy secrets (critical):** `Medoc_Vital/vital/backends/doc-bknd/env.txt`,
  `Medoc_Vital/vital/backends/hplus-backend/secrets.yml` (JWT secrets + OpenAI/Gemini keys).
- **Tracked `.env`:** `encryption_medoc/.env`, `encryption_medoc_pkg/.env` (Azure KMS creds incl.
  client secret), `Medoc-voice/.env`, `medoc-backend-health-check/backend/.env`.
- **Tracked `env.txt`/`Constants.txt`:** `AI-Backend`, `Azure_upload_service_backend`,
  `Campaign-Dashboard-Frontend`, `Claim_management_backend`, `Medoc-Main-Website`, `Medoc-One-Backend`,
  `MedocOne_backend` (×2), `Outreach-Dashboard-Frontend`, `RADICOM`.
- **Signing keys:** `DocAssist_dev_frontend/upload-keystore.jks`,
  `medoceua-web/{releasekey.jks,android/key.properties,android/app/google-services.json}`,
  `MedocEUA/{android/key.properties,android/app/google-services.json}`, `hudd-complete` (~30 Fabric
  PEM certs + private keys), `medoc-sync-device` MQTT creds in `src/mqtt/mqtt_manager.cpp`.

### E4. Systemic anti-patterns worth a rule (recur across legacy backends, not one-offs)
- Hardcoded Atlas creds in `db.ts` source (adminPanel-Backend, admin-panel-backendV2, AI-Backend,
  RADICOM, medoc-realtime, hudd-complete, Azure_upload_service_backend).
- Unauthenticated **`GET /dbString`** returning `MONGODB_URI` (MedocOne_backend, Medoc-One-Backend,
  outreach_medoc_backend, web_sockets_server) — worth a `check-invariants.sh` grep.
- Auth middleware commented out wholesale (RADICOM, medoc-opd-service, AI-Backend live routes).
- Flutter apps: global TLS bypass (`badCertificateCallback => true`) + session-token `print()` at boot
  (DocAssist_dev_frontend, medoceua-web, MedocEUA, MedocPlusV2, medoc-sync-device).

### E5. Repo-hygiene hazards (new)
- `Medoc-voice` commits a **362 MB Windows Python virtualenv** (`flask-server/myenv/`).
- `encryption_medoc(_pkg)` commit obfuscated `dist/` + a 13 MB ELF binary.
- `hudd-complete` / `Medoc-voice` / several build repos commit compiled output.

---

## F. Meta

- Consider adding a **canonical-vs-legacy table** to the brain (it's the #1 time-waster — editing a
  dead twin). The root `../CLAUDE.md` has one ready to lift.
- The brain's `service-map.md` "Size and health" counts (`any` ~5,900, `console.log` ~1,850, 32 tests)
  were computed over the 37; they'll shift with 89 repos but the *direction* guidance still stands.
- Nothing in §2 (the non-negotiable rules), §4 (multi-tenancy), §6 (architectures), or §8 (delivery)
  was contradicted by the survey — those hold.
