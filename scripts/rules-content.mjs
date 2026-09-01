/**
 * rules-content.mjs — the path-scoped rules generated into each repo's .claude/rules/.
 *
 * These are DISTILLED operational rules, deliberately not copies of brain/. A rule loads
 * whenever Claude touches a matching file, so it is paid for often; the brain files are
 * long-form reference, read on demand. Keep each rule short and imperative, and point at
 * the brain for depth.
 *
 * `kinds` selects which repos get the rule: node-backend | next | flutter | any.
 */
export const RULES = [
  {
    file: "tenancy.md",
    kinds: ["node-backend"],
    paths: ["src/**/*.ts"],
    title: "Multi-tenancy — the boundary you must not cross",
    body: `Medoc is **database-per-hospital**: one physical MongoDB database per tenant, not a
shared collection with a tenant column.

    hos_XXXXXX_db     one database per hospital
    MedocOne_DB       cross-tenant platform data
    MedocGlobal_DB    hospital registry (source of truth for valid tenants)
    Notification_DB   notification fan-out

**Every** data access goes through the shared helper. Never call \`client.db(...)\` directly —
\`getDbName()\` validates the tenant (must match \`hos_\` + 6 chars and exist in the registry)
and that validation *is* the tenant boundary.

\`\`\`ts
import { getCollection } from "@/db/db";
import { ECollectionName, EDBName } from "@/configs/schemaConfig";

// Tenant-scoped — hospitalId comes from the VERIFIED JWT, never from the request
const patients = await getCollection<IPatient>(ECollectionName.PATIENT_LIST, hospitalId);

// Platform-scoped
const hospitals = await getCollection<IHospital>(ECollectionName.HOSPITALS, EDBName.MedocGlobalDB);
\`\`\`

- Collection names come from the \`ECollectionName\` enum — never a string literal.
- Database names come from \`EDBName\` or a validated \`hospitalId\` — never a string literal.
- Multi-document writes use \`withTransaction()\`; it retries transient errors with backoff.
- Aggregations set \`maxTimeMS\` (\`MONGO_AGG_MAX_TIME_MS = 25_000\`).
- Connections idle-close after 10 minutes. Long watchers must call \`startActiveTask()\` /
  \`stopActiveTask()\` or the pool closes under them.

A direct \`.db()\` call outside \`src/db/\` is blocked by the pre-commit hook. If a call is
genuinely legitimate (a cross-database migration helper, say), mark it
\`// invariant-ok: <reason>\` — and get that reason reviewed.

Depth: \`brain/data-layer.md\` in the \`claude_md\` repo.`,
  },
  {
    file: "auth-and-phi.md",
    kinds: ["node-backend"],
    paths: ["src/**/auth/**", "src/**/middleware*/**", "src/**/*[Tt]oken*", "src/**/*[Aa]uth*", "src/**/encryption/**", "src/**/kms/**"],
    title: "Auth, tokens, RBAC and PHI",
    body: `\`medoc-auth-service\` is the identity authority: it signs RS256 JWTs and publishes
\`/.well-known/jwks.json\`. Other services verify locally against JWKS — they do not call the
auth service per request.

- User ids are namespaced per app: \`username@axon\` (Hospital+), \`username@vigil\` (Medoc+).
- **The audience claim is an authorization gate, not a formality**: \`auth_service_token\`
  (normal session), \`set_token\` (first-login password set), \`forgot_token\` (reset),
  \`axon_service_token\`, \`vigil_service_token\`. A \`set_token\` must **never** be accepted on
  a business endpoint.
- Password policy: ≥8 chars, upper + lower + digit + special. 5 failures → 30-minute lockout.
- Never write \`process.env.JWT_SECRET || "…"\`. If the env var is unset that literal signs
  every token and they all become forgeable. Fail fast at boot instead. The pre-commit hook
  blocks this pattern.

**RBAC is hash-based.** Routes are hashed into \`route-hash-map.json\`; a role holds an array of
permission hashes; wildcards grant module-level access; permissions load into Redis at boot.
Adding a route means regenerating the hash map — **a route with no hash returns 404 by design**.
If a new endpoint 404s, the hash map is stale, not the router.

**PHI**: AES-256 for identifiers and clinical text, SHA-256 for reference numbers, tokenisation
for \`doctorId\`. The canonical field list is \`docApp-backend/PII.txt\`. Never put a patient name,
id, diagnosis, contact number, prescription or lab result into a log line or an error message.

The \`encryption/\` and \`kms/\` modules are **copied between services by design** — if you fix one,
fix all of them (see this repo's CLAUDE.md for which).

Depth: \`brain/security.md\` in the \`claude_md\` repo.`,
  },
  {
    file: "backend-style.md",
    kinds: ["node-backend"],
    paths: ["src/**/*.ts"],
    title: "Backend conventions",
    body: `**Two architectures coexist. Match the repo you are in; do not migrate one to the other
opportunistically.** This repo's architecture is stated at the top of its CLAUDE.md.

- *Feature-sliced* — \`src/features/<domain>/{<domain>Controller,Routes,Model}.ts\` plus
  \`models/ validations/ utils/ Readme.md\`. Large domains nest (\`ipd/vitals/\`). Each feature
  carries its own \`Readme.md\` — keep it current, it is often the only spec.
- *Layered MVC* — \`routes/ → controllers/ → services/ → repositories/ → models/\`.

Shared to both:
- Controllers validate input, call services, format the response. No business logic and no
  direct DB access in mature code.
- **Errors are thrown, never returned.** Use the typed classes; one \`errorHandler\` renders them.
- One response envelope: \`{ success, message, data, pagination? }\`.
- \`HttpError\` / \`HttpResponse\` (the HPlus implementations) are the reference — prefer them
  over hand-rolled \`res.status().json()\`.
- Validate env at boot through an \`EnvConfig\` singleton that throws on a missing key
  (\`medoc-auth-service\` and \`whatsapp-delivery-service\` are the reference implementations).
- Path aliases are inconsistent — \`@/*\` in most repos, **bare** in \`HPlus-Backend\`. Check
  \`tsconfig.json\` before importing.

\`strict: true\` is on everywhere. Do not add \`any\` (there are ~5,900 and they are debt, not
precedent) and do not typecast to dodge a type error. Use \`logger\` (winston) where it exists
rather than \`console.log\` (~1,850 already).

Naming: files \`kebab-case.ts\` (layered) or \`<feature>Controller.ts\` (feature-sliced); classes
and interfaces \`PascalCase\` (\`I\`-prefixed interfaces, \`E\`-prefixed enums); functions and vars
\`camelCase\`; constants \`UPPER_SNAKE_CASE\`.

Depth: \`brain/backend-patterns.md\` in the \`claude_md\` repo.`,
  },
  {
    file: "frontend-style.md",
    kinds: ["next"],
    paths: ["src/**/*.tsx", "app/**/*.tsx", "components/**/*.tsx", "src/**/*.ts"],
    title: "Next.js / React conventions",
    body: `**Check the versions before writing.** Next is 15.3→16.3 across this workspace, React
18→19.2, Tailwind 3.4→4.x (v4 is CSS-first — no \`tailwind.config.ts\`). Read \`package.json\`.
If this repo ships an \`AGENTS.md\`, it means the installed Next differs from what you remember:
read \`node_modules/next/dist/docs/\` before writing code.

**Auth differs deliberately between dashboards — follow the repo you are in.**
\`Medoc-Care-Dashboard-Frontend\` uses **HttpOnly cookies** (\`withCredentials: true\`, rehydrate
via \`GET /auth/me\`); the older dashboards use \`Authorization: Bearer\`. Do not harmonise one
into the other without a decision record.

- Components \`PascalCase.tsx\`, hooks \`useThing.ts\`.
- Never trust the client for derived or authorization data — recompute server-side.
- Never put a patient identifier in a URL, query string, analytics event or console log.
- The API contract lives in \`medoc-bruno-api-collections\` and is **read-only for frontend
  devs** — the backend team pushes. If a response shape is wrong, raise it; do not work around
  it silently.

Depth: \`brain/frontend-patterns.md\` in the \`claude_md\` repo.`,
  },
  {
    file: "flutter-style.md",
    kinds: ["flutter"],
    paths: ["lib/**/*.dart", "test/**/*.dart"],
    title: "Flutter conventions",
    body: `**Check the Dart constraint in \`pubspec.yaml\` first.** \`MedocEUA\` is pinned pre-Dart-3
(\`>=2.19 <3.0\`) and will not build on a current toolchain; \`DocAssist\` is on \`^3.7.2\`.

- \`flutter pub get\` → \`flutter run\`. Single test:
  \`flutter test test/foo_test.dart --plain-name "..."\`.
- **Never disable TLS validation.** Several apps here set \`badCertificateCallback => true\`
  globally; that is a defect being carried, not a pattern to copy.
- **Never \`print()\` a session token, patient identifier or any PHI.** Some apps print the
  session token at startup — do not add more.
- Signing keystores must never be committed. Several already are; do not add another.

Depth: \`brain/frontend-patterns.md\` in the \`claude_md\` repo.`,
  },
  {
    file: "delivery.md",
    kinds: ["any"],
    paths: ["Dockerfile", "docker-compose*.yml", "Jenkinsfile", ".github/workflows/*.yml", "*.tf"],
    title: "Build, Docker and deploy",
    body: `- **Install with \`npm ci\`.** \`npm install\` is blocked by \`scripts/enforce-ci.js\`
  (preinstall) in 12 repos, and a husky hook blocks lockfile commits. The one exception is
  \`medoc-auth-service\`, which has no lockfile.
- **Docker shape** (copy it for any new service): multi-stage, pinned \`ARG NODE_VERSION\`,
  \`npm ci --ignore-scripts\`, \`npm audit --audit-level=critical\` in the build stage, non-root
  \`USER node\`, \`HEALTHCHECK\` on \`/health\`, exec-form \`CMD\` so PID 1 receives signals.
  \`HPlus-Backend/Dockerfile\` is the reference. Note the Node pin is **not** universal — some
  frontends and production stages hardcode \`node:22\` / \`node:20\`.
- **Every service exposes \`/health\`.** New services must too.
- **Deploy**: Jenkins → SSH to an Azure VM → clone → unseal Vault, pull secrets, write \`.env\`
  → build → PM2 restart. Infra is Terraform (\`azurerm ~> 3.0\`) + Ansible.
- Secrets come from Vault at deploy time. A secret must never reach a Dockerfile, a compose
  file, a CI config or the repo.

Depth: \`brain/delivery.md\` in the \`claude_md\` repo.`,
  },
];

export function kindOf(live, hasSrcTs) {
  if (live.kind === "flutter") return "flutter";
  if (live.isNext) return "next";
  if (live.kind === "node" && hasSrcTs) return "node-backend";
  return null;
}
