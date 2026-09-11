#!/usr/bin/env sh
set -eu

component="${1:?component is required}"

case "$component" in
  server) prefix="server" ;;
  java) prefix="totoggle_java" ;;
  node) prefix="totoggle_node" ;;
  go) prefix="totoggle_go" ;;
  *) echo "Unknown component: $component" >&2; exit 2 ;;
esac

last_tag="$(git tag --merged HEAD --list "$prefix/v[0-9]*" --sort=-v:refname | head -n 1)"
if [ -n "$last_tag" ]; then
  base_version="${last_tag##*/v}"
  range="$last_tag..HEAD"
else
  base_version="0.0.0"
  range="HEAD"
fi

major=0
minor=0
patch=0

git log --format='%s' "$range" | while IFS= read -r subject; do
  case "$subject" in
    *"($component)"*|*"(all)"*|feat:*|fix:*|perf:*|security:*) ;;
    *) continue ;;
  esac

  if printf '%s\n' "$subject" | grep -Eq '^[a-z]+(\([^)]+\))?!:'; then
    printf 'major\n'
  elif printf '%s\n' "$subject" | grep -Eq '^feat(\([^)]+\))?!?:'; then
    printf 'minor\n'
  elif printf '%s\n' "$subject" | grep -Eq '^(fix|perf|security)(\([^)]+\))?!?:'; then
    printf 'patch\n'
  fi
done > "${TMPDIR:-/tmp}/totoggle-next-version-$$"

trap 'rm -f "${TMPDIR:-/tmp}/totoggle-next-version-$$"' EXIT
while IFS= read -r bump; do
  case "$bump" in
    major) major=1 ;;
    minor) minor=1 ;;
    patch) patch=1 ;;
  esac
done < "${TMPDIR:-/tmp}/totoggle-next-version-$$"

if [ "$major" -eq 1 ]; then
  awk -F. '{ printf "%d.0.0\n", $1 + 1 }' <<EOF
$base_version
EOF
elif [ "$minor" -eq 1 ]; then
  awk -F. '{ printf "%d.%d.0\n", $1, $2 + 1 }' <<EOF
$base_version
EOF
elif [ "$patch" -eq 1 ]; then
  awk -F. '{ printf "%d.%d.%d\n", $1, $2, $3 + 1 }' <<EOF
$base_version
EOF
else
  echo "No releasable Conventional Commit found for $component since ${last_tag:-the first commit}" >&2
  exit 1
fi
