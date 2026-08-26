# Service Map

37 repositories, ~665k lines of TypeScript/TSX, ~1,870 Dart files, ~851 MB on disk.
All are ZIP snapshots — no `.git` history is present in this workspace.

## Products and their repos

| Product | Persona | Backend | Frontend | Mobile |
|---|---|---|---|---|
| Hospital+ / **Axon** | hospital staff, doctors, hospital admins | `HPlus-Backend` | — | `hospital-plus-frontend` (Flutter), `hospital_plus_build` (web build artifact) |
| Medoc+ / **Vigil** | Medoc super-admins, operators, support | `medoc_plus_backend` | — | `MedocPlus-Frontend-V2` (Flutter), `mplus-web-build` (artifact) |
| DocApp | doctors | `docApp-backend` | — | `DocAssist` (Flutter desktop+mobile) |
| ME | patients / end users | `me-backend` | — | `MedocEUA` (Flutter) |
| Care / NABH compliance | quality & accreditation teams | `compliant-dashboard-backend` | `Medoc-Care-Dashboard-Frontend` | — |
| ABDM | ABHA / national health ID | `medoc-abdm-dashboard-backend` | `medoc-abdm-dashboard-frontend` | — |
| Admin | platform administration | `admin-dashboard-backend` | `Admin-Dashboard-Frontend` | — |
| Support | customer support | `Support-Dashboard-Backend` | `Medoc-Support-Dashboard` | — |
| Outreach | sales / CRM | `Medoc-Outreach-Backend` | `Medoc-Outreach-Frontend` | — |
| Campaign | marketing campaigns | `Campaign-Dashboard-Backend` | — | — |
| Velocity | internal sprint/task tracking, gamified | `Medoc-Velocity-Backend` | `Medoc-Velocity-Frontend` | — |
| Marketing site | public | `Medoc-Main-Website-Backend` | `Medoc-Main-Website` | — |
| Medoc One | unified shell | — | `Medoc-One-Frontend` | — |

## Shared / platform services

| Repo | Role | Notes |
|---|---|---|
| `medoc-auth-service` | identity authority — RS256 JWT issuer, JWKS publisher | port 4003 |
| `medoc-upload-service` | centralised file upload / storage abstraction | Azure Blob + Cloudinary + pdf-lib |
| `medoc-patient-service` | patient domain extraction (in progress) | ESM, `type: module` — the only one |
| `whatsapp-delivery-service` | RabbitMQ consumer → WhatsApp delivery | queues `queue.otp`, `queue.prescriptions`, `queue.schedulers` |
| `medoc-face-auth-service` | face recognition (Python) | DeepFace + ChromaDB + FastAPI/Flask |
| `msf-core` (`@medoc-health/msf-core`) | Medoc Standard Forms engine — pure logic, no IO | consumed by admin, HPlus, medoc_plus, docApp |
| `medoc-backend-health-check` | uptime monitoring | |
| `medoc-bruno-api-collections` | API contracts — 768 Bruno requests | read-only for frontend devs |
| `Medoc_DevOPs` | Terraform + Ansible + Jenkins pipelines | |
| `medoc-docker-repository` | ClickHouse + Redis container configs | |

## Ports (local dev) — note the collisions

| Port | Services |
|---|---|
| 3000 | `me-backend`, `whatsapp-delivery-service` ⚠ |
| 3030 | `compliant-dashboard-backend` |
| 4000 | `docApp-backend`, `medoc-patient-service` ⚠ |
| 4003 | `medoc-auth-service` |
| 5000 | `HPlus-Backend`, `medoc_plus_backend`, `docApp-backend` ⚠ |
| 6000 | `admin-dashboard-backend` |
| 6001 | `Medoc-Velocity-Backend`, `Support-Dashboard-Backend` ⚠ |
| 7000 | `medoc_plus_backend` (alt) |
| 7001 | `Campaign-Dashboard-Backend`, `Medoc-Main-Website-Backend`, `Medoc-Outreach-Backend` ⚠ |
| 8800 | `medoc-abdm-dashboard-backend` |

Running the full stack locally requires overriding `PORT` for several services.

## Inter-service wiring

Discovered from `process.env` usage:

```
MONGODB_URI                    every service (23 refs)
CLIENT_URL                     CORS origin (13)
MEDOC_UPLOAD_SERVICE_URL/_KEY  → medoc-upload-service (7 each)
WHATSAPP_API_ENDPOINT          → WhatsApp BSP (7)
RABBITMQ_URL                   docApp, me-backend (producers) → whatsapp-delivery-service (consumer)
REDIS_URL                      RBAC permission cache, compliant-dashboard
AUTH_JWKS_URL                  → medoc-auth-service /.well-known/jwks.json
AUTH_BRIDGE_URL                → external doctor-registry (PMC/NMC) verification
CLICKHOUSE_HOST                admin-dashboard action logs
PHICOMMERCE_BASE_URL           payment gateway (also Razorpay)
```

Async backbone: **RabbitMQ**. Producers `docApp-backend`, `me-backend`.
Consumer `whatsapp-delivery-service` (singleton `RabbitMQManager`, 5s reconnect backoff, 5 retries).

Analytics: **ClickHouse** for action logs (`admin-dashboard-backend/src/actionLogs/`), buffered and
flushed by a BullMQ worker.

## Architecture and tooling matrix

| Repo | Architecture | Build | husky | Docker | Docs |
|---|---|---|---|---|---|
| admin-dashboard-backend | layered-mvc | tsup | ✓ | ✓ | `docs/` |
| Admin-Dashboard-Frontend | nextjs-app | next | – | ✓ | `docs/` |
| Campaign-Dashboard-Backend | layered-mvc | tsup | ✓ | – | – |
| compliant-dashboard-backend | feature-sliced | tsup | ✓ | – | `SRS/` |
| docApp-backend | feature-sliced | tsup | ✓ | ✓ | per-feature |
| HPlus-Backend | feature-sliced | tsc | ✓ | ✓ | per-feature + `suggestions/` |
| me-backend | domain-flat | tsc | ✓ | ✓ | per-domain |
| medoc_plus_backend | feature-sliced | tsup | ✓ | ✓ | `docs/` |
| medoc-abdm-dashboard-backend | layered-mvc + Brandi IoC | tsup | – | – | **`brain/`** |
| medoc-abdm-dashboard-frontend | nextjs-app | next | – | – | `AGENTS.md` |
| medoc-auth-service | layered-mvc | tsup | – | – | `integration.md` |
| Medoc-Care-Dashboard-Frontend | nextjs-app | next | – | – | `docs/` + ADRs |
| Medoc-Main-Website-Backend | layered-mvc (+Prisma) | tsup | – | – | `docs/` |
| Medoc-Main-Website | nextjs-app | next | – | ✓ | `docs/` |
| Medoc-One-Frontend | nextjs-app | next | – | – | – |
| Medoc-Outreach-Backend | layered-mvc | tsup | ✓ | ✓ | – |
| Medoc-Outreach-Frontend | nextjs-app | next | – | ✓ | – |
| medoc-patient-service | layered-mvc | tsup | – | – | – |
| Medoc-Support-Dashboard | nextjs-app | next | – | ✓ | `docs/` |
| medoc-upload-service | domain-flat | tsup | ✓ | ✓ | `docs/` |
| Medoc-Velocity-Backend | layered-mvc | tsup | ✓ | ✓ | `docs/` |
| Medoc-Velocity-Frontend | nextjs-app | next | – | – | – |
| msf-core | library | tsup | – | – | README |
| Support-Dashboard-Backend | layered-mvc | tsup | ✓ | ✓ | `docs/` |
| whatsapp-delivery-service | domain-flat | tsup | ✓ | ✓ | – |

## Size and health

| Repo | src files | tests | LOC | `any` | `console.log` |
|---|---|---|---|---|---|
| HPlus-Backend | 459 | 1 | 128,123 | 1,379 | 773 |
| Medoc-Main-Website | 474 | 0 | 72,791 | 34 | 60 |
| Medoc-Care-Dashboard-Frontend | 272 | 0 | 61,939 | 93 | 2 |
| medoc_plus_backend | 232 | 1 | 51,375 | 695 | 163 |
| admin-dashboard-backend | 162 | 3 | 44,046 | 963 | 277 |
| Admin-Dashboard-Frontend | 163 | 0 | 42,692 | 68 | 62 |
| Medoc-Velocity-Frontend | 195 | 0 | 41,640 | 263 | 0 |
| compliant-dashboard-backend | 255 | 0 | 39,408 | 740 | 103 |
| docApp-backend | 156 | 2 | 30,234 | 251 | 126 |
| Medoc-Support-Dashboard | 111 | 0 | 26,542 | 10 | 0 |
| Medoc-Outreach-Frontend | 162 | 0 | 22,438 | 40 | 1 |
| Medoc-One-Frontend | 105 | 0 | 20,018 | 263 | 0 |
| me-backend | 88 | 2 | 16,735 | 174 | 104 |
| Medoc-Velocity-Backend | 87 | 2 | 14,636 | 224 | 104 |
| Support-Dashboard-Backend | 60 | 10 | 14,322 | 281 | 69 |
| Medoc-Outreach-Backend | 35 | 1 | 8,529 | 158 | 23 |
| medoc-patient-service | 31 | 0 | 5,397 | 49 | 8 |
| Medoc-Main-Website-Backend | 30 | 1 | 5,064 | 72 | 13 |
| Campaign-Dashboard-Backend | 32 | 1 | 4,359 | 57 | 70 |
| medoc-upload-service | 30 | 2 | 3,765 | 56 | 1 |
| medoc-abdm-dashboard-backend | 40 | 0 | 3,064 | 16 | 2 |
| whatsapp-delivery-service | 25 | 1 | 2,753 | 22 | 3 |
| msf-core | 20 | **5** | 2,535 | **0** | 1 |
| medoc-auth-service | 37 | 0 | 2,239 | 20 | **0** |
| medoc-abdm-dashboard-frontend | 2 | 0 | 98 | 0 | 0 |

Totals: **~665,000 LOC, 32 test files, ~5,900 `any`, ~1,850 `console.log`.**

Flutter: `hospital-plus-frontend` 717 Dart files · `DocAssist` 517 · `MedocPlus-Frontend-V2` 342 · `MedocEUA` 296.
