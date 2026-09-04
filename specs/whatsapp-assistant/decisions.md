# Medoc WhatsApp Assistant — Decisions

Decisions 1–8 were made by the product owner on 2026-09-04. Decisions 9–20 are architectural choices made in planning, grounded in the source; each can be revisited if the stated rationale turns out false.

---

## Decision 1: Phase-1 scope
**Question**: Which workflows must the bot cover first?
| Option | Pros | Cons |
|---|---|---|
| Patient lookup + OPD only | Fast, low PHI, mostly reads | Small utility; fails "replace navigation" goal |
| All workflows + RAG | Full utility from day one | Multi-quarter build; needs a generic architecture |
**Chosen**: All workflows (patient/OPD, IPD, tasks, HR + inventory) **plus** document RAG.
**Rationale**: Owner priority is HMIS replacement and training. **Trade-off accepted**: delivery is milestone-phased (see `implementation.md`); the architecture must be generic (tool catalogue), which is more up-front work than hand-written intents.

## Decision 2: WhatsApp number and provider
| Option | Pros | Cons |
|---|---|---|
| One Medoc number, **Meta Cloud API direct** | Full inbound: webhooks, interactive lists/buttons, Flows, media, statuses | New Meta Business verification; hospital disambiguation needed |
| One number, AiSensy | Existing vendor | Weaker inbound/conversational features; BSP dependency |
| One number per hospital (BYO WABA) | Number identifies tenant | Meta verification per hospital; heavy onboarding |
**Chosen**: One Medoc-owned number on Medoc's own WABA via Cloud API. AiSensy untouched for existing OTP/appointment templates. **Trade-off accepted**: a number cannot be on both platforms, so the bot number is new; multi-hospital staff need a hospital picker.

## Decision 3: Identity and the geofence
| Option | Pros | Cons |
|---|---|---|
| **Link from inside the app + OTP; bot token skips geofence** | Verified identity from the logged-in token; admin revocation; no reliance on free-text phone data | Cross-repo audience change; new token type |
| Inbound OTP challenge from unknown number | No app step | Depends on unverified `Employee.phoneNumber`; needs a global phone index; enumeration risk |
| Keep geofence via WhatsApp location share | Preserves current posture | Friction on every session; spoofable pins |
**Chosen**: Link from inside Axon/Vigil; new audience `assistant_service_token` bypasses the geofence only for assistant tokens. **Trade-off accepted**: staff can act from outside the hospital; the confirm-every-write rule and full audit trail compensate.

## Decision 4: PHI policy and LLM provider
| Option | Pros | Cons |
|---|---|---|
| **PHI OK over WhatsApp and to Gemini via Vertex AI, asia-south1** | Workspace standard (Gemini in 5 repos); India residency; no-training DPA | Must verify model availability in region |
| Anthropic Claude | Strong tool use / long context | New vendor; no India-region residency guarantee |
| Identifiers only over WhatsApp, deep-link to app | Smaller breach surface | Defeats "no navigation" goal |
| No PHI to any LLM | Minimal exposure | Kills RAG over patient documents |
**Chosen**: PHI permitted; Gemini via Vertex in `asia-south1`; embeddings same provider. **Trade-off accepted**: PHI transits Meta and Google; consent text at link time and DPA review are required.

## Decision 5: Write confirmation
**Chosen**: Preview + tap-to-confirm (interactive buttons) for **every** write; reads never confirm; free-text "yes" is not accepted. **Rationale**: many HMIS writes are irreversible (bill numbers, stock ledger); a uniform rule is simpler and safer than a per-tool risk classification. **Trade-off accepted**: one extra tap for low-risk writes.

## Decision 6: Document access model
| Option | Pros | Cons |
|---|---|---|
| Hospital-wide, uploader picks audience | Flexible | Governance depends on each uploader's judgement |
| **Strictly role-mapped by admin-defined category** | Central governance; consistent with RBAC | Needs an admin UI and a classification step |
| Hospital-wide for everything | Simplest | Any staff could read salary sheets or patient reports |
**Chosen**: Admin-defined categories mapped to RBAC modules; bot classifies, uploader confirms (must hold a module in that category); retrieval filters by the asker's modules **inside the vector query**. **Trade-off accepted**: uploads are not searchable until categorised.

## Decision 7: Transcript visibility
**Chosen**: Own transcripts + supervisors see action items only + super_admin audit. **Rationale**: preserves oversight of work without discouraging HR/grievance use. **Trade-off accepted**: managers cannot read raw conversations of their reports.

## Decision 8: Input modes (phase 1)
**Chosen**: EN/HI/regional text with reply-in-kind, voice notes (transcribed), photos (OCR). **Trade-off accepted**: per-language accuracy for medical terms must be evaluated; regional template variants add approval overhead.

---

## Decision 9: New service vs feature inside HPlus
| Option | Pros | Cons |
|---|---|---|
| **New `medoc-assistant-service`** | Public webhook, raw-body signing, long-running consumers, Vertex SDKs, per-hospital vector collections, independent deploy | Token minting + HTTP hop to HPlus |
| Inside HPlus | Direct DB access | HPlus global chain requires GPS + RBAC per route (`apiRouter.ts:66`); `express.json` has no raw-body hook (`server.ts:156`); `tsc` legacy build |
**Chosen**: New service, layered MVC on the `medoc-auth-service` pattern, two PM2 processes (api + worker). **Trade-off accepted**: one more service to deploy; HPlus stays the single enforcement point (defence in depth).

## Decision 10: Token issuance — mint-on-demand vs per-link refresh token
**Chosen**: auth-service `POST /service/assistant-token` (x-service-key) mints a 10-minute RS256 token per `{phone, hospital}`; Redis cache TTL-30 s; checks link ACTIVE, credential not DISABLED/LOCKED, hospital `assistantEnabled`. **Rationale**: revocation is immediate; nothing long-lived at rest; no new refresh path in auth-service (existing refresh is HS256 and userId-scoped, `jwt.service.ts:112-128`). **Trade-off accepted**: one auth-service call per 10 minutes per active user.

## Decision 11: Who owns the WhatsApp-link record
**Chosen**: `medoc-auth-service` owns `MedocGlobal_DB.assistant.whatsapp_links` and the mint/upsert/revoke endpoints; the assistant service owns the OTP UX (it alone can send WhatsApp) and reads the collection read-only. **Rationale**: one writer for an identity record; the identity authority stays the authority. **Trade-off accepted**: two service-key endpoints instead of direct writes.

## Decision 12: HPlus `verifyJWT` change shape
**Chosen**: accept `["axon_service_token","assistant_service_token"]`; for assistant tokens skip the lat/long requirement (`ctrl_func.ts:292-294`) and geofence (`:331-344`) only, keep employee/hospital checks, require `x-assistant-message-id`; gated by `ASSISTANT_AUDIENCE_ENABLED`; set `createdFrom`/`sourceMessageId` in request context so action logs record WHATSAPP. Never touch the dead HS256 middleware or fallback-secret files. **Trade-off accepted**: a change on the hottest path in the workspace; mitigated by flag + unit test.

## Decision 13: Source of effective permissions
| Option | Pros | Cons |
|---|---|---|
| **HPlus `GET /api/auth/me` as the user** | Existing contract the app already depends on; no RBAC re-implementation; HPlus still enforces per call | Gated by `auth.me.view`; must verify coverage |
| Read tenant `Access`/`Roles` directly | No HTTP call | Second RBAC implementation coupled to HPlus's hash JSON; drift risk |
| `/api/permission/employee/permissions` | Returns permissions | Itself permission-gated; most roles lack it |
**Chosen**: `/auth/me` + local wildcard/action-group expansion from a generated `permission-index.json`. **Trade-off accepted**: an M0 check on real data; fallback = exempt self-read of `/auth/me` in HPlus permission middleware.

## Decision 14: Tool catalogue generation — hybrid, human-reviewed
**Facts**: `route-hash-map.json` gives method/path/action for all 777 routes; only 13 HPlus files use Zod; Bruno covers 287/777 with stale bodies (hospitalId in body, old tokens).
**Chosen**: route inventory → TS-AST field extraction (extend `hashCreation.ts` walker) → Zod where present → Bruno as hint → Gemini-drafted description/schema → **human review** promotes to `reviewed`; runtime loads only reviewed; CI fails on HPlus map drift. Bootstrap by module (todo → patient → appointment → ipd → HR/workforce self-service → inventory → labs/radiology). **Trade-off accepted**: parity grows module by module; unreviewed routes are invisible to the bot by design.

## Decision 15: Tool selection — two-stage router + embedding rank
**Chosen**: Gemini Flash router picks ≤3 modules (+ needsRag, isConfirmationReply, language); tool set = reviewed ∩ permitted in those modules; if >40, embedding rank to top 40; built-ins always present; Gemini Pro agent, ≤6 calls / 30 s. **Rationale**: 800 tools per turn is unusable and expensive; deterministic filters run before the model sees anything. **Trade-off accepted**: a router miss hides the right tool; measured by the eval set.

## Decision 16: Conversation storage — new collections, not `Chats`
**Chosen**: `AssistantConversations`, `AssistantMessages`, `AssistantPendingActions`, `AssistantActionItems`, `AssistantDocuments`, `AssistantChunks`, `AssistantDocumentCategories`, `AssistantReminders` in the hospital DB; `assistant.whatsapp_links`, `assistant.sessions`, `assistant.inbound_events`, `assistant.outbound_messages` in `MedocGlobal_DB`. **Rationale**: `Chats` already has two incompatible shapes written by HPlus and Vigil; tenant data must stay in the tenant DB; global collections hold only what is needed before the hospital is known. **Trade-off accepted**: `ECollectionName` must be updated in both backends (cross-repo duty).

## Decision 17: Vector store — MongoDB Atlas Vector Search per hospital DB
| Option | Pros | Cons |
|---|---|---|
| **Atlas Vector Search, `hos_X_db.AssistantChunks`** | Tenancy by construction; permission filter inside `$vectorSearch`; no new infra; same driver discipline | Atlas tier requirement; one index per hospital DB; not runnable in local unit tests |
| ChromaDB (face-auth precedent) | Wrapper exists | New service to run/back up; existing wrapper does not filter tenant at query time |
| Gemini long context, no index | Zero infra | No pre-filtering by permission; cost grows with corpus |
**Chosen**: Atlas Vector Search; index ensured lazily on first ingest + nightly script; `createHospital` not coupled. **Trade-off accepted**: integration tests need the dev Atlas cluster.

## Decision 18: Categories authoring lives in Axon, admin dashboard overrides
**Chosen**: HPlus `/api/assistant/categories` + Axon Accounts screen next to `ManageRoles.dart`; admin dashboard read + override. **Rationale**: the hospital admin already owns RBAC in Axon; the mapping belongs beside the roles. **Trade-off accepted**: two places can edit categories (Axon primary, admin override) — same pattern as role assignment today.

## Decision 19: All writes via HPlus, never Vigil
**Chosen**: Vigil tools are read-only nurse flows with hand-assigned HPlus permission strings; every write goes through HPlus. **Rationale**: Vigil has no permission layer and its todo controller trusts `req.query.hospitalId` (`todoController.ts:12,59`). **Trade-off accepted**: Vigil-only write flows (if any) wait for Vigil to gain RBAC.

## Decision 20: Admin-dashboard functions excluded from phase 1
**Chosen**: No admin-dashboard tools in the bot; admin gets configuration/audit UI only. **Rationale**: admin uses a separate HS256 identity with a fallback-secret hazard; hospital staff are not admin users. **Trade-off accepted**: hospital onboarding/config stays in the dashboard. Revisit via an `x-service-key` `/internal/*` read-only bridge if the owner requires it (open question).

## Decision 21: Real-time delivery to Axon/Vigil = polling
**Chosen**: 15-second poll while the Ions/Assistant tab is visible. **Rationale**: HPlus notifications are an in-memory Map (`notificationModel.ts:39`), per-process, not durable; building a durable channel is out of scope. **Trade-off accepted**: up to 15 s latency in-app; WhatsApp itself is real-time.

## Decision 22 (rev 2, same day): Full phase 1 in 4 weeks with a team of 3 — supersedes rev 1 below
**Chosen**: owner rejected the phase 1a cut and added two engineers. Team = manager driving Claude (owns `medoc-assistant-service` core, contracts, reviews, eval gate), backend engineer (HPlus, auth-service, upload-service, admin dashboard, mirrors, DevOps, `src/rag/**`), Vigil/Flutter dev (`MedocPlus-Frontend-V2`, `medoc_plus_backend`, `hospital-plus-frontend`, E2E operator). Capacity 3 × 18 = 54 sessions/week; planned load 164 of 216. Full Decision 1 scope, nothing deferred. **Rationale**: with three writers the constraint moves from capacity to the serial chain and integration, so the plan is contracts-first (week 1), one writer per repo, weekly integration demo, manager merges everything. **Trade-offs accepted**: manager's build capacity is ~14 sessions/week not 18, the rest is review; three writers raise integration-drift risk (mitigated by the contracts file); go-live still waits on Meta Business verification; regional templates depend on Q6 being answered by Day 0. Overrun rules: M overrun → B takes `src/workmgmt/**`; B overrun → M6 modules beyond the first 3 slip to week 5. Never dropped: T1–T3, T6, T7, T9, T12, T13, T16.

## Decision 22 (rev 1, superseded): Phase 1a scope cut for the 4-week target (owner, 2026-09-04)
| Option | Pros | Cons |
|---|---|---|
| **Cut ~30 % to phase 1a, defer the rest to weeks 5–7** | Fits 72 sessions; keeps every tenancy/permission/audit gate; each week still demoable | Owner's Decision 1 ("all workflows + RAG") lands in two steps, not one |
| Keep full scope, accept lower quality | No re-scoping | Drops tests on `verifyJWT`/executor/tenant isolation — unacceptable under rule 1 |
| Add a second engineer | Full scope in ~4 wk | Owner constraint is one engineer |
**Chosen**: phase 1a = EN + Hindi text; Axon link with OTP; hospital picker; `todo`/`patient`/`appointment` reads; task writes with Confirm + `WHATSAPP` audit + reminders; PDF-only RAG with categories and citations; Axon Ions transcript + action-items tabs; permission-matrix, tenant-isolation and eval gates. Capacity 18 sessions/week (3 × 4 h, 6 days). **Deferred to 1b** (weeks 5–7, design unchanged): Vigil tab, voice/OCR, docx/xlsx/vision, regional templates, admin-dashboard pages, escalation, Ions Documents/Chat tabs, modules beyond 3, load tests. **Rationale**: raw estimate 72–86 sessions + rework does not fit 72 without a cut; the cut removes surfaces, never gates. **Trade-offs accepted**: production go-live still waits on Meta Business verification regardless of build speed; the engineer's same-day review bandwidth, not Claude throughput, is the binding constraint; the week-4 eval gate runs on ~100 gold utterances and is provisional until pilot traffic. Drop order if a week overruns: Ions screen → categories UI → reminder template → eval threshold 90→80 % with owner sign-off. Never dropped: T1–T3, T6, T7, T9, T12, T13, T16.
