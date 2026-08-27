#!/usr/bin/env bash
# check-invariants.sh — deterministic guards for CLAUDE.md §2 rules 1, 3 and 4.
#
# Run from a SERVICE repo root (not this repo):
#   bash /path/to/claude_md/scripts/check-invariants.sh          # scan src/
#   bash .../check-invariants.sh --staged                        # only staged .ts files (pre-commit)
#
# Wire into .husky/pre-commit alongside the existing lockfile guard, or into CI
# next to `npm run audit`. Exit 0 = clean, 1 = violations found.
#
# These greps are a floor, not a ceiling: they catch the exact bug classes already
# documented in brain/hazards.md (§1 tenant bypass, §4 fallback secrets, §8 PHI in
# logs). A hit is a violation unless the line carries an explicit, reviewed
# `// invariant-ok: <reason>` marker.

set -u
fail=0

if [ "${1:-}" = "--staged" ]; then
  files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.ts$' || true)
else
  files=$(find src -name '*.ts' -not -path '*/node_modules/*' 2>/dev/null || true)
fi
[ -z "$files" ] && exit 0

check() {
  local label="$1" pattern="$2" exclude="${3:-__NEVER_MATCHES__}"
  local hits
  hits=$(echo "$files" | xargs grep -nE "$pattern" 2>/dev/null \
    | grep -vE "$exclude" | grep -v 'invariant-ok:' || true)
  if [ -n "$hits" ]; then
    echo "✗ $label"
    echo "$hits" | sed 's/^/    /'
    echo
    fail=1
  fi
}

# Rule 1 — tenant boundary: every DB handle goes through getCollection()/getDbName().
# A direct .db() call outside src/db/ bypasses tenant validation (see brain/data-layer.md).
check "Direct MongoClient .db() call outside src/db/ (tenant-boundary bypass)" \
  '(mongoClient|client)\.db\(' \
  'src/db/'

# Rule 3 — no invented fallback secrets. `process.env.X || "literal"` on a secret-like
# key silently signs with a public string when the env var is unset (hazards.md §4).
check "Fallback value on secret-like env var (auth bypass if env unset)" \
  'process\.env\.[A-Za-z_]*(SECRET|KEY|TOKEN|PASSWORD|URI|URL)[A-Za-z_]* *(\|\||\?\?) *["'"'"'\`]'

# Rule 4 — never log PHI. Approximate: console.log mentioning a field from
# docApp-backend/PII.txt. Winston calls are not exempt from the rule, but console.log
# is the documented leak path (~1,850 instances; hazards.md §8).
check "console.log of a PHI field (DPDP disclosure risk)" \
  'console\.log\(.*(patientName|patientContactNumber|patientEmail|patientAadhaar|patientPan|patientInsurance|diagnosis|labTestResult|medicationsPrescribed|treatmentNotes|prescriptionId|MONGODB_URI)'

if [ "$fail" -eq 0 ]; then
  echo "✓ invariants clean"
else
  echo "CLAUDE.md §2 invariant violations above. Fix them, or mark a reviewed"
  echo "exception with '// invariant-ok: <reason>' on the offending line."
fi
exit $fail
