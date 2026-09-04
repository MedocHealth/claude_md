# Medoc WhatsApp Assistant — Implementation & Execution Strategy

## Status: Not Started — full phase 1 in 4 weeks with a team of 3, approved 2026-09-04 (Decision 22 rev 2); Day-0 checklist open

---

## 0. Day-0 owner checklist (before session 1 — hard gates for the 4-week target)

1. [ ] Move `specs/whatsapp-assistant/` into the `claude_md` repo and commit (workspace root is not git).
2. [ ] Create GitHub repo `medoc-assistant-service`; all three engineers have write rights on their owned repos (§1 ownership table); the manager has merge rights everywhere.
3. [ ] Meta: create app + WhatsApp product, get the **test number**, add all three phones + one pilot admin as recipients; **submit Business verification the same day** (go-live gate, ~1–4 wk). Verify that the test number needs no Business verification and supports interactive buttons and custom templates.
4. [ ] GCP project, Vertex enabled, confirm Gemini 2.5 Flash/Pro + `gemini-embedding-001` in `asia-south1` (fallback `asia-southeast1` only with owner sign-off — PHI residency).
5. [ ] Atlas dev cluster with Vector Search enabled + two dev `hos_` DBs for the tenant test; prod tier decision by end of week 1.
6. [ ] Answer open questions **1, 3, 4, 6, 8** (§6). Question 6 (regional languages) now gates week-3 template work. Others default to the spec's proposal.
7. [ ] Vault paths + Jenkins dev credentials provisioned (engineers never handle values).
8. [ ] Name a Hindi speaker and one speaker per regional language for eval gold labels (week 4) and template review (week 3).
9. [ ] **No scope additions until week 5.** Anything new goes on a phase 2 list.

## 1. Execution strategy

**Capacity model (owner-set 2026-09-04, rev 2)**: three people, each 3 × 4 h Claude sessions/day, 6 days/week = **54 sessions/week, 216 in 4 weeks**. Full phase 1 needs 72–86 sessions + 25 % rework ≈ 90–108, plus ~20 % coordination overhead for three writers ≈ 110–130. Capacity is not the constraint; **the serial chain (auth → link → agent → writes → RAG-in-agent → eval) and integration between three writers is.** Week 4 is integration and gates, not build.

**Ownership (one writer per repo, always; separate clones or worktrees per person):**

| Person | Owns (writes) | Also |
|---|---|---|
| **Manager + Claude** (Fable foreground) | `medoc-assistant-service` except `src/rag/**`; `claude_md`; contracts | Reviews every PR from the other two; owns the eval gate and the E2E checklist |
| **Backend engineer** | `HPlus-Backend`, `medoc-auth-service`, `medoc-upload-service`, `admin-dashboard-backend`, `Admin-Dashboard-Frontend`, the 4 audience-mirror backends, `medoc-bruno-api-collections`, `Medoc_DevOPs`; `medoc-assistant-service/src/rag/**` + `scripts/ensure-vector-indexes.ts` on its own branch | Catalogue module expansion (M6) from week 3 |
| **Vigil/Flutter dev** | `MedocPlus-Frontend-V2`, `medoc_plus_backend`, `hospital-plus-frontend` | Manual E2E operator on the test number; regional template QA |

- **Contracts first (manager, week 1 days 1–2, before anyone else writes against them)**: the 8 hospital-DB + 4 global collection schemas (Decision 16) as TS types + `.bru` fixtures; HPlus `/api/assistant/*` and `medoc_plus_backend` `/api/assistant/*` route shapes; assistant-service `/api/link/*` + `/internal/*`; auth-service `/service/*`. Lives in `medoc-assistant-service/contracts/` and is the only thing the Flutter dev needs to start (P64: three writers drift unless the contract is a file).
- **Friday integration demo every week** on the test number; the week's checklist below is the demo script. A slipped demo item goes to next week's top, nothing else is added.
- **Fable 5.1 on the security chain, whoever writes it**: `verifyJWT` dual audience, token mint, executor gate + strip/inject, tenancy helper, pending-action machine, `$vectorSearch` builder. Per-PR Fable `/review` by the manager before merge.
- **Session 1 of week 1 (backend engineer) starts with `npm ci && npx tsc --noEmit` on HPlus master.** Assistant work branches from master, not the MSF branches (those cannot build from a clean `npm ci`).
- **Git hygiene for three writers**: own clone or worktree per person; stage explicitly (never `git add -A`); never `git switch` a shared checkout; PRs only, no direct pushes; the manager merges.
- **Same-day review rule**: a PR the manager cannot review the same day blocks that author's next PR on the same repo, not their work.
- **Template fallback**: if custom templates are not approvable on the test WABA, the pilot uses free-form messages inside the 24-hour window; T14/T19 verify template *selection* with a stubbed sender; real and regional templates land when Business verification clears.

- **Milestones, each demoable, scariest unknowns first**: identity/geofence bypass and the Meta webhook (M0) before any agent work; reads before writes; RAG after audit exists.
- **One writing session per repo at a time**; cross-repo obligations land in the same PR set (listed per milestone).
- **Test-first for core logic** (permission gate, executor, pending-action machine, signature, dedup, vector query builder): write the failing test from the Test Queue, then the minimum code. All of T1–T22 are in scope.
- **Security-critical code written directly, not fanned out**: `verifyJWT` change, token minting, executor gates, tenancy helper. Research and boilerplate may be parallelised.
- **Every HPlus route addition = `npm run initialize`** to regenerate `route-hash-map.json`, `roles.json`, `action-group-map.json`, plus `Permissions.dart` and `.bru` updates.
- **Nothing ships to a hospital before**: permission-matrix green, tenant-isolation green, eval gate green for the enabled modules, one week on the dev number with that hospital's admin.
- **Honesty about coverage**: HPlus and Vigil have effectively no tests. Changes there get a targeted jest test plus manual Bruno verification; do not claim more.

## 2. Test Queue (from design.md Success Metrics — implement one at a time)

- [ ] T1 Link verify stores `{hospitalId, employeeId}` from the token, never from the body
- [ ] T2 Assistant token → HPlus `/auth/me` succeeds without lat/long
- [ ] T3 Axon token without lat/long is still rejected (regression guard)
- [ ] T4 Revoked link → next inbound denied, token cache cleared
- [ ] T5 Two-hospital link → hospital picker before any tool
- [ ] T6 Nurse without `newFinance.*` → finance tool hidden and executor throws Forbidden before HTTP (mock asserts zero calls)
- [ ] T7 Model-supplied `hospitalId` stripped; session hospital injected
- [ ] T8 `draft`/`excluded` catalogue entries never reach the model
- [ ] T9 Write → PENDING → Confirm executes once; second Confirm is a no-op
- [ ] T10 Pending action >10 min → "expired", nothing executes
- [ ] T11 Executed write → action log `createdFrom=WHATSAPP` + `sourceMessageId`
- [ ] T12 Duplicate Meta delivery processed once
- [ ] T13 Invalid `X-Hub-Signature-256` → 401, nothing queued
- [ ] T14 Closed 24-hour window → template only
- [ ] T15 HR doc under "HR": nurse with `hr.*` gets cited answer; nurse without gets none
- [ ] T16 Hospital A query never returns hospital B chunks; repository rejects non-`getDbName` DB names
- [ ] T17 Scanned PDF → Gemini page transcription → searchable chunks
- [ ] T18 Bot-created task has Vigil-valid status and appears in action-items feed
- [ ] T19 Due reminder → template if linked, else action item
- [ ] T20 Ions scoping: own transcripts / supervisor action items / super_admin any
- [ ] T21 Vigil Assistant tab visible while checked out
- [ ] T22 Eval gate: routing ≥ 90 %, false-write 0 %, language match ≥ 95 %

## 3. Schedule — full phase 1, 4 weeks, team of 3 (M = manager + Claude, B = backend engineer, V = Vigil/Flutter dev; numbers = sessions)

**Delivered at end of week 4**: everything in Decision 1 — all reviewed workflows in the first 6 modules, RAG with PDF/docx/xlsx/scan/vision, voice + photo, EN + HI + regional, Axon Ions (4 tabs), Vigil Assistant tab, admin dashboard preferences/links/categories, reminders + escalation, CI catalogue gate; permission-matrix, tenant-isolation and eval gates green; ready for the 1-week pilot in week 5. **Production go-live still waits on Meta Business verification.**

**Critical path**: B auth-service + `verifyJWT` (wk 1) → M link + agent (wk 2) → M writes (wk 2) → B RAG ingest (wk 2) → M RAG-in-agent + multimodal (wk 3) → M eval gate (wk 4). Everything V does is off the critical path until integration in week 3.

### Week 1 — foundations + contracts (demo: "who am I" answered without lat/long; webhook echoes; Vigil and Axon scaffolds render fixture data)
- [ ] M: contracts (`contracts/` types + `.bru` fixtures for all collections and routes) (2)
- [ ] M: webhook `GET/POST`, raw-body HMAC, `inbound_events` dedup ledger, queue publish, echo (T12, T13) (2)
- [ ] M: catalogue generator v1 from `route-hash-map.json`; review `todo`, `patient`, `appointment` (T8) (3)
- [ ] M: link flow `/api/link/*` with OTP limits + consent (T1) against a stub mint (2)
- [ ] M: Atlas `$vectorSearch` spike + Vertex smoke; service skeleton via background agent (2)
- [ ] M: reviews (3) — total 14
- [ ] B: HPlus master clean-build check; `medoc-auth-service` ASSISTANT audience, token builder, `whatsapp-link` model, service-key middleware, mint/links/revoke + denial tests (4)
- [ ] B: HPlus `jwtService` audience array, `verifyJWT` assistant branch behind flag, `requestContext` + `actionLog` `WHATSAPP`, jest with local RS256 + mocked JWKS, `/auth/me` self-read exemption after probing `auth.me.view` (T2, T3) (4)
- [ ] B: audience enum mirrors in `docApp-backend`, `me-backend`, `admin-dashboard-backend`, `compliant-dashboard-backend` + `TCreatedFrom` mirror (2)
- [ ] B: `TaskList` status/priority probe across dev DBs (dry run, recorded) → `todoSchema` enum + case normalise + `ITodo` fields (2)
- [ ] B: HPlus `src/features/assistant/` routes per contract + `npm run initialize` + `default_roles` + `schemaConfig` (4)
- [ ] B: Jenkins dev pipeline + nginx `/assistant/` (2) — total 18
- [ ] V: `medoc_plus_backend` audience enum + `jwtMiddleware.ts:21` + `ITodo` mirror + `collectionSchema` (2)
- [ ] V: `medoc_plus_backend` `src/features/assistant/` own-scope reads per contract (3)
- [ ] V: Vigil profile ListTile + `assistantHost`; assistant page scaffold wired into `_buildRolePages`, both bottom-nav branches, rail, on contract fixtures (5)
- [ ] V: Axon settings "WhatsApp Assistant" section + `assistantHost`; sidebar rename to Ions + gate; `IonsScreen` scaffold on fixtures (5) — total 15

### Week 2 — reads, writes, ingest (demo: Hindi appointment query; task created via Confirm and visible in ClickHouse; HR PDF ingested and indexed)
- [ ] M: sessions + hospital picker (T5); `permission.service` + Redis (T6) (2)
- [ ] M: router + agent loop reads only; language mirroring; executor read path strip/inject (T7) (3)
- [ ] M: `AssistantPendingActions` machine + buttons; executor write path (T9, T10, T11) (3)
- [ ] M: eval harness `test/eval/` + `run-eval.ts` + CI skeleton (2)
- [ ] M: reviews (4) — total 14
- [ ] B: `medoc-upload-service` `ASSISTANT_DOCS` scope, `getReadUrl` on provider interface, internal read-url route (2)
- [ ] B: `src/rag/`: ingest consumer, extractors `pdf-parse` / Gemini page transcription / `mammoth` / SheetJS / vision, chunker 800/100, classifier, embeddings ≤100/call, ACTIVE state (T17) (6)
- [ ] B: `vector.repository.ts` (`$vectorSearch`, filter in query, `maxTimeMS`, `getDbName`-only guard) + `ensure-vector-indexes` + **tenant-isolation test on two dev DBs** (T16) (4)
- [ ] B: `admin-dashboard-backend` `defaultRoles` mirror, action-logs `createdFrom` filter, `assistantEnabled`/`assistantLanguages` prefs + controller, categories read/override (3)
- [ ] B: Bruno `H+ backend/assistant/`, `todos/`, `service/` (1) — total 16
- [ ] V: Axon Ions 4 tabs (transcript, action items, documents, chat) against live HPlus routes; 15 s polling (T20) (5)
- [ ] V: Axon categories settings screen (`document_categories_settings.dart`) + `Permissions.dart` + `allPermissions` (3)
- [ ] V: Vigil assistant page live against `medoc_plus_backend`; visible while checked out (T21) (3)
- [ ] V: manual link/read/write test on the test number as each M item lands (3) — total 14

### Week 3 — RAG in the agent, tasks, multimodal, admin UI (demo: cited answer + "send 1" returns the PDF; nurse denied a finance doc; voice note answered; reminder arrives; admin revokes a link and the next message is denied)
- [ ] M: retrieval in the agent loop, permission filter in-query, citations, document send-back, `assistant_doc_ready` template (T15) (3)
- [ ] M: `AssistantActionItems`, `AssistantReminders` + worker scheduler (60 s, Redis lock), escalation, templates `assistant_task_assigned/_reminder/_escalation` (T18, T19) (3)
- [ ] M: voice via Gemini audio `inlineData`, photo OCR via Gemini vision with sharp resize, reply-language post-check (3)
- [ ] M: Vertex metering + per-hospital daily cap; TTL indexes; 24-h window guard (T14) (2)
- [ ] M: reviews (3) — total 14
- [ ] B: `Admin-Dashboard-Frontend` preferences toggle, `hospital/assistant/{links,categories}` pages, sidebar; `medoc-auth-service` preference mirror + link list/revoke/stats (6)
- [ ] B: catalogue modules `ipd` subset → `myAttendance` → `workforce`/`hr` self-service (manager reviews each) (4)
- [ ] B: `check-catalogue.ts` CI gate; Jenkins warn stage on `route-hash-map.json` change (2)
- [ ] B: load/abuse test harness against the dev stack (2)
- [ ] B: fixes from week-2 integration (2) — total 16
- [ ] V: hi + regional template variants (owner's language list from Q6) with the named speakers (3)
- [ ] V: Ions document download + Vigil action-items feed polish; Flutter fixes from integration (4)
- [ ] V: E2E checklist round 1 on the test number (link, switch hospital, read, write + confirm, cancel, expiry, voice, photo, doc upload → category → retrieval, admin revoke → denied) (4) — total 11

### Week 4 — gates, hardening, pilot prep (demo: every gate green; E2E round 2 clean; release builds of Axon and Vigil)
- [ ] M: eval gold set ~300 utterances (EN/HI/regional, per-module counts) with V + named speakers; eval gate (T22) (4)
- [ ] M: permission-matrix test on the full catalogue (deny before HTTP, zero-call mock) (1)
- [ ] M: `/review` + `security-review` on assistant-service, HPlus, auth-service, upload-service diffs; `check-invariants.sh` in every repo (3)
- [ ] M: `claude_md/repos.yaml` new repo + Vigil/jest fact fixes; assistant-service `CLAUDE.md`; §7 log (1)
- [ ] M: E2E round 2 + fixes (3) — total 12
- [ ] B: catalogue modules `newInventory` read + indent → `labsTests`/`radiology` reads (4)
- [ ] B: tenant + permission CI green in all repos; Jenkins prod pipeline + Vault path prep (3)
- [ ] B: fixes from E2E rounds (5) — total 12
- [ ] V: fixes from E2E rounds; Axon + Vigil release builds; pilot-admin onboarding doc (8) — total 8

| Week | M | B | V | Total |
|---|---|---|---|---|
| 1 | 14 | 18 | 15 | 47 |
| 2 | 14 | 16 | 14 | 44 |
| 3 | 14 | 16 | 11 | 41 |
| 4 | 12 | 12 | 8 | 32 |
| **Total** | **54** | **62** | **48** | **164** |

Against 216 available, that leaves ~24 % slack, most of it in week 4 and on V. The manager's 14/week is deliberately below 18: the difference is review and coordination, and it is the number most likely to be wrong. If M overruns, B takes `src/workmgmt/**` (reminders/escalation) in week 3. If B overruns, M6 modules beyond the first 3 slip to week 5, nothing else. **Never dropped**: T1–T3, T6, T7, T9, T12, T13, T16.

### 3b. Phase 2 (after the pilot)
Modules beyond the 6 reviewed; admin-dashboard tool bridge (Decision 20 open question); durable push to unlinked assignees (Q10); phone backfill (Q9).

### 3d. Task-level session estimate by milestone (lean baseline, 2026-09-04)

Raw build sessions only (1 session = 4 h). Review, rework and coordination are added at the bottom so the total reconciles with the lean baseline of ~110. "Required interference" = what a human or external party must supply before or during the task; "None" still needs one PR review. **Calibrate in week 1**: log actual sessions against the first ten rows; re-baseline weeks 2–4 if generation-bound rows come in under half and environment-bound rows at or over.

| M | Objective | Task | Sessions | Required interference |
|---|---|---|---|---|
| M0 | Prove identity bypass, webhook, infra | Service skeleton (env, db with `getDbName`, Redis, RabbitMQ, health, jest, tsup, Dockerfile) | 1 | None |
| M0 | | Contracts file: 12 collection schemas + route shapes + `.bru` fixtures | 1 | Manager signs off shapes |
| M0 | | Meta webhook GET/POST, raw-body HMAC, `inbound_events` dedup, queue publish, echo (T12, T13) | 1.5 | Meta app, test number, app secret in env |
| M0 | | auth-service: ASSISTANT audience, token builder, whatsapp-link model, service-key middleware, mint/links/revoke + denial tests | 2 | Vault entry for service keys |
| M0 | | HPlus `jwtService` audience array, `verifyJWT` assistant branch behind flag, `requestContext`, `actionLog` WHATSAPP, jest with RS256 + mocked JWKS (T2, T3) | 3 | HPlus master must build clean; Fable review |
| M0 | | `auth.me.view` probe on real hospital DB, self-read exemption decision | 0.5 | Dev DB access |
| M0 | | `medoc_plus_backend` audience enum + `jwtMiddleware` | 0.5 | None |
| M0 | | Audience enum mirrors in 4 backends + `TCreatedFrom` mirror | 0.5 | None |
| M0 | | Atlas `$vectorSearch` spike with `permissionModules` filter; Vertex smoke in asia-south1 | 1 | Atlas cluster with Vector Search; GCP project |
| M0 | | DevOps: Jenkins dev pipeline, Vault path, nginx `/assistant/` | 1.5 | Jenkins creds; live nginx box access |
| M0 | | Meta Business verification + first template submission | 0 | Owner, external 1–4 wk |
| **M0** | | **Subtotal** | **12.5** | |
| M1 | Link from app, answer read queries in user's language | `/api/link` start, verify, revoke, status: JWKS bearer, E.164, OTP limits, consent (T1, T4) | 1.5 | Engineer phone on test number |
| M1 | | `assistant.sessions` + hospital picker interactive list (T5) | 1 | None |
| M1 | | `permission.service`: `/auth/me` + expansion via `permission-index.json`, Redis 5 min (T6) | 1 | None |
| M1 | | Catalogue generator v1 from `route-hash-map.json` → drafts | 1 | None |
| M1 | | Human review of `todo`, `patient`, `appointment` modules → reviewed catalogue (T8) | 1.5 | Domain reviewer decides exposed routes |
| M1 | | Router + agent loop reads only, language mirroring | 2 | Vertex access |
| M1 | | Executor read path: strip/inject `hospitalId`, permission gate before HTTP (T7) | 1 | Fable review |
| M1 | | `DEV_PHONE_WHITELIST` + rate limits | 0.25 | None |
| M1 | | Eval harness `test/eval`, `run-eval.ts`, CI gate skeleton | 1 | None |
| M1 | | Axon settings section + `assistantHost`; `assistant.link/status` route → hash map + `Permissions.dart` | 1.5 | Flutter build env; visual QA |
| M1 | | Vigil profile ListTile + `assistantHost` | 0.5 | Flutter visual QA |
| M1 | | Bruno files | 0.25 | None |
| **M1** | | **Subtotal** | **12.5** | |
| M2 | Confirmed writes, audit trail, tasks and reminders | `AssistantPendingActions` state machine + buttons, confirm-once, expiry (T9, T10) | 1.5 | Fable review |
| M2 | | Executor write path + action log `createdFrom`/`sourceMessageId` (T11) | 1 | Fable review; ClickHouse dev to verify |
| M2 | | `TaskList` status/priority probe across hospital DBs, dry run recorded | 0.5 | Dev DB access; owner OK on normalisation |
| M2 | | HPlus `todoSchema` `z.enum` + case normalise + `ITodo` fields + `GET actionItems` | 1 | None |
| M2 | | `medoc_plus_backend` `ITodo` mirror | 0.25 | None |
| M2 | | `AssistantActionItems`, `AssistantReminders`, worker scheduler 60 s with Redis lock, escalation (T18, T19) | 2 | None |
| M2 | | Templates `task_assigned`, `reminder`, `escalation` | 0.5 | Meta template approval |
| M2 | | Vertex usage metering + per-hospital daily cap | 0.5 | None |
| M2 | | `admin-dashboard-backend` `defaultRoles` mirror + action-logs `createdFrom` filter | 0.5 | None |
| M2 | | Bruno todos | 0.25 | None |
| **M2** | | **Subtotal** | **8** | |
| M3 | Transcripts and action items inside Axon and Vigil | HPlus `src/features/assistant` routes (conversations, messages, actionItems, documents, categories CRUD, audit, link/status) + `npm run initialize` + `default_roles` + `schemaConfig` | 2 | Fable review on scoping (T20) |
| M3 | | `medoc_plus_backend` assistant own-scope reads + `collectionSchema` | 1 | None |
| M3 | | Axon: sidebar rename and gate, `feature_access` label, `IonsScreen` 4 tabs, service, provider, 15 s polling, `Permissions.dart` (T20) | 3 | Product OK on "Ions" name; Flutter visual QA |
| M3 | | Vigil: assistant page, `_buildRolePages`, both bottom-nav branches, rail, visible when checked out (T21) | 2 | Flutter visual QA |
| M3 | | Bruno assistant folder | 0.25 | None |
| **M3** | | **Subtotal** | **8.25** | |
| M4 | Role-scoped document answers with citations | upload-service `ASSISTANT_DOCS` scope, `AssistantUploads`, `getReadUrl` with Azure SAS, internal read-url route | 1 | Azure Blob dev creds |
| M4 | | Ingest consumer: download, store, extract via `pdf-parse`, Gemini page transcription, `mammoth`, SheetJS, vision; chunk 800/100; classify; uploader picker; embed; ACTIVE (T17) | 3 | Vertex; sample documents from a hospital |
| M4 | | `vector.repository` with `$vectorSearch`, filter in query, `maxTimeMS`, `getDbName` guard + `ensure-vector-indexes` | 1.5 | Fable review |
| M4 | | Tenant-isolation integration test on two dev hospital DBs (T16) | 1 | Two dev DBs on Atlas |
| M4 | | Retrieval in agent loop, citations, document send-back, `doc_ready` template (T15) | 1.5 | Template approval |
| M4 | | Categories seed + HPlus categories CRUD + Axon categories settings screen | 1.5 | Hospital admin picks category set; Flutter QA |
| M4 | | Admin: `assistantEnabled` and `assistantLanguages` prefs model, controller, page toggle; categories override; auth-service preference mirror | 1.5 | None |
| M4 | | TTL indexes: messages 180 d, inbound 7 d, pending 10 min | 0.25 | Owner answer on retention (Q7) |
| **M4** | | **Subtotal** | **11.25** | |
| M5 | Voice, photo, regional languages | Voice notes via Gemini audio → transcript + language | 0.75 | Vertex |
| M5 | | Photo OCR via Gemini vision + sharp resize | 0.75 | None |
| M5 | | Reply-language post-check | 0.5 | None |
| M5 | | Hindi + regional template variants | 1 | Owner language list (Q6); native speakers; Meta approval per variant |
| M5 | | Admin link list, revoke pages, stats | 1 | None |
| **M5** | | **Subtotal** | **4** | |
| M6 | More modules, gates, pilot readiness | Modules `ipd` subset, `myAttendance`, `workforce`/`hr`, `newInventory` read + indent, `labsTests`/`radiology` (1 each) | 5 | Domain reviewer per module |
| M6 | | `check-catalogue.ts` CI gate + Jenkins warn stage on `route-hash-map` change | 1 | Jenkins |
| M6 | | Load and abuse tests | 1 | Dev stack |
| M6 | | Eval gold set ~300 utterances + eval gate (T22) | 2.5 | Native speakers; domain labelling |
| M6 | | Permission-matrix test on full catalogue | 0.5 | None |
| M6 | | `/review` + `security-review` on all repos; `check-invariants` | 1.5 | Manager review time |
| M6 | | Manual E2E rounds ×2 on test number | 2.5 | 3 phones; pilot admin |
| M6 | | `repos.yaml`, `CLAUDE.md`, docs; Axon and Vigil release builds; pilot onboarding | 1 | Flutter signing keystore |
| **M6** | | **Subtotal** | **15** | |
| | | **Raw build total** | **71.5** | |
| | | Rework and integration debugging, 25 % | 18 | |
| | | Manager PR review across 3 writers | 13 | |
| | | Contracts drift and coordination, 10 % | 7 | |
| | | **Lean total** | **~110** | |

Sixteen rows depend on Meta, Vertex, Atlas, or a named human; every one of them maps to a Day-0 checklist item (§0). The padded ceiling from the first pass of §3 was 164; the lean total is the working number.

### 3c. Original milestone breakdown (kept for reference; §3 governs sequencing and ownership)

### M0 — Foundations
**Demo**: "who am I" over WhatsApp → assistant mints a token → HPlus `/auth/me` answers without lat/long.
- Repo `medoc-assistant-service` (new): skeleton (env singleton, `config/db.ts` with `getDbName` semantics copied from `HPlus-Backend/src/db/db.ts:174-200`, Redis, RabbitMQ topology from `web_sockets_server/src/webSockets/services/rabbitmqService.ts:31-131`, health, jest harness from `Support-Dashboard-Backend`, Dockerfile in HPlus shape, tsup entries `src/index.ts` + `src/worker.ts`).
- Meta: dev number, `GET/POST /webhooks/whatsapp` with verify token, raw-body HMAC (`timingSafeEqual`), `inbound_events` ledger, publish to `assistant.inbound.q`, echo reply. Submit Business verification and templates.
- `medoc-auth-service`: audience `ASSISTANT_TOKEN`, app name `ASSISTANT`, token-payload builder, `whatsapp-link.model.ts`, `SERVICE_API_KEYS` env, `service-key.middleware.ts`, `POST /service/assistant-token`, `/service/assistant-links`, `/service/assistant-links/revoke`; activity log event. (`npm install` here — no lockfile.)
- `HPlus-Backend`: `jwtService.verifyToken` accepts `string | string[]`; `verifyJWT` assistant branch behind `ASSISTANT_AUDIENCE_ENABLED`; `requestContext` `createdFrom`/`sourceMessageId`; `actionLog.ts:219` uses context; `actionLog.model.ts:39` adds `WHATSAPP`. **Verify `auth.me.view` coverage on a real hospital DB; if any role lacks it, exempt self-read of `/auth/me` in `permissionMiddleware`.** Jest test with local RS256 keys + mocked JWKS.
- `medoc_plus_backend`: audience enum + `jwtMiddleware.ts:21` accepts both.
- Atlas spike: `$vectorSearch` with `permissionModules` filter on a dev `hos_` DB; confirm tier + `createSearchIndex`. Verify Gemini 2.5 Pro/Flash + `gemini-embedding-001` in `asia-south1`.
- `Medoc_DevOPs`: dev Jenkins pipeline, Vault path, nginx `/assistant/` (reconcile the drifted live config).
- **Same-PR duties**: audience enum in `docApp-backend`, `me-backend`, `admin-dashboard-backend`, `compliant-dashboard-backend`; `TCreatedFrom` mirror in `admin-dashboard-backend/src/actionLogs/`.

### M1 — Link + read tools
**Demo**: nurse links from Axon, asks "kal Dr. Sharma ke appointments?" and gets the list in Hindi.
- Assistant: `/api/link/{start,verify,revoke,status}` (JWKS-verified Axon/Vigil bearer; E.164 via `HPlus-Backend/src/utils/phoneNumber.utils.ts` rule; OTP 6 digits / 5 min / 5 attempts / 3 starts per hour; consent text + `consentAt`); `assistant.sessions` + hospital picker (interactive list); `permission.service.ts` (`/auth/me` + expansion via `permission-index.json`, Redis 5 min); catalogue generator v1 + reviewed `todo`, `patient`, `appointment`; router + agent loop (reads only); language mirroring; `DEV_PHONE_WHITELIST`.
- **Eval harness** (`test/eval/`, `scripts/run-eval.ts`, CI gate) built before the first live hospital.
- `hospital-plus-frontend`: "WhatsApp Assistant" section in `features/account/settingsPage.dart`, `assistantHost` in `api_urls.dart`.
- `MedocPlus-Frontend-V2`: ListTile in `profile/presentation/profile_page.dart` (beside `:233`), `assistantHost` in `api_routes.dart`.
- **Same-PR duties**: `assistant.link/status` route in HPlus → hash map + `Permissions.dart`; `.bru` files.

### M2 — Writes + audit + tasks
**Demo**: create and assign a task by text, confirm with a button, see it in ClickHouse tagged WHATSAPP; assignee gets a reminder.
- Assistant: `AssistantPendingActions` state machine + buttons; executor write path; `AssistantActionItems`; `AssistantReminders` + worker scheduler (60 s tick, Redis lock) + escalation; templates `assistant_task_assigned/_reminder/_escalation`; Vertex usage metering + per-hospital daily cap.
- `HPlus-Backend`: **probe `TaskList.status`/`priority` values across hospital DBs first** (Axon stub sends lowercase `'pending'`, `sample_tasks.dart:25`); normalise case server-side; then `todoSchema.ts:9-10` → `z.enum` with Vigil's values; add `dueAt?, createdFrom?, sourceMessageId?, assigneeNotify?` to `ITodo`; `GET /api/assistant/actionItems?scope=mine|team`.
- `medoc_plus_backend`: mirror `ITodo` fields.
- `admin-dashboard-backend`: `defaultRoles.ts` mirror; action-logs filter by `createdFrom`.
- **Same-PR duties**: `ITodo` shape in both backends + `medoc-bruno-api-collections/H+ backend/todos/*.bru`; `defaultRoles.ts` in both repos.

### M3 — Ions + Vigil section
**Demo**: Axon sidebar shows "Ions" with Assistant transcript, Action items, Documents, Chat tabs; Vigil shows an Assistant tab even when checked out; super_admin opens any transcript.
- `HPlus-Backend`: `src/features/assistant/` (`conversations/me`, `conversations/me/:id/messages`, `actionItems`, `documents/me`, `categories` CRUD, `conversations` audit, `link/status`); `npm run initialize`; `assistant.*` in `default_roles` (super_admin audit only); `ECollectionName` additions in `schemaConfig.ts`.
- `hospital-plus-frontend`: `sidebarcontent.dart:232` title `Ions`, `:321` header, gate `chats.* || assistant.*`; `feature_access.dart:13` label; `features/communication/ions/` (`IonsScreen`, service, provider); `messages.dart` renders `IonsScreen`; `Permissions.dart` + `allPermissions`.
- `medoc_plus_backend`: `src/features/assistant/` own-scope reads; `collectionSchema.ts` additions.
- `MedocPlus-Frontend-V2`: `lib/src/assistant/` page; add to `_buildRolePages()` (`mainnavigation.dart:381-400`), both bottom-nav branches (`:2151-2206`), rail (`:1516-1538`).
- Polling 15 s while visible.
- **Same-PR duties**: hash-map regen, roles/defaultRoles, `Permissions.dart`, `ECollectionName` in both backends, `.bru`.

### M4 — RAG
**Demo**: HR uploads the leave policy → nurse asks about casual leave → cited answer + "send 1" returns the PDF; nurse cannot retrieve a finance document.
- `medoc-upload-service`: scope `ASSISTANT_DOCS` (`meta-data.model.ts:55-70`), collection `AssistantUploads`; `getReadUrl` on the provider interface (Azure `BlobSASPermissions.parse("r")`, mirror of `azure-storage-provider.ts:47-53`); `POST /api/uploads/internal/read-url` (`validateApiKey`).
- Assistant: `assistant.ingest.q` consumer (download → store → extract: `pdf-parse` / Gemini page transcription / `mammoth` / SheetJS / vision → chunk 800/100 page-aware → classify → uploader picker → embed ≤100/call → ACTIVE); `vector.repository.ts` (`$vectorSearch`, filter inside query, `maxTimeMS`); `scripts/ensure-vector-indexes.ts` + lazy ensure; categories seed; citations; document send-back; templates `assistant_doc_ready`; TTL indexes (messages 180 d, inbound 7 d, pending 10 min).
- `HPlus-Backend` + `hospital-plus-frontend`: categories CRUD routes + Axon Accounts screen (`account/assistant/presentation/document_categories_settings.dart`).
- `admin-dashboard-backend`/`Admin-Dashboard-Frontend`: `assistantEnabled`, `assistantLanguages` in `hospitalPreferences.model.ts:59-62` + controller + preferences page toggle; categories read/override; `medoc-auth-service` preference model mirror.
- **Same-PR duties**: `assistant.categories.*` permissions; preference model mirrored in auth-service.

### M5 — Multimodal + languages
- Voice notes via Gemini audio `inlineData` → `{transcript, language}`; photo OCR via Gemini vision (sharp resize as in `ocr_processor.ts:44-52`); reply-language post-check; hi + regional template variants; admin link list/revoke pages + stats.

### M6 — Catalogue expansion + hardening (first 6 modules in phase 1, then ongoing)
- Reviewed modules: `ipd` subset → `myAttendance` + `workforce`/`hr` self-service → `newInventory` read + indent → `labsTests`/`radiology` reads → rest on demand.
- CI catalogue gate (`check-catalogue.ts`), Jenkins warn stage in HPlus when `route-hash-map.json` changes, load/abuse tests, per-hospital rollout gate.

## 4. Files to change (by repo)

### New: `medoc-assistant-service`
```
src/index.ts, src/worker.ts, src/app.ts, src/container.ts
src/config/{env,db,redis,rabbitmq}.ts
src/models/{whatsapp-link,session,conversation,message,pending-action,inbound-event,outbound-message,document,chunk,document-category,reminder}.model.ts, src/models/enum/*
src/routes/{webhook,link,internal,health}.routes.ts · src/controllers/{webhook,link,internal}.controller.ts
src/middlewares/{meta-signature,jwks-auth,service-key,raw-body,async.handler,error.handler}.ts
src/whatsapp/{meta-client,payload.types,window.service,template.registry}.ts
src/identity/{link,token,session,permission}.service.ts
src/tools/{catalogue.loader,tool.selector,tool.executor,confirmation.service}.ts, src/tools/backends/{hplus,vigil}.client.ts
src/agent/{vertex.client,router,agent.loop,language.service,transcription.service,ocr.service}.ts, src/agent/prompts/*
src/rag/{ingest.service,chunker,embeddings,vector.repository,category.service,classifier,citations}.ts, src/rag/extract/{pdf,docx,xlsx,vision}.ts
src/workmgmt/{task.service,reminder.scheduler,escalation.service}.ts
src/queues/{inbound,outbound,ingest}.consumer.ts, src/queues/publishers.ts
src/utils/{logger,phone,errors}.ts
catalogue/{manifest.json, hplus/<module>.json, vigil/<module>.json, permission-index.json, embeddings/, drafts/}
scripts/{generate-catalogue,review-catalogue,check-catalogue,ensure-vector-indexes,replay-webhook,run-eval}.ts, scripts/enforce-ci.js
test/{__tests__,fixtures/meta,eval}, jest.config.js, tsup.config.ts, Dockerfile, CLAUDE.md
```

### `medoc-auth-service`
- `src/models/enum/audience.enum.ts`, `app-name.enum.ts`, `db-collection-name.enum.ts` — new values
- `src/utils/token-payload.utils.ts:16-25` — ASSISTANT builder; `src/utils/app-audience.utils.ts` — mapping
- `src/models/whatsapp-link.model.ts` (new); `src/models/hospital-preference.model.ts` — `assistantEnabled`
- `src/config/env.ts` — `SERVICE_API_KEYS`, `ASSISTANT_TOKEN_EXPIRY`
- `src/middlewares/service-key.middleware.ts`, `src/routes/service.routes.ts`, `src/controllers/service.controller.ts`, `src/services/assistant-token.service.ts` (new); `src/routes/api-router.routes.ts` — mount

### `HPlus-Backend`
- `src/services/jwtService.ts:40-52` — audience array, extended payload type
- `src/features/auth/ctrl_func.ts:280-371` — assistant branch (flagged), context setters; `:123-176` — optional `/auth/me` self-read exemption
- `src/middlewares/requestContext.ts` — `createdFrom`, `sourceMessageId`
- `src/configs/actionLog.ts:206-219`; `src/db/actionLog.model.ts:39`
- `src/features/todos/{todoSchema.ts, todoModel.ts, todoController.ts}` — enums, new fields
- `src/features/assistant/*` (new) + `src/apiRouter.ts` mount; `src/configs/schemaConfig.ts` — collections; `src/access_permission/default_roles/defaultRoles.ts`; regenerate `route-hash-map.json`, `roles.json`, `action-group-map.json`

### `medoc_plus_backend`
- `src/medoc-auth/enums/audience.enum.ts`; `src/middlewares/jwtMiddleware.ts:21`
- `src/features/todos/todoModel.ts`; `src/features/assistant/*` (new); `src/apiRouter.ts`; `src/db/collectionSchema.ts`

### `hospital-plus-frontend`
- `lib/src/navigation/sidebarcontent.dart:230-233,321`; `lib/src/constants/feature_access.dart:13`
- `lib/src/features/communication/messages.dart`; `lib/src/features/communication/ions/**` (new)
- `lib/src/features/account/settingsPage.dart` + `account/assistant/**` (new)
- `lib/src/constants/APIs/{api_urls.dart, Permissions.dart}`

### `MedocPlus-Frontend-V2`
- `lib/src/routes/mainnavigation.dart:381-400, 1516-1538, 2151-2206`; `lib/src/profile/presentation/profile_page.dart`
- `lib/src/assistant/**` (new); `lib/src/constants/api_routes.dart`

### `admin-dashboard-backend` / `Admin-Dashboard-Frontend`
- `src/models/hospitalPreferences.model.ts:34-41,59-62`; `src/controllers/hospital/hospitalPreferences.controller.ts:18-31`
- `src/routes/assistant.routes.ts` (new) + `src/api.router.ts`; `src/services/defaultRoles.ts`; `src/actionLogs/actionLog.model.ts` (`createdFrom`)
- FE: `src/app/(admin)/dashboard/hospital/preferences/page.tsx`; `hospital/assistant/{links,categories}` (new); `src/constants/sidebar.ts`

### `medoc-upload-service`
- `src/meta-data/meta-data.model.ts:55-70`; `src/config/db.enum.ts`; `src/storage-provider/{storage-provider.interface.ts, azure-storage-provider.ts, cloudinary-storage-provider.ts}`; `src/upload/upload.routes.ts` + controller

### Others
- `docApp-backend`, `me-backend`, `compliant-dashboard-backend`: audience enum only
- `medoc-bruno-api-collections`: `H+ backend/assistant/`, `H+ backend/todos/`, `Authentication and Authorization/service/`
- `Medoc_DevOPs`: `Jenkins/{prod,dev}/backend/*medoc-assistant-service`, `Jenkins/nginx-cofig/default`
- `claude_md/repos.yaml`: add the new repo; fix Vigil persona and HPlus jest-config facts

## 5. Verification

- [ ] Assistant unit tests green (signature, dedup, E.164, permission expansion vs fixture map, selector caps, executor inject/strip, pending-action machine, window, chunker, vector pipeline builder)
- [ ] Permission-matrix test green on every catalogue change (deny before HTTP, mock asserts zero calls)
- [ ] Tenant-isolation integration test green on dev Atlas (two hospital DBs)
- [ ] Webhook replay fixtures pass (`text, button, list, document, audio, image, status, duplicate`)
- [ ] HPlus `verifyJWT` jest test (assistant branch + Axon regression) green; `npx tsc --noEmit` clean in every touched repo
- [ ] auth-service mint endpoint denial paths tested (link revoked, credential disabled, hospital disabled, wrong service key)
- [ ] Eval gate green for each enabled module (routing ≥ 90 %, false-write 0 %, language ≥ 95 %)
- [ ] Manual E2E checklist on dev number with whitelist: link, switch hospital, read, write + confirm, cancel, expiry, voice, photo, doc upload → category → retrieval, admin revoke → denied
- [ ] `check-invariants.sh` / husky pass in every touched repo (no `client.db()`, no fallback secrets, no PHI logs)
- [ ] `TaskList` probe results recorded before enum change (dry run)

## 6. Open questions for the owner (answer before M0 ends)

1. Is there a verified Meta Business Manager independent of AiSensy? (verification + template approval are on the critical path)
2. Per-hospital monthly cap on billed template messages?
3. Confirm Gemini 2.5 Pro/Flash and `gemini-embedding-001` availability in `asia-south1` and that Google's DPA covers PHI under DPDP.
4. Atlas tier / search nodes budget for per-hospital vector indexes.
5. Confirm: no admin-dashboard tools in phase 1.
6. Which regional languages need template variants in phase 1?
7. Transcript retention 180 days OK? Who is super_admin for audit?
8. Confirm: all writes via HPlus, Vigil read-only for the bot.
9. Should verified links backfill/normalise `Employee.ContactDetails.phoneNumber`?
10. Acceptable that unlinked assignees only see tasks on opening Ions/Vigil (no durable push)?

## 7. Execution Log

### Session 1 — 2026-09-04
- [x] Explored HPlus/Axon, Vigil, Admin, WhatsApp, upload, auth, infra (three read-only agents; findings verified in source)
- [x] Owner decisions 1–8 captured
- [x] Architecture designed and self-reviewed (7-dimension review; REVISE items folded in)
- [x] Spec written (`design.md`, `decisions.md`, `implementation.md`)
- [ ] Owner review of spec

### Session 2 — 2026-09-04 (later)
- [x] Owner set capacity: 1 engineer, 3 × 4 h sessions/day, 6 days/week, **4-week hard target**
- [x] Re-estimated: full phase 1 = 72–86 sessions + rework (9–11 wk at 10/wk, 5–6 wk at 18/wk); 4 weeks needs a ~30 % cut
- [x] Phase 1a schedule (§3), Day-0 checklist (§0), 1b deferrals (§3b) written; self-reviewed (`/review-plan` REVISE → 4 mitigations added → APPROVE); owner approved
- [x] Decision 22 recorded in `decisions.md`
- [x] Owner rejected the scope cut and added 2 engineers (Vigil/Flutter dev, backend engineer; manager drives Claude). Re-planned for full phase 1 in 4 weeks with repo ownership per person, contracts-first week 1, weekly integration demo. Decision 22 rev 2.
- [x] Owner challenged the session estimate as high; re-baselined: generation-bound rows halved, environment/human-bound rows held. Lean total ~110 vs padded 164. Task-level table added as §3d with per-row required interference; week-1 calibration rule.
- [x] `workflow.md` written: 32 flows (F01–F32), 13 personas, role-derived menus (30 row ids), state machine, 70-message EN+HI catalogue, 13 templates, coverage matrix, 10 code-enforced rules, 5 open items. Showcase `workflow.html` published as artifact e14cd0ec (Conversation Map).
- [ ] Day-0 checklist (§0) — owner
- [ ] Week 1, day 1: M writes `contracts/`; B runs the HPlus master clean-build check
- [ ] End of week 1: log actual sessions against §3d rows 1–10, re-baseline if needed

## 8. Learnings
- `medoc_plus_backend/CLAUDE.md` calls Vigil "Medoc super-admins"; the code is a floor-staff app (nurse/paramedic/pharma/phlebo). Fix `claude_md/repos.yaml`.
- `HPlus-Backend/CLAUDE.md` says no jest config; `jest.config.js` exists on disk. Confirm `npm test` runs, then fix `repos.yaml`.
- `/auth/me` is permission-gated like every other route; default non-super-admin roles seed with zero permissions.
- Both Axon and Vigil clients call endpoints that do not exist (`api/chats/send`, `api/task/addTask`, `api/task/deleteTask`); client code is not a reliable guide to the live API.
- The tracked nginx config has drifted from the live box (`auth2.0`, `medoc-upload` locations missing).
