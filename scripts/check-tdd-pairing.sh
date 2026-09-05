#!/usr/bin/env bash
# Blocks commits/PRs that touch app/lib/components/scripts source files
# without a test file whose name actually relates to the changed area —
# not just "some *.test.ts(x) exists somewhere in the diff." That looser
# check let real untested logic through (PR #1, #3, #30 — see VIK-118),
# since one unrelated test file anywhere in the diff satisfied it. This
# is still a mechanical proxy for "tests exist alongside this change,"
# not proof tests were written first chronologically — pair it with the
# TDD instruction in AGENTS.md, not as a replacement for actual discipline.
#
# Tests here live in a top-level tests/ directory, not colocated inside
# app/lib/components, and don't mirror that directory structure — so
# matching is done by slug: app/api/documents/[id]/route.ts normalizes to
# "documents-id-route", which must equal, contain, or be contained by a
# changed test file's basename (e.g. documents-id-route.test.ts ->
# "documents-id-route"). The contains-either-way check lets a broader test
# file (e.g. seed-data.test.ts) still cover a narrower source file
# (scripts/seed.ts) without requiring an exact name match.
#
# Correlation is required per top-level changed area (app/, lib/,
# components/, scripts/), not per individual file — at least one changed
# file in that area must relate to at least one changed test file.
#
# Usage:
#   scripts/check-tdd-pairing.sh                  # staged files (local pre-commit)
#   scripts/check-tdd-pairing.sh --range A...B     # a commit range (CI)

set -e

if [ "$1" = "--range" ] && [ -n "$2" ]; then
  CHANGED=$(git diff --name-only "$2")
else
  CHANGED=$(git diff --cached --name-only --diff-filter=ACM)
fi

slugify_source() {
  local f="$1"
  local area="$2"
  local rest="${f#"$area"/}"
  if [ "$area" = "app" ]; then
    rest="${rest#api/}"
  fi
  rest="${rest%.tsx}"
  rest="${rest%.ts}"
  rest="${rest//\[/}"
  rest="${rest//\]/}"
  rest="${rest//\//-}"
  echo "$rest"
}

slugify_test() {
  local base="${1##*/}"
  base="${base%.test.tsx}"
  base="${base%.test.ts}"
  base="${base%.spec.tsx}"
  base="${base%.spec.ts}"
  echo "$base"
}

slugs_related() {
  local a="$1" b="$2"
  if [ -z "$a" ] || [ -z "$b" ]; then
    return 1
  fi
  case "$b" in
    *"$a"*) return 0 ;;
  esac
  case "$a" in
    *"$b"*) return 0 ;;
  esac
  return 1
}

SOURCE_SLUGS=()   # "area|slug" pairs
TEST_SLUGS=()
AREAS_CHANGED=()

area_seen() {
  local needle="$1"
  local x
  for x in "${AREAS_CHANGED[@]}"; do
    [ "$x" = "$needle" ] && return 0
  done
  return 1
}

while IFS= read -r file; do
  [ -z "$file" ] && continue
  case "$file" in
    *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx)
      TEST_SLUGS+=("$(slugify_test "$file")")
      ;;
    app/*|lib/*|components/*|scripts/*)
      area="${file%%/*}"
      SOURCE_SLUGS+=("${area}|$(slugify_source "$file" "$area")")
      if ! area_seen "$area"; then
        AREAS_CHANGED+=("$area")
      fi
      ;;
  esac
done <<< "$CHANGED"

if [ "${#SOURCE_SLUGS[@]}" -eq 0 ]; then
  echo "TDD pairing check passed."
  exit 0
fi

if [ "${#TEST_SLUGS[@]}" -eq 0 ]; then
  echo ""
  echo "TDD gate failed: source files changed under app/, lib/, components/, or scripts/"
  echo "but no test file (*.test.ts(x) or *.spec.ts(x)) is included in this diff."
  echo ""
  echo "Write or update the test alongside the change. If this change"
  echo "genuinely has no testable behavior, use --no-verify deliberately"
  echo "for local commits — but note CI runs this same check on the PR"
  echo "and will still block the merge."
  echo ""
  exit 1
fi

FAILED_AREAS=()
for area in "${AREAS_CHANGED[@]}"; do
  matched=false
  for pair in "${SOURCE_SLUGS[@]}"; do
    pair_area="${pair%%|*}"
    [ "$pair_area" = "$area" ] || continue
    src_slug="${pair#*|}"
    for test_slug in "${TEST_SLUGS[@]}"; do
      if slugs_related "$src_slug" "$test_slug"; then
        matched=true
        break 2
      fi
    done
  done
  if [ "$matched" = false ]; then
    FAILED_AREAS+=("$area")
  fi
done

if [ "${#FAILED_AREAS[@]}" -gt 0 ]; then
  echo ""
  echo "TDD gate failed: changes under the area(s) below have no test file"
  echo "whose name relates to what changed. A test file changing elsewhere"
  echo "in the diff for an unrelated reason doesn't count as coverage:"
  echo ""
  for area in "${FAILED_AREAS[@]}"; do
    echo "  $area/"
    for pair in "${SOURCE_SLUGS[@]}"; do
      pair_area="${pair%%|*}"
      [ "$pair_area" = "$area" ] || continue
      echo "    - ${pair#*|}"
    done
  done
  echo ""
  echo "Add or update a test whose file name relates to the changed source"
  echo "(e.g. lib/rag.ts -> tests/rag.test.ts, scripts/seed.ts ->"
  echo "tests/seed-data.test.ts). If this change genuinely has no testable"
  echo "behavior, use --no-verify deliberately for local commits — but note"
  echo "CI runs this same check on the PR and will still block the merge."
  echo ""
  exit 1
fi

echo "TDD pairing check passed."
exit 0
