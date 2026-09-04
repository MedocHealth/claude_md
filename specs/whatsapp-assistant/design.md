# Medoc WhatsApp Assistant — Design

Status: DRAFT for owner review · Author: planning session 2026-09-04 · Companion files: `decisions.md`, `implementation.md`

---

## 1. Problem Statement

Hospital staff must navigate three separate apps (Axon/Hospital+, Vigil/Medoc+, Admin dashboard) and ask colleagues for documents and patient data; training is slow and the HMIS is hard to use. We want one WhatsApp assistant, on the staff member's own phone, that can do everything those apps do under the same role-based access, answer questions from any document the hospital sends it, and manage internal work, with its conversations and action items mirrored back into Axon ("Ions") and Vigil.

### Why it matters
- **Training**: a new nurse or receptionist can start working on day one by messaging in Hindi or English instead of learning 30 screens.
- **Navigation**: managers and administrators stop hunting for documents and patient data across people and places.
- **Adoption**: WhatsApp is already on every staff phone; no app install, no login screen.
- **Strategic**: this becomes the primary interface and a path to replacing the HMIS front-end.

## 2. Current Behavior (verified against source on 2026-09-04)

| Area | Today |
|---|---|
| Feature surface | Axon backend (`HPlus-Backend`) exposes **777 permissioned routes / 778 permission strings** across 31 modules (OPD, IPD, HRMS, LIMS, RIS, billing, inventory, blood bank, registers, workforce, tasks). Vigil (`medoc_plus_backend`) exposes ~25 modules for floor staff. Admin dashboard onboards hospitals, manages users, preferences, forms, payments. |
| Identity | `medoc-auth-service` issues RS256 JWTs (claims `{userId, hospitalId, appName, employeeId}`), audiences `axon_service_token` / `vigil_service_token`. Only HPlus and Vigil verify via JWKS; admin-dashboard uses its own HS256. Login is password-only; **no phone or OTP login exists**. Staff phone numbers are free-text in the per-hospital `Employee` record, unindexed, unverified, and one number can belong to staff at several hospitals. |
| Location gate | Every Axon request must carry `latitude`/`longitude` headers and pass a per-hospital geofence (`HPlus-Backend/src/features/auth/ctrl_func.ts:292-294, 331-344`). |
| RBAC | Hash-based, per-hospital, runtime-editable in Axon (`/api/permission/*`, `ManageRoles.dart`). Effective permissions = role ∪ employee extras, read from tenant `Access` + `Roles` collections. `/auth/me` returns the user's permitted route strings. Vigil has **no permission layer** (role string + attendance state only). |
| WhatsApp | All outbound goes through AiSensy (a BSP). `whatsapp-delivery-service` is outbound-only, single-DB, no `hospitalId` on payloads. **Zero inbound webhook code anywhere in 89 repos.** The same AiSensy key is hardcoded as a fallback in five repos. |
| Chat / messages | Axon has a dormant staff-to-staff chat under "Messages" (`Chats` collection, in-process WebSocket, frontend calls a non-existent `api/chats/send`). Vigil has an orphaned chat page. The two backends write **incompatible `IChat` shapes to the same `Chats` collection**. Notifications live in an in-memory Map (not durable). |
| Tasks | `TaskList` collection exists in both backends (`/api/todo` in HPlus, `/task` in Vigil). Vigil has richer status/priority enums; HPlus's Zod schema leaves them as bare strings. Axon's Tasks UI is a stub. |
| AI | Gemini used for invoice OCR (HPlus), voice/scribe (docApp), device uploads (DA-Sync). **No embeddings, vector store, or RAG anywhere.** |
| Files | `medoc-upload-service` (Azure Blob / Cloudinary, signed-URL upload). Stored Azure URLs carry no read token, so **no service can read a stored file back** today. No text extraction. |
| Multi-tenancy | Database per hospital (`hos_XXXXXX_db`), registry in `MedocGlobal_DB.Hospitals`; every access goes through `getCollection`/`getDbName`. |
| Infra | Azure VMs, Jenkins → SSH → Vault → PM2. nginx reverse proxy. RabbitMQ, Redis, ClickHouse (action logs), MongoDB Atlas. |

## 3. Requirements

### 3.1 Functional
| ID | Requirement |
|---|---|
| F1 | A linked staff member can perform, over WhatsApp, any action they are permitted to perform in Axon; phase 1 covers patient lookup + OPD appointments, IPD floor ops, tasks/work management, HR + inventory self-service, and document RAG. |
| F2 | Access is enforced by Axon's RBAC: a tool is visible and executable only if the employee holds the corresponding permission hash; HPlus re-enforces on every call. |
| F3 | Staff link their WhatsApp number from inside Axon or Vigil via OTP; hospital admins can view and revoke links; multi-hospital staff choose the active hospital per session. |
| F4 | Every write action is previewed and executed only after the user taps **Confirm**; reads execute immediately. |
| F5 | Every write is audit-logged with `createdFrom=WHATSAPP` and the WhatsApp message id. |
| F6 | Staff can send any document (PDF, image, DOCX, XLSX, photo of paper); the bot files it under an admin-defined category, and later answers questions from it with citations, only to staff whose permissions map to that category. |
| F7 | Staff can create/assign tasks, set reminders, and escalate; assignees get WhatsApp reminders (if linked) or see them in-app. |
| F8 | Each staff member sees their own bot transcript and action items in Axon "Ions" and in a new Vigil section; supervisors see action items (not transcripts); super_admin can audit transcripts. |
| F9 | Input in English, Hindi and regional Indian languages (reply in the same language), voice notes (transcribed), and photos (OCR). |
| F10 | Per-hospital enablement and configuration from the Admin dashboard (toggle, languages, categories, links, usage). |

### 3.2 Non-functional
| ID | Requirement |
|---|---|
| N1 | **Tenant isolation by construction**: all tenant data lives in the hospital's own DB; `hospitalId` comes only from the verified session, never from the model or request body. |
| N2 | **No new secrets in code**; all config from Vault; no fallback defaults. |
| N3 | **No PHI in logs**; log tool names, status codes, ids only. |
| N4 | PHI may be sent over WhatsApp to linked staff and to the LLM; LLM = Gemini via Vertex AI in `asia-south1`. |
| N5 | Webhook acknowledges Meta within 1 s; duplicate deliveries are idempotent. |
| N6 | Bot-initiated messages outside the 24-hour window use approved templates only. |
| N7 | Deterministic guardrails (permission, kind, injection, schema validation) run in code before any tool executes. |
| N8 | Agent accuracy is measured by an eval set with a CI gate before any module is enabled for a hospital. |
| N9 | Transcript retention 180 days (TTL), action items and audit logs indefinite (proposed; owner to confirm). |
| N10 | Match each repo's existing architecture and version; no `any`, no casts, explicit return types. |

## 4. Alternatives Considered

### Alternative A: Hand-written intents per workflow (classic chatbot)
- Pros: predictable, easy to test, no tool catalogue.
- Cons: 777 routes × intents × languages is unbounded work; every new Axon route needs bot work; contradicts "all workflows" scope.
- Why rejected: does not scale to phase-1 scope; a generic tool-calling agent over the existing API is the only approach that keeps parity as Axon grows.

### Alternative B: Build the bot inside `HPlus-Backend`
- Pros: direct DB access, no token minting, one deploy.
- Cons: HPlus's global middleware demands GPS headers and RBAC on every route; its JSON parser has no raw-body hook for webhook signatures; it is `tsc`/legacy; the bot needs long-running consumers, Vertex SDKs, and per-hospital vector collections.
- Why rejected: forces invasive changes into the flagship backend; a separate service calling HPlus *as the user* keeps HPlus as the single enforcement point.

### Alternative C: Stay on AiSensy for inbound
- Pros: existing vendor relationship, one WABA.
- Cons: AiSensy's inbound/Flow capabilities are weaker than Cloud API for a conversational agent (interactive lists, buttons, media download, statuses); dependence on a BSP for every feature.
- Why rejected: owner chose Meta Cloud API direct; AiSensy remains for legacy templates.

### Alternative D: Long-context Gemini over whole documents instead of a vector store
- Pros: no vector infra; already proven in DA-Sync.
- Cons: role-mapped category filtering needs pre-filtered retrieval; cost grows with corpus size per query.
- Why rejected for phase 1: Atlas Vector Search gives tenant isolation and permission filtering in the query; long-context remains a fallback for single-document Q&A.

### Alternative E: ChromaDB (already used by face-auth service)
- Pros: existing wrapper with cloud/HTTP/local modes.
- Cons: new infra to run and back up; the existing wrapper stores `hospitalId` but never filters on it; a shared instance risks cross-tenant neighbours.
- Why rejected: tenancy by construction beats tenancy by discipline.

## 5. Proposed Solution

### 5.1 What already exists (reused)
| Concern | Reused from |
|---|---|
| RBAC vocabulary + enforcement | `HPlus-Backend/src/access_permission/{route-hash-map.json, roles.json, action-group-map.json}`, `src/features/auth/ctrl_func.ts:123-190`, `/auth/me` (`src/features/auth/controller/controller.ts:332-411`) |
| Route enumeration | `route-hash-map.json` carries `{method, fullPath, module, submodule, action}` per route; generator `hashCreation.ts` |
| Identity authority | `medoc-auth-service` RS256/JWKS, audiences enum, token-payload builder |
| Webhook + idempotency pattern | `HPlus-Backend/src/features/payment/razorpay/{razorpay.webhook.ts, razorpay.model.ts:129-140, razorpay.service.ts:45-62}` |
| Resilient AMQP + dev phone whitelist | `whatsapp-delivery-service/src/rabbitmqManager.ts`, `src/handler/baseHandler.ts:28-34`; durable+DLQ topology `web_sockets_server/src/webSockets/services/rabbitmqService.ts:31-131` |
| Tasks | `TaskList` in HPlus (`src/features/todos`) and Vigil (`src/features/todos`) |
| Files | `medoc-upload-service` signed-URL flow + `/internal/*` API-key routes |
| OCR | `HPlus-Backend/src/features/OCR/controller/ocr_processor.ts` (Gemini vision, sharp resize) |
| Per-hospital WhatsApp settings | `admin-dashboard-backend/src/models/hospitalPreferences.model.ts:59-62` |
| Tenancy helper | `HPlus-Backend/src/db/db.ts:151-200` (`getCollection`, `getDbName`) |
| Test harness | `Support-Dashboard-Backend` jest config |
| Deploy pipeline | `Medoc_DevOPs/Jenkins/{prod,dev}/backend/*whatsapp-delivery-service` |

### 5.2 High-level architecture

```
WhatsApp user ──► Meta Cloud API ──► nginx /assistant/ ──► medoc-assistant-service (api)
                                                             │ verify signature, dedup ledger, 200
                                                             ▼ RabbitMQ assistant.inbound.q
                                                    medoc-assistant-service (worker)
                                                      ├─ identity: link doc → session → mint token (auth-service /service/assistant-token)
                                                      ├─ permissions: HPlus /auth/me (as user) → expanded set (Redis 5 min)
                                                      ├─ router (Gemini Flash) → tool subset (reviewed ∩ permitted)
                                                      ├─ agent (Gemini Pro, function calling, ≤6 calls)
                                                      ├─ executor: validate → inject → permission gate → kind gate → HTTP as user
                                                      │      ├─ HPlus-Backend  (assistant_service_token, no geofence, x-assistant-message-id)
                                                      │      └─ medoc_plus_backend (read-only nurse flows)
                                                      ├─ writes → AssistantPendingActions → Confirm/Cancel buttons → execute
                                                      ├─ RAG: ingest (upload-service) → extract → chunk → embed → Atlas $vectorSearch (permission filter in query)
                                                      └─ outbound → assistant.outbound.q → Meta (text / interactive / template / document)
Axon "Ions" & Vigil section ◄── HPlus / Vigil /assistant/* read routes ◄── hos_X_db.Assistant* collections
Admin dashboard ◄── toggle, categories, links, audit (createdFrom=WHATSAPP in ClickHouse)
```

### 5.3 Key changes
1. **New service `medoc-assistant-service`** (TypeScript, tsup, native Mongo driver, layered MVC, port 4010, two PM2 processes: api + worker).
2. **Identity bridge**: new audience `assistant_service_token` + app name `assistant` in `medoc-auth-service`; link collection `MedocGlobal_DB.assistant.whatsapp_links`; service-key endpoints to mint 10-minute tokens and manage links; HPlus `verifyJWT` accepts the new audience behind a feature flag and skips the geofence for it only; Vigil accepts it too.
3. **Tool catalogue**: generated from `route-hash-map.json` + TS-AST parameter extraction + Zod (where present) + Bruno hints + LLM-drafted descriptions, **human-reviewed**, checked in; only `reviewed` entries are ever shown to the model; CI fails when HPlus's route map drifts.
4. **Two-stage tool selection** (router → module subset → embedding rank → ≤40 tools) and a **confirmation state machine** with interactive buttons for every write.
5. **Conversation model** in new collections (`AssistantConversations`, `AssistantMessages`, `AssistantPendingActions`, `AssistantActionItems`, …) in the hospital DB; global link/session/ledger collections in `MedocGlobal_DB`.
6. **Meta Cloud API integration**: signed webhook, dedup ledger, media download, 24-hour window + template registry, status callbacks, rate limits.
7. **RAG**: upload-service `ASSISTANT_DOCS` scope + internal read-URL; extraction (pdf text / Gemini page transcription / mammoth / SheetJS / vision); chunk + embed (`gemini-embedding-001`, 768 dims); **Atlas Vector Search per hospital DB** with the permission filter inside the query; admin-defined categories mapped to RBAC modules; citations and send-back.
8. **Work management**: reuse `TaskList` (fix HPlus enums after a data probe), reminders/escalations via templates, action-item feed.
9. **Ions + Vigil**: HPlus/Vigil `/assistant/*` read routes (hash map regenerated, permissions added), Axon rename Messages → Ions and new `IonsScreen`, Vigil tab that survives check-out.
10. **Admin dashboard**: `assistantEnabled`, languages, categories override, link management, audit filter.
11. **Audit**: `createdFrom=WHATSAPP` + `sourceMessageId` threaded through HPlus action logs into ClickHouse.
12. **Eval + safety tests**: permission matrix (deny before HTTP), tenant isolation for RAG, webhook replay, accuracy eval with CI gate.

Full detail (schemas, endpoints, file paths, sequencing): `implementation.md`. Rationale for each choice: `decisions.md`.

## 6. Success Metrics (test expectations — these become the test queue)

**Identity**
- [ ] When a logged-in Axon user submits their phone and the correct OTP, then the link becomes ACTIVE with `{hospitalId, employeeId}` taken from the token, not the body.
- [ ] When a linked number messages the bot, then a 10-minute `assistant_service_token` is minted and HPlus `/auth/me` succeeds **without** `latitude`/`longitude` headers.
- [ ] When an Axon token (not assistant) is presented without lat/long, then HPlus still rejects it (existing behaviour unchanged).
- [ ] When an admin revokes a link, then the next inbound message from that number is denied and the cached token is gone.
- [ ] When a number is linked to two hospitals, then the bot asks which hospital before any tool runs.

**Authorization**
- [ ] When a nurse without `newFinance.*` asks for a bill, then no finance tool is offered and the executor throws Forbidden before any HTTP call.
- [ ] When the model emits a `hospitalId` argument, then the executor strips it and injects the session's hospital.
- [ ] When a tool is `draft` or `excluded` in the catalogue, then it is never in the model's tool list.

**Writes**
- [ ] When the agent proposes a write, then nothing is written until the user taps Confirm; tapping Confirm twice executes once.
- [ ] When a pending action is older than 10 minutes, then Confirm replies "expired" and nothing executes.
- [ ] When a write executes, then an action log with `createdFrom=WHATSAPP` and the WhatsApp message id appears in ClickHouse.

**WhatsApp**
- [ ] When Meta delivers the same message twice, then it is processed once.
- [ ] When a webhook carries an invalid `X-Hub-Signature-256`, then it is rejected with 401 and nothing is queued.
- [ ] When the 24-hour window is closed, then a reminder is sent as an approved template, never as free text.

**RAG**
- [ ] When HR uploads a leave policy under "HR", then a nurse with `hr.*` view gets a cited answer and a nurse without it gets "no documents you can access".
- [ ] When hospital A queries, then no chunk from hospital B is ever returned (different DB).
- [ ] When a scanned PDF has no text layer, then Gemini page transcription produces searchable chunks.

**Work management**
- [ ] When a task is created by the bot, then it appears in `TaskList` with a status Vigil's enum accepts and in the Axon/Vigil action-items feed.
- [ ] When a reminder is due and the assignee is linked, then they receive the template; if not linked, an action item is recorded.

**Ions / Vigil**
- [ ] When a staff member opens Ions, then they see only their own transcripts; a supervisor sees action items but not transcripts; super_admin can open any transcript.
- [ ] When a Vigil nurse is checked out, then the Assistant tab is still visible.

**Quality**
- [ ] When the eval set runs, then module routing ≥ 90 %, false-write rate 0 %, reply-language match ≥ 95 % for EN/HI, before a module is enabled for a hospital.

## 7. Risks
| Risk | Mitigation |
|---|---|
| `/auth/me` is permission-gated and default roles seed empty, so whole roles could get zero tools | M0 verification on a real hospital DB; fallback: exempt self-read of `/auth/me` in HPlus permission middleware |
| HPlus `verifyJWT` change is on every request for every hospital | Additive branch behind `ASSISTANT_AUDIENCE_ENABLED`; single-commit revert; unit test with local RS256 keys |
| Meta Business verification / template approval lead time | Start week 1; dev number + whitelist for M0–M3 |
| Vertex model or embedding not served in `asia-south1` | Verify in M0; owner decision if residency must change |
| Atlas tier lacks Vector Search | Verify in M0; per-hospital index creation scripted + lazy |
| Agent picks wrong tool / wrong language | Eval set + CI gate; confirm button on all writes; reads only until M2 |
| Catalogue drifts from HPlus routes | CI hash check; Jenkins warn stage in HPlus |
| Tightening `TaskList` enums breaks existing rows / Axon client | Data probe + case normalisation before enum change |
| WhatsApp template cost for reminders | Per-hospital daily cap + usage metering |
| DPDP: PHI over WhatsApp and to LLM | Consent at link time; retention TTLs; Google DPA review (owner) |
| No durable in-app push | Documented gap; unlinked assignees see tasks on open |
