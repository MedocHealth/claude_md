# Setting up a Medoc Health developer machine

For 9 developers who each own 2–7 repositories and clone only those. Takes about ten minutes,
once.

## Why this exists

Claude Code loads `CLAUDE.md` from your working directory **and every directory above it**.
Because you clone individual repos rather than the whole workspace, there is no shared parent
directory — so shared context has to reach you two other ways: a machine-wide policy file, and
a `CLAUDE.md` committed inside each repo. That is what the steps below install.

## 1. Clone this repo and bootstrap (once per machine)

```sh
git clone git@github.com:MedocHealth/claude_md.git
cd claude_md
bash scripts/bootstrap.sh            # dry run — shows what it will do
bash scripts/bootstrap.sh --write    # asks for sudo
```

`--write` installs `managed-policy/CLAUDE.md` to the OS managed-policy location. From then on
**every** Claude Code session on your machine carries the non-negotiable rules: tenant
scoping, no committed secrets, no fallback secrets, no PHI in logs.

It needs `sudo` because the managed-policy path is outside your home directory. That is also
what makes it reliable — it cannot be switched off by a personal setting.

Verify: open a session in any Medoc repo and run `/context`. You should see the managed
`CLAUDE.md` listed under **Memory files**.

> **The managed policy is deployed, not pulled.** When it changes, everyone re-runs bootstrap.
> Expect that a couple of times a year, not weekly — anything churnier lives in a repo file.

## 2. Wire the pre-commit guard in each repo you own

```sh
bash scripts/install-invariant-hook.sh /path/to/your-repo            # dry run
bash scripts/install-invariant-hook.sh /path/to/your-repo --write
```

This vendors `scripts/check-invariants.sh` into the repo and calls it from
`.husky/pre-commit`. It blocks commits that add a tenant-boundary bypass, a fallback secret,
or a PHI log line — checking **only the files you staged**, so existing debt does not block you.

Commit that change through a normal PR.

If a flagged line is genuinely correct, mark it `// invariant-ok: <reason>` and get the reason
reviewed. `git commit --no-verify` exists for emergencies; say why in the commit message.

## 3. Read the map once

`WORKSPACE-MAP.md`, end to end. It is long, and you will not remember it — that is fine. The
point is to know that **several products have 2–4 near-identically-named repos and only one is
live**, so that when you see `Medoc-One-Backend` and `MedocOne_backend` you stop and check
instead of guessing.

Each repo's own `CLAUDE.md` opens with a ⛔ banner if it is dormant, so day to day the map
comes to you.

## What you get, and where it comes from

| You see | Because |
|---|---|
| Non-negotiable rules in every repo | managed policy, installed in step 1 |
| "This repo is dormant, the live one is X" | that repo's `CLAUDE.md`, generated from `repos.yaml` |
| That repo's real port, version, build quirks | same file — read live from its manifest, so never stale |
| "If you change this, you must also change…" | same file, from the `couplings:` in `repos.yaml` |
| Tenancy rules, only while editing `src/**/*.ts` | `<repo>/.claude/rules/tenancy.md`, path-scoped |
| A blocked commit when you add a fallback secret | the pre-commit hook from step 2 |

## Changing shared context

Everything shared is reviewed like code.

1. Edit `repos.yaml` (curated facts) or `scripts/rules-content.mjs` (path-scoped rules).
2. `node scripts/gen-repo-claudemd.mjs --write`
3. Open a PR here, **and** a PR in each product repo whose generated file changed.

The gatekeeper approves changes to `repos.yaml`, `managed-policy/` and `scripts/` — see
`CODEOWNERS`. Everyone is expected to open PRs; one person keeps the system coherent.

**Never edit inside a `BEGIN:medoc-generated` block** — the next regeneration overwrites it.
Your own notes go *below* the `END` marker and are preserved.

## When something is wrong

If a generated file says something false, fix `repos.yaml` — not the generated file. Fixing
the output leaves 88 other repos repeating the same error, and your fix disappears on the next
run.

If you hit the same problem twice, add a row to `MISTAKES.md` in that session. That is the
whole mechanism by which this team stops relearning things.
