# Security, Auth and PHI

## Identity

`medoc-auth-service` is the authority. It signs **RS256** JWTs with a private key and publishes the
public key set at **`/.well-known/jwks.json`**. Consuming services verify tokens locally against that
JWKS (`AUTH_JWKS_URL`); they do not call the auth service on every request.

Key generation: `npm run generate:keys` (`scripts/generatePrivateAndPublicKeys.ts`).
Key paths come from `PRIVATE_KEY_PATH` / `PUBLIC_KEY_PATH`.

## App namespacing

User ids are namespaced by app: `username@axon`, `username@vigil`.

| App | Internal name | Persona |
|---|---|---|
| Hospital+ | **Axon** | hospital staff, doctors, hospital admins |
| Medoc+ | **Vigil** | Medoc super-admins, operators, support |

The token payload is built per app (`utils/token-payload.utils.ts`): both Axon and Vigil include
`employeeId` on top of the default `{ userId, hospitalId, appName }`.

## Audience is an authorization gate

```ts
enum EAudience {
  AUTH_SERVICE_TOKEN = "auth_service_token",  // normal authenticated session
  SET_TOKEN          = "set_token",           // first-login: may ONLY call /auth/set-password
  FORGOT_TOKEN       = "forgot_token",        // reset:      may ONLY call /auth/reset-password
  VIGIL_TOKEN        = "vigil_service_token",
  AXON_TOKEN         = "axon_service_token",
}
```

**Verify the audience, not just the signature.** A `set_token` presented to a business endpoint must
be rejected with 403. This is the difference between a password-reset flow and a full account takeover.

## Auth flows

1. **Password login** — `POST /auth/login { userId, password }` → `accessToken`.
2. **First login** — user is created with a one-time `FIRST_LOGIN` passkey. Login with it returns a
   `set_token`; the frontend detects `audience === "set_token"` and forces a password-set screen.
3. **Forgot password** — support issues a `FORGOT_PASSWORD` passkey → `POST /auth/forgot-password`
   returns a `forgot_token` → `POST /auth/reset-password`.
4. **Change password** — authenticated, requires `currentPassword`.

Passkeys are single-use: they expire at `expiresAt` or on first successful use (`status = USED`).

## Password and account policy

- ≥8 characters, ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special from `` @$!%*?&^#()[]{}_-=+|:;"'<>,./~` ``
- Regex: `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#()[\]{}\-_=+|:;"'<>,./~`\\]).{8,}$/`
- **5 consecutive failures → 30-minute lockout**, returned as 401 `"Account is locked. Please try again later."`
- Disabled accounts → 401 `"Account is disabled."`
- Password history is tracked (`models/password-history.model.ts`) — do not allow reuse.
- Hashing: `argon2` in newer services, `bcrypt` in older ones. Prefer **argon2** for anything new.

## Frontend token handling — deliberately divergent

| Approach | Repos | Mechanics |
|---|---|---|
| **HttpOnly cookie** (preferred) | `Medoc-Care-Dashboard-Frontend` | `withCredentials: true`; token never touches JS; `AuthInitializer` calls `GET /auth/me` once on mount to rehydrate Redux; `VerifiedLayout` guards routes |
| **Bearer header** | older dashboards | token in memory/storage, `Authorization: Bearer` |

ADR `Medoc-Care-Dashboard-Frontend/docs/decisions/001-cookie-auth.md` records the reasoning:
cookies eliminate XSS token theft and remove frontend refresh logic, at the cost of needing
`SameSite`/CORS configuration and **server-side CSRF protection**.

Follow the convention of the repo you are in. Migrating one to the other is an architectural
decision that needs a new ADR, not a drive-by change.

## RBAC — hash-based permissions

Implementation: `HPlus-Backend/src/middlewares/permissionMiddleware.ts` + `src/access_permission/`.

```
route pattern  ──hash──▶  "110c2687d57a"
role           ──────────▶ { roleId, roleName, permissions: [hash, ...] }
employee       ──────────▶ { employeeId, roleId, extraPermissions: [hash, ...] }
```

- `route-hash-map.json` maps hash ↔ route, with `{ module, submodule, action }`.
- `action-group-map.json` holds **wildcard patterns** granting module- or submodule-level access.
- Maps are loaded into **Redis** at boot (`configs/rbacRedisService.ts`) and optimised into
  `Set`-backed structures for O(1) lookups.
- Effective permissions = role permissions ∪ employee `extraPermissions`.

> **`routeNotFoundHandler` returns 404 for any route with no hash entry.** If a newly added endpoint
> 404s, the hash map is stale — regenerate it. This is by design: unregistered routes are invisible.

## PHI / PII handling

Canonical field list: `docApp-backend/PII.txt`.

**AES-256 encrypt** — `patientId`, `patientName`, `patientContactNumber`, `patientEmail`,
`patientAadhaarNumber`, `patientPanNumber`, `patientInsuranceNumber`, address/city/state/country,
nationality, marital status, occupation, emergency contacts, guardian, religion, caste, sub-caste,
disability status, `diagnosis` (provisional/final), `labTestResults`, `medicationsPrescribed`,
`medicationDosage`, `prescriptionId`, `treatmentNotes`, `surgicalProcedures`, `postSurgicalCare`,
`counselingSessions`, `palliativeCare`, `homeCareInstructions`, `insuranceApprovalStatus`, `billingNotes`.

**SHA-256 hash** — `invoiceNumber`, `insurancePolicyNumber`, `insuranceClaimNumber`, `labTestId`,
`admissionId`, `emergencyVisitId`, `patientDOB`.

**Tokenise** — `doctorId`.

The `encryption/` and `kms/` modules are **duplicated by design** across `me-backend`,
`docApp-backend`, and `medoc_plus_backend` — their READMEs say "to use this in other apps just copy
this folder and replace the client header". **A fix in one must be applied to all three.** This is
known debt; consolidating into a shared package is the right long-term move.

## ABDM (national health ID) specifics

From `medoc-abdm-dashboard-backend/brain/`:

- Multi-tenant by hospital ABDM credentials: each `IABDMUser` carries `clientId`, `clientSecret`,
  `xhipId`, `bridgeWebhookPrefix`.
- `AbdmConfig { clientId, clientSecret, baseUrl, xCmId }` is passed to **every** service call —
  services are stateless, config arrives at call time.
- Always encrypted before transmission: `aadhaar`, `mobile`, `OTP`, `email`, `abhaAddress`, `profilePhoto`.
- Algorithm: `crypto.publicEncrypt({ RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' })`, key fetched fresh
  from `GET /abha/api/v3/profile/public/certificate`.
- Three-step token chain: session `accessToken` → `T-token` → `X-token`.
- Auto headers: `X-CM-ID`, `REQUEST-ID` (UUID), `TIMESTAMP` (ISO8601), `Authorization: Bearer`.

## Transport and middleware hygiene

- `helmet` — actually mounted in only `medoc-auth-service`, `HPlus-Backend`, `medoc-patient-service`.
  `admin-dashboard-backend` depends on it but never applies it. **Not universal — add it.**
- `express-rate-limit` — auth-service, docApp, HPlus, compliant, Outreach, Velocity, Support.
- CORS: `CORS_ORIGINS` (comma-separated) in auth-service; empty string means allow-all — a
  backward-compatible default that should not survive to production.
- `morgan` for request logging; `winston` for structured logs in newer services.

## Threat notes

- Rate-limit login endpoints specifically, not just globally — lockout alone is enumerable.
- Never return different messages for "user not found" vs "wrong password".
- Log security events (failed logins, permission denials, passkey use) — but never with PHI in the payload.
- `credentialActivityLogger.service.ts` exists in both `auth-service` and `admin-dashboard-backend`; use it.
