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
# matching is done by slug, split into '-'-delimited tokens and compared
# as an ordered sequence: one side must be a token-for-token prefix of the
# other (e.g. seed / seed-data -> tokens [seed] is a prefix of [seed,
# data] -> related; scripts/seed.ts -> tests/seed-data.test.ts passes
# without an exact name match). This is deliberately NOT raw substring
# containment — an earlier version of this script used substring matching
# and a code review on this ticket's own PR found it let lib/ingest/auth.ts
# (slug "ingest-auth") incorrectly correlate with tests/auth.test.ts (slug
# "auth"), since "auth" is a trailing substring of "ingest-auth" with no
# word-boundary check. Token-sequence prefix matching, aligned from the
# start, rejects that (first tokens "ingest" vs "auth" don't match) while
# still allowing the intentional broader-test-covers-narrower-file case.
#
# Route files with bracketed dynamic segments (app/api/x/[id]/route.ts)
# get two candidate slugs: one with the segment kept as a literal token,
# one with it dropped entirely — because this repo's own naming isn't
# consistent (documents/[id]/route.ts -> tests/documents-id-route.test.ts
# keeps it; clients/[accountId]/brief/route.ts -> tests/clients-brief-
# route.test.ts drops it). Either form is accepted.
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

# React components are conventionally PascalCase (components/ComplianceChart.tsx)
# while this repo's tests/ directory is conventionally kebab-case
# (tests/compliance-chart.test.tsx) — confirmed by every existing components/
# test (ai-badge, coach-brief-card, form-field, weekly-analysis, ...). Without
# this, a PascalCase segment never token-matches its kebab-case test slug at
# all (not even the first token: "ComplianceChart" vs "compliance"), so every
# multi-word component would fail this gate regardless of test coverage.
to_kebab() {
  local s
  s=$(printf '%s' "$1" | sed -E 's/([a-z0-9])([A-Z])/\1-\2/g')
  printf '%s' "$s" | tr '[:upper:]' '[:lower:]'
}

# Emits one slug per line: the "keep" variant always, and a "drop" variant
# too when the path has a bracketed segment (e.g. "[id]" or "[accountId]").
emit_source_slugs() {
  local area="$1" f="$2"
  local rest="${f#"$area"/}"
  if [ "$area" = "app" ]; then
    rest="${rest#api/}"
  fi
  # Strip whatever extension the last path segment has, generically --
  # source files under these areas aren't only .ts(x) (scripts/*.sh,
  # app/**/*.css, components/**/*.ico all exist today). A hardcoded
  # .ts/.tsx-only strip left .sh files with the extension still attached,
  # which broke token equality against the (extension-free) test slug.
  rest="${rest%.*}"

  local IFS_OLD="$IFS"
  IFS='/'
  local -a segs
  read -ra segs <<< "$rest"
  IFS="$IFS_OLD"

  local -a keep_parts=() drop_parts=()
  local seg has_bracket=false stripped
  for seg in "${segs[@]}"; do
    case "$seg" in
      \[*\])
        has_bracket=true
        stripped="${seg#\[}"
        stripped="${stripped%\]}"
        keep_parts+=("$(to_kebab "$stripped")")
        ;;
      *)
        keep_parts+=("$(to_kebab "$seg")")
        drop_parts+=("$(to_kebab "$seg")")
        ;;
    esac
  done

  ( IFS=-; echo "${keep_parts[*]}" )
  if [ "$has_bracket" = true ] && [ "${#drop_parts[@]}" -gt 0 ]; then
    ( IFS=-; echo "${drop_parts[*]}" )
  fi
}

slugify_test() {
  local base="${1##*/}"
  base="${base%.test.tsx}"
  base="${base%.test.ts}"
  base="${base%.spec.tsx}"
  base="${base%.spec.ts}"
  echo "$base"
}

# True if one slug's '-'-delimited tokens are an exact, order-aligned
# prefix of the other's (in either direction). Word-boundary aware by
# construction — no raw substring containment.
tokens_prefix_match() {
  local a="$1" b="$2"
  if [ -z "$a" ] || [ -z "$b" ]; then
    return 1
  fi

  local IFS_OLD="$IFS"
  IFS='-'
  local -a ta tb
  read -ra ta <<< "$a"
  read -ra tb <<< "$b"
  IFS="$IFS_OLD"

  local len=${#ta[@]}
  if [ "${#tb[@]}" -lt "$len" ]; then
    len=${#tb[@]}
  fi

  local i
  for ((i = 0; i < len; i++)); do
    if [ "${ta[$i]}" != "${tb[$i]}" ]; then
      return 1
    fi
  done
  return 0
}

SOURCE_AREAS=()
SOURCE_SLUGS=()   # parallel to SOURCE_AREAS
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
      while IFS= read -r slug; do
        SOURCE_AREAS+=("$area")
        SOURCE_SLUGS+=("$slug")
      done < <(emit_source_slugs "$area" "$file")
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
  for idx in "${!SOURCE_AREAS[@]}"; do
    [ "${SOURCE_AREAS[$idx]}" = "$area" ] || continue
    src_slug="${SOURCE_SLUGS[$idx]}"
    for test_slug in "${TEST_SLUGS[@]}"; do
      if tokens_prefix_match "$src_slug" "$test_slug"; then
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
    for idx in "${!SOURCE_AREAS[@]}"; do
      [ "${SOURCE_AREAS[$idx]}" = "$area" ] || continue
      echo "    - ${SOURCE_SLUGS[$idx]}"
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
