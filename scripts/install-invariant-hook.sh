#!/usr/bin/env bash
# install-invariant-hook.sh — vendor check-invariants.sh into a service repo and wire it
# into that repo's husky pre-commit hook.
#
#   bash scripts/install-invariant-hook.sh --all              # dry run across the workspace
#   bash scripts/install-invariant-hook.sh --all --write
#   bash scripts/install-invariant-hook.sh ../HPlus-Backend --write
#
# WHY VENDOR RATHER THAN REFERENCE: developers clone only the repos they own, so
# claude_md is not guaranteed to be a sibling. The check must live inside the repo that
# runs it. Re-run this script after changing check-invariants.sh to propagate the update.
#
# Idempotent: the hook edit is delimited by markers and re-running replaces the block.

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SOURCE_SCRIPT="$HERE/check-invariants.sh"
WORKSPACE="$(cd "$HERE/../.." && pwd)"
WRITE=0; TARGETS=()

for a in "$@"; do
  case "$a" in
    --write) WRITE=1 ;;
    --all) while IFS= read -r d; do TARGETS+=("$d"); done < <(find "$WORKSPACE" -maxdepth 2 -name .husky -type d -exec dirname {} \; | sort) ;;
    -*) echo "unknown flag: $a" >&2; exit 2 ;;
    *) TARGETS+=("$(cd "$a" && pwd)") ;;
  esac
done
[ ${#TARGETS[@]} -eq 0 ] && { echo "usage: $0 [--all | <repo-path>...] [--write]" >&2; exit 2; }
[ -f "$SOURCE_SCRIPT" ] || { echo "missing $SOURCE_SCRIPT" >&2; exit 1; }

BEGIN_MARK="# >>> medoc-invariants — managed by claude_md/scripts/install-invariant-hook.sh >>>"
END_MARK="# <<< medoc-invariants <<<"

read -r -d '' BLOCK <<'BLOCK_EOF' || true
# >>> medoc-invariants — managed by claude_md/scripts/install-invariant-hook.sh >>>
# Deterministic guards for the non-negotiable rules: tenant-boundary bypass, invented
# fallback secrets, PHI in logs. A prompt rule fails silently when context is busy; this
# does not. Emergency override: git commit --no-verify (and say why in the message).
_medoc_root="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
if [ -f "$_medoc_root/scripts/check-invariants.sh" ]; then
  bash "$_medoc_root/scripts/check-invariants.sh" --staged || exit 1
fi
# <<< medoc-invariants <<<
BLOCK_EOF

changed=0; skipped=0
for repo in "${TARGETS[@]}"; do
  name="$(basename "$repo")"
  hook="$repo/.husky/pre-commit"
  if [ ! -f "$hook" ]; then
    echo "skip   $name — no .husky/pre-commit"; skipped=$((skipped+1)); continue
  fi

  vendored="$repo/scripts/check-invariants.sh"
  needs_vendor=1
  [ -f "$vendored" ] && cmp -s "$SOURCE_SCRIPT" "$vendored" && needs_vendor=0

  if grep -qF "$BEGIN_MARK" "$hook" && [ "$needs_vendor" -eq 0 ]; then
    echo "ok     $name — already wired"; continue
  fi

  if [ "$WRITE" -eq 1 ]; then
    mkdir -p "$repo/scripts"
    cp "$SOURCE_SCRIPT" "$vendored"; chmod +x "$vendored"
    if grep -qF "$BEGIN_MARK" "$hook"; then
      awk -v b="$BEGIN_MARK" -v e="$END_MARK" 'index($0,b){s=1} !s{print} index($0,e){s=0}' "$hook" > "$hook.tmp"
      mv "$hook.tmp" "$hook"
    fi
    # Splice the block in before the final `exit 0` (or append if there is none).
    # awk -v cannot carry embedded newlines, so the block travels via a temp file.
    blockfile="$(mktemp)"; printf '%s\n' "$BLOCK" > "$blockfile"
    lastexit="$(grep -nE '^exit 0[[:space:]]*$' "$hook" | tail -1 | cut -d: -f1 || true)"
    if [ -n "${lastexit:-}" ]; then
      { head -n "$((lastexit - 1))" "$hook"; cat "$blockfile"; echo; tail -n "+$lastexit" "$hook"; } > "$hook.tmp"
    else
      { cat "$hook"; echo; cat "$blockfile"; } > "$hook.tmp"
    fi
    mv "$hook.tmp" "$hook"; rm -f "$blockfile"
    chmod +x "$hook"
    echo "wired  $name"
  else
    echo "would wire  $name$([ "$needs_vendor" -eq 1 ] && echo "  (+ vendor scripts/check-invariants.sh)")"
  fi
  changed=$((changed+1))
done

echo
echo "$([ "$WRITE" -eq 1 ] && echo wired || echo "would wire"): $changed   skipped (no husky): $skipped"
[ "$WRITE" -eq 1 ] || echo "Dry run. Re-run with --write to apply."
