# claude_md — the Medoc Health context system

This repository is how 9 developers and their agents understand 89 repositories. Everything
here is *generated into* or *deployed onto* other places, so a wrong line propagates.

**If you are looking for guidance on a product repo, you are in the wrong place.** Open that
repo — its `CLAUDE.md` is generated from `repos.yaml` here and already carries what you need.

---

## The four layers, and where each one actually loads

| Layer | Lives in | Loads when | Changed by |
|---|---|---|---|
| **Non-negotiable rules** | `managed-policy/CLAUDE.md` → installed to the OS managed-policy path | every session, every repo, on that machine | editing here + **re-running bootstrap on all 9 machines** |
| **Per-repo context** | `<repo>/CLAUDE.md`, checked into each repo | every session in that repo | editing `repos.yaml` + regenerating |
| **Path-scoped rules** | `<repo>/.claude/rules/*.md` | only when Claude touches a matching file | editing `scripts/rules-content.mjs` + regenerating |
| **Personal** | `.claude/settings.local.json`, `CLAUDE.local.md` | that developer only | the developer, gitignored |

The managed-policy layer is **deployed, not pulled**. It does not update on `git pull`. Keep it
short and stable; anything that changes more than a few times a year belongs in a repo's own
`CLAUDE.md` instead.

## Changing what the team sees

```sh
# 1. edit the curated facts
$EDITOR repos.yaml

# 2. regenerate — writes <repo>/CLAUDE.md and <repo>/.claude/rules/ for every repo on disk
node scripts/gen-repo-claudemd.mjs --write

# 3. verify nothing drifted
node scripts/gen-repo-claudemd.mjs --check
```

Then open a PR **in each affected product repo** for its regenerated file. Those repos are on
`main` (production); regenerated context goes through the same review as code.

**Never hand-edit inside a `BEGIN:medoc-generated` block** — it is overwritten on the next run.
Repo owners add their own notes *below* the `END` marker, where the generator preserves them.

## What goes in `repos.yaml`, and what must not

Put in it only what a human knows: is the repo alive, which repo supersedes it, what it is
coupled to, what will hurt you. **Never** put versions, npm scripts, architecture or package
names there — the generator reads those live from each manifest so they cannot go stale.
Duplicating a derivable fact means every future edit has to touch both, and the one you forget
becomes the lie the whole team reads.

## Deep reference

| Need | Read |
|---|---|
| What every repo is, which twin is live, where the secrets are | `WORKSPACE-MAP.md` |
| Multi-tenant DB rules, collections, transactions | `brain/data-layer.md` |
| Auth, tokens, RBAC, PHI encryption | `brain/security.md` |
| Backend conventions + copy-paste patterns | `brain/backend-patterns.md` |
| Next.js / React / Flutter conventions | `brain/frontend-patterns.md` |
| Build, Docker, Jenkins, Vault, deploy | `brain/delivery.md` |
| Known debt, hazards, live incidents | `brain/hazards.md` |
| Repeated agent mistakes and the rules they became | `MISTAKES.md` |
| Onboarding a new developer | `TEAM-SETUP.md` |

`brain/` is long-form reference, read on demand — not auto-loaded. When you learn something
that contradicts a brain file, fix the file in the same change as the code.

## What we are building

A **multi-tenant hospital operating system for the Indian market**: one platform, many
hospitals, many personas, each with its own app. Hospital+ (staff), Medoc+ (operators),
DocApp (doctors), ME (patients), plus compliance, admin and internal tooling.

Three regulatory facts constrain every decision:

- **ABDM / ABHA** — India's national digital health ID. Government API contracts; encryption
  of identifiers is mandatory.
- **NABH 6th Edition (Jan 2025)** — hospital accreditation. The Care Dashboard exists to
  produce auditable evidence.
- **DPDP Act** — Indian data protection. Patient data is PHI.

> If a change touches patient data, assume it is auditable, encrypted and tenant-scoped
> until proven otherwise.

## Versions differ per repo — always read the manifest

There is no single stack version here, and assuming one is the most common source of broken
code. Ranges currently in play: Express 4.18→5.2, MongoDB driver 4.0→7.2, Mongoose absent→9.4,
Zod 3.23→4.3, TypeScript 5.1→6.0, Next 15.3→16.3, Tailwind 3.4→4.x, React 18→19.2,
Dart 2.18→3.7. Each repo's generated `CLAUDE.md` carries its own real version.

Three Next.js repos ship an `AGENTS.md` saying *"this is NOT the Next.js you know — read
`node_modules/next/dist/docs/` first."* Honour it.

## What good looks like

When you need a reference implementation, these are the highest-quality code in the workspace:

| Concern | Reference |
|---|---|
| Pure domain logic, tests, docs | `msf-core` |
| Service structure, env validation, DI | `medoc-auth-service` |
| Error/response abstractions | `HPlus-Backend/src/errors/` |
| Tenant-safe data access, transactions | `HPlus-Backend/src/db/db.ts` |
| Resilient messaging | `whatsapp-delivery-service/src/rabbitmqManager.ts` |
| Backend test harness | `Support-Dashboard-Backend` |
| Dockerfile | `HPlus-Backend/Dockerfile` |
| Frontend architecture + ADRs | `Medoc-Care-Dashboard-Frontend/docs/` |

The newest services are markedly cleaner than the oldest. **The direction of travel is: native
Mongo driver, no Mongoose, `tsup`, typed errors, validated env, DI, small features, real
tests.** Write new code at the front of that trend, not the back.

## Be honest about state

~32 test files across ~665k lines of TypeScript, and four repos declare `"test": "jest"` while
shipping no jest config — a green-looking run there means nothing. If you cannot verify a
change, say so plainly rather than implying it is covered.

---

**This system is working if:** no new secret lands in a repo; no tenant-scoping bug ships; the
`any` count falls from ~5,900 and `console.log` from ~1,850; `brain/hazards.md` shrinks instead
of rotting; nobody implements in a dead twin; and `MISTAKES.md` gains rows — because rows mean
the team is capturing what it learns instead of relearning it.
