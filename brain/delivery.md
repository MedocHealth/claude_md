# Build, Deploy and Operations

## Dependency policy — enforced by tooling

`npm ci` is the **only** permitted install command.

**`scripts/enforce-ci.js`** runs as a `preinstall` hook in 12 repos. It reads `npm_command` and exits
non-zero for anything that is not `ci`. Rationale from the script's own header:

> *"npm install can modify package-lock.json, causing version drifts. npm ci installs exact versions
> from package-lock.json (production-safe). package-lock.json should be treated as immutable in source control."*

**`.husky/pre-commit`** (10 repos) blocks any commit that stages `package-lock.json`:

> *"package-lock.json must NEVER be manually edited or committed. All dependency changes must go
> through npm ci only."*

Override is `git commit --no-verify` — the hook itself calls this *"EXTREMELY rare and needs review"*.

To actually change a dependency: edit `package.json`, regenerate the lockfile deliberately, and land
it as a reviewed change — not as a side effect of a local install.

`npm run audit` = `npm audit --omit=dev --audit-level=critical`, present in most services and run
inside the Docker build, so a critical vulnerability fails the image.

## Build

| Tool | Repos | Output |
|---|---|---|
| **tsup** | most services | `dist/` — ESM `.mjs` (`node dist/index.mjs`) |
| **tsc** | `HPlus-Backend`, `me-backend` | `build/` (`node build/app.js`) |
| **next build** | all Next.js repos | `.next/` |

Dev servers: `tsx watch` (newer) or `nodemon -r tsconfig-paths/register` (older).
`HPlus-Backend` runs `npm run initialize` (index/seed setup) before `nodemon`.

`admin-dashboard-backend` generates templates during build:
`npx ts-node scripts/generate-templates.ts && tsup`.

`whatsapp-delivery-service` copies `public/` and `.env` into `dist/` — note `build:docker` and
`build:ci` variants that deliberately skip the `.env` copy.

## Docker

Reference: `HPlus-Backend/Dockerfile`. Copy this shape for new services.

```dockerfile
ARG NODE_VERSION=24.14.1

FROM node:${NODE_VERSION}-bookworm AS builder
WORKDIR /app/<service>
COPY package.json package-lock.json ./
ENV NODE_ENV=development
RUN npm ci --ignore-scripts
RUN npm audit --omit=dev --audit-level=critical
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN find ./build -name "*.map" -delete          # no source maps in the image

FROM node:${NODE_VERSION}-bookworm AS production
WORKDIR /app/<service>
COPY --from=builder --chown=node:node /app/<service>/build ./build
COPY --from=builder --chown=node:node /app/<service>/package*.json ./
RUN npm ci --ignore-scripts
USER node                                        # non-root
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||5000)+'/health', \
        r => { r.resume(); r.on('end', () => process.exit(r.statusCode===200?0:1)); }) \
        .on('error', () => process.exit(1))"
CMD ["node", "build/app.js"]                     # exec form: PID 1 is node, receives OS signals
```

The non-obvious parts, all deliberate:
- `--ignore-scripts` on `npm ci` — prevents `preinstall`/`postinstall` from running in the image
  (and sidesteps `enforce-ci.js` inside the container).
- Deleting `.map` files — no source disclosure in production.
- `--chown=node:node` + `USER node` — the process never runs as root.
- Exec-form `CMD` — shell form would make PID 1 `/bin/sh`, which does not forward SIGTERM, so
  container stops would hang until killed.

`medoc-upload-service` uses an Alpine variant with `dumb-init` as the entrypoint for reaping —
equally valid.

## Deployment — Jenkins → Azure VM → PM2

Pipelines live in `Medoc_DevOPs/Jenkins/{prod,generic}/{backend,frontend}/`.

Stages, per `Jenkins/prod/backend/HPlus-Backend`:

1. **Clone** — `sshagent` + a `GITHUB_AK_PAT` credential; SSH to the target VM, remove the old
   directory, clone the branch fresh.
2. **Fetch secrets from Vault** — unseal HashiCorp Vault with three unseal keys, `vault login`,
   `vault kv get -format=json secret/<SERVICE>`, then materialise a `.env` file from the JSON.
3. **Build** — `npm ci` + `npm run build`.
4. **Restart** — PM2 process (e.g. `Prod-HPlus-Backend`).

Jenkins credential ids in use: `web-instance-ssh-key-id`, `GITHUB_AK_PAT`, `VAULT_TOKEN`,
`VAULT_UNSEAL_KEY_1..3`.

**This is why no `.env` belongs in a repo.** Vault is the source of truth; the `.env` is generated on
the box at deploy time. Helper scripts `scripts/env2vault-secret.sh` and `env2vault-secret-v2.sh`
push local env files into Vault.

Deploy targets are VM IPs hardcoded in the pipelines (e.g. `74.225.196.45`), with nginx configs in
`Jenkins/nginx-cofig/`.

## Infrastructure

**Terraform** (`Medoc_DevOPs/Infra/Terraform/`), provider `azurerm ~> 3.0`:

- Resource groups `prod-v2` and `dev-v2`.
- Shared `vnet-main` + `subnet-public` in the prod resource group.
- `nsg-main` with inbound rules: SSH 22, HTTP 80, HTTPS 443.
- SSH keypair generated in-Terraform (`tls_private_key`, RSA 4096) and written to
  `private_key.pem` via `local_sensitive_file` — **that file must never be committed**.

> The NSG allows SSH from `source_address_prefix = "*"` (the whole internet). Restricting 22 to a
> bastion or office range is a straightforward hardening win.

**Ansible** (`Medoc_DevOPs/ansible/`) — `playbook.yml` + `inventory.ini` for host configuration.

**Containers** (`medoc-docker-repository/`) — ClickHouse (`config.xml`, `init/01_init_action_logs.sql`)
and Redis (`redis.conf`).

## Observability

- `GET /health` on every service; the Docker `HEALTHCHECK` depends on it.
- `medoc-backend-health-check` polls services and fronts a small dashboard.
- `winston` structured logs; `morgan` HTTP access logs.
- `whatsapp-delivery-service` has a `MonitorService` singleton emitting structured events, protected
  by `MONITOR_USERNAME` / `MONITOR_PASSWORD`.
- `check-disk-space` is a dependency in several services — disk pressure has evidently bitten before.
- ClickHouse holds high-volume action logs, buffered in memory and flushed by a BullMQ worker
  (`admin-dashboard-backend/src/actionLogs/`).
- `Support-Dashboard-Backend` and `Medoc-Velocity-Backend` integrate `@slack/bolt` for alerting
  (`SLACK_BOT_SETUP.md`).

## Git workflow

```
main      production
dev       integration
feature/* bugfix/* hotfix/*
```

Branch from `dev`, PR back into `dev`, review required, squash before merge.

Commits: `type(scope): description` — `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

```
feat(auth): add password reset functionality
fix(api): handle null user in profile endpoint
```

PR expectations: clear title, what/why, how it was tested, screenshots for UI, breaking changes
called out. Review checklist covers typing, no stray `console.log`, tests for new features, updated
docs, performance, accessibility.

## API contracts

`medoc-bruno-api-collections` — 768 Bruno `.bru` requests grouped by service (Admin panel,
Authentication, DocApp, `H+ backend`, `M+ backend`, `ME - Backend`, out-reach, payment, whatsapp
service, DICOM, DA-SYNC, HUDD, encryption, API-Health).

The repo's `PLEASE_READ.md` is explicit: **read-only for frontend developers**, backend team pushes,
`main` is the only branch to pull from.

When you change a request or response shape, update the corresponding `.bru` in the same change.
