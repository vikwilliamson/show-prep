#!/usr/bin/env bash
# Blocks commits/PRs that touch app/lib/components/scripts source files
# without a corresponding test file change in the same diff. This is a mechanical
# proxy for "tests exist alongside this change" — it cannot prove tests
# were literally written first chronologically. Pair it with the TDD
# instruction in AGENTS.md, not as a replacement for actual discipline.
#
# Tests here live in a top-level tests/ directory, not colocated inside
# app/lib/components — so a test-file match anywhere in the diff counts,
# not just ones nested under the source directories.
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

SOURCE_CHANGED=false
TEST_CHANGED=false

while IFS= read -r file; do
  [ -z "$file" ] && continue
  case "$file" in
    *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx)
      TEST_CHANGED=true
      ;;
    app/*|lib/*|components/*|scripts/*)
      SOURCE_CHANGED=true
      ;;
  esac
done <<< "$CHANGED"

if [ "$SOURCE_CHANGED" = true ] && [ "$TEST_CHANGED" = false ]; then
  echo ""
  echo "TDD gate failed: source files changed under app/, lib/, components/, or scripts/"
  echo "but no matching test file (*.test.ts(x) or *.spec.ts(x)) is included"
  echo "in this diff."
  echo ""
  echo "Write or update the test alongside the change. If this change"
  echo "genuinely has no testable behavior, use --no-verify deliberately"
  echo "for local commits — but note CI runs this same check on the PR"
  echo "and will still block the merge."
  echo ""
  exit 1
fi

echo "TDD pairing check passed."
exit 0
