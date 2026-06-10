#!/usr/bin/env bash
# Prints the CHANGELOG.md section for a given version (body only, no heading).
# Used by the release pipeline to build GitHub Release notes. Fails if the
# section is missing or empty, so a release without changelog notes is blocked.
set -euo pipefail

version="${1:?usage: release-notes.sh <version> [changelog-path]}"
changelog="${2:-CHANGELOG.md}"

# Match headings literally with index() (a regex would treat the dots in the
# version as wildcards).
notes="$(awk -v ver="$version" '
  index($0, "## [" ver "]") == 1 { found = 1; next }
  found && index($0, "## [") == 1 { exit }
  found { print }
' "$changelog")"

# Trim leading and trailing blank lines.
notes="$(printf '%s\n' "$notes" | sed -e '/./,$!d' | sed -e ':a' -e '/^\n*$/{$d;N;ba' -e '}')"

if [ -z "$notes" ]; then
  echo "error: no CHANGELOG section found for version $version in $changelog" >&2
  exit 1
fi

printf '%s\n' "$notes"
